/**
 * _shared/gemini.ts
 * Shared Gemini API helpers for the Walkthrough AI edge functions.
 *
 * Provides:
 *  - callGemini(): a single Gemini 2.5 Flash call with audio + text input
 *  - Retry/backoff handling, INCLUDING a special long-wait path for 429
 *    (rate limit) responses — these are retried silently with a ~60s wait
 *    rather than surfaced as errors
 *  - Robust JSON parsing that survives markdown fences, truncation, and
 *    partial responses
 *  - CORS + JSON response helpers shared by both functions
 */

// ─── CORS ─────────────────────────────────────────────────────────────────────

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/** Return a JSON error response with CORS headers. */
export function errorResponse(message: string, status = 500): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

/** Return a JSON success response with CORS headers. */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

// ─── JSON parsing ─────────────────────────────────────────────────────────────

/**
 * Robustly parse a JSON string from Gemini output.
 * Handles: markdown fences, leading/trailing text, truncation, mismatched braces.
 * Throws a descriptive error if no valid JSON can be extracted.
 */
export function parseJson(raw: string): Record<string, unknown> {
  const text = raw.trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // Attempt 1: direct parse
  try { return JSON.parse(text); } catch { /* fall through */ }

  // Attempt 2: balanced-brace scan — find the outermost complete JSON object
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { /* keep scanning */ }
      }
    }
  }

  // Attempt 3: repair truncated JSON by closing unclosed braces
  const openCount = (text.match(/\{/g) ?? []).length;
  const closeCount = (text.match(/\}/g) ?? []).length;
  if (openCount > closeCount) {
    const repaired = text + "}".repeat(openCount - closeCount);
    try { return JSON.parse(repaired); } catch { /* give up */ }
  }

  throw new Error(
    `No valid JSON found in Gemini response. First 200 chars: ${raw.slice(0, 200)}`
  );
}

// ─── Retry / backoff ──────────────────────────────────────────────────────────

/** Non-rate-limit retries (network errors, 500, 503, garbage responses). */
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;

/** Rate-limit (429) retries — long, silent waits per the product spec. */
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_WAIT_MS = 60_000;

/** Status reported back to the caller so the DB / UI can show "Retrying...". */
export type GeminiCallStatus =
  | { kind: "ok"; text: string }
  | { kind: "rate_limited_retrying"; attempt: number; maxAttempts: number };

/**
 * Sleep helper. Exposed so callers can also wait between Pass 1 / Pass 2
 * when persisting "retrying" status to the DB between attempts.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a request to Gemini 2.5 Flash with audio + text parts.
 * Returns the raw text from the first candidate.
 *
 * Rate-limit handling (429):
 *   - NOT treated as a normal error. We wait ~60s and retry, up to
 *     MAX_RATE_LIMIT_RETRIES times total. Before each wait, `onRetry` is
 *     called (if provided) so the caller can persist a "retrying" status
 *     to the DB for the frontend to poll.
 *   - Only after all rate-limit retries are exhausted do we throw.
 *
 * Other retriable failures (network errors, 500/503, empty/garbage text):
 *   - Retried up to MAX_RETRIES times with exponential backoff, same as before.
 *
 * Throws a human-readable Error on permanent failure.
 */
export async function callGemini(
  apiKey: string,
  textPrompt: string,
  audioBase64: string,
  mimeType: string,
  maxTokens: number,
  options?: {
    temperature?: number;
    /** Called before each rate-limit wait, with the attempt number (1-based). */
    onRateLimitRetry?: (attempt: number, maxAttempts: number) => Promise<void> | void;
    /** Called before each general retry (network/500/503), with the attempt number (1-based). */
    onRetry?: (attempt: number, maxAttempts: number) => Promise<void> | void;
  }
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [
        { text: textPrompt },
        { inline_data: { mime_type: mimeType, data: audioBase64 } },
      ],
    }],
    generationConfig: {
      temperature: options?.temperature ?? 0.1,
      topP: 0.8,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
    },
  };

  const doFetch = () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  let rateLimitAttempt = 0;
  let generalAttempt = 0;

  while (true) {
    let response: Response;
    try {
      response = await doFetch();
    } catch (networkError) {
      // Network-level failure — retry with normal backoff
      generalAttempt++;
      const msg = networkError instanceof Error ? networkError.message : String(networkError);
      console.warn(`[gemini] network error on attempt ${generalAttempt}:`, msg);
      if (generalAttempt > MAX_RETRIES) {
        throw new Error(`Gemini API unreachable after ${MAX_RETRIES + 1} attempts: ${msg}`);
      }
      await sleep(BASE_BACKOFF_MS * Math.pow(2, generalAttempt - 1));
      continue;
    }

    // ── Rate limit (429): silent long wait + retry ──────────────────────────
    if (response.status === 429) {
      rateLimitAttempt++;
      console.warn(`[gemini] rate limited (429) — attempt ${rateLimitAttempt}/${MAX_RATE_LIMIT_RETRIES}`);
      if (rateLimitAttempt > MAX_RATE_LIMIT_RETRIES) {
        throw new Error(
          "AI service is currently rate-limited and didn't recover after several retries. Please try again in a few minutes."
        );
      }
      if (options?.onRateLimitRetry) {
        await options.onRateLimitRetry(rateLimitAttempt, MAX_RATE_LIMIT_RETRIES);
      }
      await sleep(RATE_LIMIT_WAIT_MS);
      continue;
    }

    // ── Other retriable HTTP statuses (500/503) ─────────────────────────────
    if (response.status === 500 || response.status === 503) {
      generalAttempt++;
      console.warn(`[gemini] retriable status ${response.status} — attempt ${generalAttempt}/${MAX_RETRIES}`);
      if (generalAttempt > MAX_RETRIES) {
        throw new Error(`AI service unavailable (${response.status}) after ${MAX_RETRIES} retries. Please try again.`);
      }
      if (options?.onRetry) {
        await options.onRetry(generalAttempt, MAX_RETRIES);
      }
      await sleep(BASE_BACKOFF_MS * Math.pow(2, generalAttempt - 1));
      continue;
    }

    // ── Permanent failures — no retry ───────────────────────────────────────
    if (!response.ok) {
      const errText = await response.text().catch(() => "(unreadable)");
      console.error(`[gemini] HTTP ${response.status}:`, errText.slice(0, 300));
      const userMessage =
        response.status === 400 ? "Invalid request to AI service. Please re-record the walkthrough."
        : `AI service error (${response.status}). Please try again.`;
      throw new Error(userMessage);
    }

    // ── Success — but check for content filtering / empty text ─────────────
    const geminiData = await response.json();
    const candidate = geminiData.candidates?.[0];
    const blockReason = geminiData.promptFeedback?.blockReason;
    const finishReason = candidate?.finishReason;

    if (blockReason) {
      throw new Error(`Recording was blocked by content filters: ${blockReason}. Please re-record.`);
    }
    if (!candidate || finishReason === "SAFETY") {
      throw new Error("Recording was flagged by content filters. Please re-record.");
    }
    if (finishReason === "MAX_TOKENS") {
      console.warn(`[gemini] response was TRUNCATED (finishReason=MAX_TOKENS, maxTokens=${maxTokens}) — the response likely will not parse as valid JSON`);
    } else if (finishReason && finishReason !== "STOP") {
      console.warn(`[gemini] unexpected finish reason: ${finishReason}`);
    }

    const text = candidate?.content?.parts?.[0]?.text;
    if (!text || text.trim().length === 0) {
      generalAttempt++;
      console.warn(`[gemini] empty text on attempt ${generalAttempt}/${MAX_RETRIES + 1}`);
      if (generalAttempt > MAX_RETRIES) {
        throw new Error(
          "AI returned an empty response. This can happen with very short, quiet, or unclear recordings — try recording for at least 30 seconds in a quieter space."
        );
      }
      await sleep(BASE_BACKOFF_MS * Math.pow(2, generalAttempt - 1));
      continue;
    }

    return text;
  }
}

// ─── Audio encoding ───────────────────────────────────────────────────────────

/**
 * Convert an audio Blob to a base64 string for the Gemini API.
 * Processes in 8 KB chunks to avoid stack overflows on large files.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Derive the correct MIME type from a storage file path extension. */
export function mimeTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "webm";
  const map: Record<string, string> = {
    webm: "audio/webm",
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
  };
  return map[ext] ?? "audio/webm";
}
