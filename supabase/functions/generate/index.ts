/**
 * generate/index.ts
 * Supabase Edge Function — Walkthrough AI two-pass document generation.
 *
 * ── Pipeline ──────────────────────────────────────────────────────────────
 *
 * PASS 1 — Extraction (audio → structured JSON + confidence scores)
 *   Runs only when no extraction_data exists yet for this property (i.e.
 *   the first call after recording). Translates non-English audio,
 *   extracts every field into ExtractionData, and persists it.
 *
 *   - If the extraction looks sparse (almost nothing captured), returns a
 *     sparse_audio signal so the client can show a manual fill-in form.
 *   - Otherwise, generate-followups is fired in the background (fire-and-
 *     forget) using THIS extraction so follow-up questions are ready by
 *     the time the user reaches FollowUpStage.
 *
 * PASS 2 — Document generation (structured JSON → final documents)
 *   Runs every time this function is called with existing extraction_data
 *   (i.e. after the user has answered/skipped follow-ups, or re-generates
 *   with different output selections). Pass 1 is NOT re-run — follow-up
 *   answers and/or sparse-form manual data are merged into the stored
 *   extraction_data first, then Pass 2 drafts the documents from that.
 *
 *   On success, the walkthrough audio is deleted from storage (privacy) —
 *   this only happens after Pass 2 succeeds, so audio remains available if
 *   Pass 1 needs to be redone.
 *
 * ── Reliability ──────────────────────────────────────────────────────────
 *   - 429 (rate limit): NOT shown as an error. Waited out (~60s) and
 *     retried up to 3 times total, with `pipeline_status` set to
 *     'retrying_extraction' / 'retrying_generation' so the client can show
 *     a "Retrying..." state instead of a spinner or error.
 *   - Other failures (network, 500/503, malformed/empty JSON): retried
 *     with exponential backoff.
 *   - Every failure path returns a valid JSON response with a clear,
 *     human-readable message — never a silent failure or crash.
 *   - Structured logging at each stage for debugging via Supabase logs.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  CORS_HEADERS, blobToBase64, callGemini, errorResponse, jsonResponse,
  mimeTypeFromPath, parseJson,
} from "../_shared/gemini.ts";
import {
  buildExtractionPrompt, buildTextExtractionPrompt, mergeFollowUpAnswers, normalizeFollowUpAnswer, validateExtraction,
} from "../_shared/extraction.ts";
import { buildGenerationPrompt } from "../_shared/generation.ts";
import { buildDocx, type RoomPhotoMap } from "../_shared/docBuilder.ts";
import { paletteHex } from "../_shared/palette.ts";
import { buildSparseResult, detectSparseExtraction, validateGenerationResponse } from "../_shared/sparse.ts";
import type { ExtractionData, FollowUpQuestion, OutputType } from "../_shared/types.ts";

// ─── Request body shape ────────────────────────────────────────────────────────

interface RequestBody {
  propertyId?: string;
  audioStoragePath?: string;
  /** QA-only pasted walkthrough text; mutually exclusive with audioStoragePath. */
  walkthroughText?: string;
  selectedOutputs?: OutputType[];
  /** Answers to FollowUpStage questions, keyed by question id. */
  followUpAnswers?: Record<string, string>;
  /** Manual fill-in data from the SparseAudioView form, keyed by field name. */
  manualData?: Record<string, string>;
  /** Regenerate one existing document from the saved property record. */
  regenerateOutput?: OutputType;
}

// ─── Background follow-up trigger ────────────────────────────────────────────

/**
 * Fire-and-forget call to generate-followups, using the freshly-created
 * extraction_data. Runs immediately after Pass 1 succeeds so questions are
 * ready before the user reaches FollowUpStage. Failures are logged but
 * never surfaced — FollowUpStage has its own fallback questions.
 *
 * BUGFIX: this used to be called without awaiting and without registering
 * the work with the runtime. Once this function's own response is
 * returned (Pass 2 finishing below), the Deno edge isolate is free to
 * freeze/terminate at any point — there is no guarantee an un-awaited,
 * un-registered fetch() ever reaches generate-followups, let alone
 * completes. In practice this made the DB write a race that frequently
 * lost, which is why follow_up_questions was sometimes never populated
 * despite this code "running". EdgeRuntime.waitUntil() tells the platform
 * to keep the isolate alive until this promise settles, even after the
 * HTTP response has been sent.
 */
function triggerFollowUps(
  supabaseUrl: string,
  authHeader: string,
  apikey: string,
  propertyId: string,
  selectedOutputs: OutputType[]
): void {
  const followUpPromise = fetch(`${supabaseUrl}/functions/v1/generate-followups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      apikey,
    },
    body: JSON.stringify({ propertyId, selectedOutputs }),
  })
    .then((res) => {
      if (!res.ok) console.warn(`[generate] background generate-followups returned ${res.status}`);
      else console.log("[generate] background generate-followups triggered successfully");
    })
    .catch((err) => console.warn("[generate] background generate-followups failed:", err));

  // Keep the isolate alive until the background call settles, instead of
  // letting it race against (and usually lose to) this function's own
  // response being returned a few lines below.
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(followUpPromise);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // ── 1. Authentication ────────────────────────────────────────────────────

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Missing Authorization header. Please sign in again.", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return errorResponse("Invalid or expired session. Please sign in again.", 401);
  }

  // ── 2. Parse and validate request body ──────────────────────────────────

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON request body.", 400);
  }

  const { propertyId, audioStoragePath, walkthroughText, selectedOutputs, followUpAnswers, manualData, regenerateOutput } = body;

  if (!propertyId || typeof propertyId !== "string") {
    return errorResponse("Missing or invalid propertyId.", 400);
  }

  const outputs: OutputType[] = Array.isArray(selectedOutputs) && selectedOutputs.length > 0
    ? selectedOutputs
    : ["listing_pack", "client_summary"];

  // ── 3. Verify property ownership ────────────────────────────────────────

  const { data: property, error: propError } = await adminClient
    .from("properties")
    .select("id, user_id, address, status, audio_storage_path, extraction_data, audio_deleted, selected_outputs, document_paths, document_data_versions, document_regeneration_counts, document_manifest, property_data_version")
    .eq("id", propertyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (propError) {
    console.error("[generate] DB error fetching property:", propError);
    return errorResponse("Database error. Please try again.", 500);
  }
  if (!property) {
    return errorResponse("Property not found or access denied.", 404);
  }

  const resolvedAudioPath: string | null = audioStoragePath || property.audio_storage_path;
  const existingExtraction = property.extraction_data as ExtractionData | null;

  // ── 4. Selective regeneration path ───────────────────────────────────────
  // Regeneration is deliberately one document at a time: it keeps the fast
  // first-generation path unchanged and makes the 3-use limit independent.
  if (regenerateOutput) {
    if (!existingExtraction) return errorResponse("This property has no saved information to regenerate from.", 400);
    const counts = (property.document_regeneration_counts ?? {}) as Record<string, number>;
    const count = Number(counts[regenerateOutput] ?? 0);
    if (count >= 3) return errorResponse("This document has reached its 3 regeneration limit.", 409);
    return await runPass2(
      adminClient, propertyId, property.user_id, property.address, resolvedAudioPath,
      existingExtraction, [regenerateOutput], undefined, undefined, property.audio_deleted === true,
      {
        isRegeneration: true,
        regenerateOutput,
        existingDocumentPaths: (property.document_paths ?? {}) as Record<string, string>,
        existingDocumentDataVersions: (property.document_data_versions ?? {}) as Record<string, number>,
        existingDocumentRegenerationCounts: counts,
        existingDocumentManifest: (property.document_manifest ?? {}) as Record<string, unknown>,
        propertyDataVersion: Number(property.property_data_version ?? 1),
        existingSelectedOutputs: (property.selected_outputs ?? outputs) as OutputType[],
      },
    );
  }

  // ── 5. Decide which pass to run ──────────────────────────────────────────
  //
  // No extraction_data yet AND no manualData → run Pass 1.
  //   (possibly stops early with sparse_audio signal)
  //
  // No extraction_data BUT manualData present → the recording was sparse
  //   and the user has now filled in the sparse form. Build a minimal
  //   extraction from the manual fields and run Pass 2 directly. This
  //   avoids re-running Pass 1 (which would hit sparse again and loop).
  //
  // extraction_data already exists → skip straight to Pass 2.

  if (!existingExtraction) {
    const hasManualData = manualData && Object.keys(manualData).length > 0;
    if (!hasManualData) {
      return await runPass1(
        adminClient, supabaseUrl, anonKey, authHeader,
        propertyId, property.user_id, resolvedAudioPath, property.address, outputs, walkthroughText,
      );
    }

    // Sparse recording + manual form data submitted: build a minimal
    // ExtractionData skeleton from the form values so Pass 2 has something
    // to work with. The manualData merge in runPass2 will fill fact_sheet
    // fields correctly via the pseudoQuestions path.
    console.log(`[generate] sparse+manual path: building minimal extraction for property ${propertyId}`);
    const minimalExtraction: ExtractionData = {
      rooms:            { value: [], confidence: 0 },
      fact_sheet: {
        beds:        { value: "not mentioned", confidence: 0 },
        baths:       { value: "not mentioned", confidence: 0 },
        sqft:        { value: "not mentioned", confidence: 0 },
        year_built:  { value: "not mentioned", confidence: 0 },
        lot:         { value: "not mentioned", confidence: 0 },
        style:       { value: "not mentioned", confidence: 0 },
        price_range: { value: "not mentioned", confidence: 0 },
      },
      features:         { value: [], confidence: 0 },
      renovations:      { value: [], confidence: 0 },
      issues:           { value: [], confidence: 0 },
      highlights:       { value: [], confidence: 0 },
      general_summary:  { value: "not mentioned", confidence: 0 },
      client_notes: {
        preferences:       { value: [], confidence: 0 },
        priorities:        { value: [], confidence: 0 },
        likes:             { value: [], confidence: 0 },
        dislikes:          { value: [], confidence: 0 },
        next_steps:        { value: [], confidence: 0 },
        budget_indicators: { value: "not mentioned", confidence: 0 },
      },
      offer_notes: {
        amount:          { value: "not mentioned", confidence: 0 },
        conditions:      { value: [], confidence: 0 },
        contingencies:   { value: [], confidence: 0 },
        timelines:       { value: "not mentioned", confidence: 0 },
        financing_notes: { value: "not mentioned", confidence: 0 },
      },
      transaction_notes: {
        milestones:     { value: [], confidence: 0 },
        missing_items:  { value: [], confidence: 0 },
        overall_status: { value: "not mentioned", confidence: 0 },
      },
    };
    return await runPass2(
      adminClient, propertyId, property.user_id, property.address, resolvedAudioPath,
      minimalExtraction, outputs, undefined, manualData, property.audio_deleted === true,
    );
  }

  return await runPass2(
    adminClient, propertyId, property.user_id, property.address, resolvedAudioPath,
    existingExtraction, outputs, followUpAnswers, manualData, property.audio_deleted === true,
  );
});

// ─── Pass 1 ───────────────────────────────────────────────────────────────────

/**
 * Run Pass 1 (extraction). Persists extraction_data on success.
 * If the recording is sparse, returns sparse_audio signal WITHOUT
 * persisting extraction_data — so a re-record + re-call starts fresh.
 * If the recording is usable, persists extraction_data, fires
 * generate-followups in the background, and immediately proceeds to
 * Pass 2 so the caller gets documents in one round trip when possible.
 */
async function runPass1(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
  propertyId: string,
  userId: string,
  audioStoragePath: string | null,
  address: string,
  outputs: OutputType[],
  walkthroughText?: string,
): Promise<Response> {
  if (!audioStoragePath && !walkthroughText?.trim()) {
    return errorResponse("Missing walkthrough input. Paste a walkthrough or provide an audio recording.", 400);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    await adminClient.from("properties")
      .update({ status: "error", pipeline_status: "error", error_message: "GEMINI_API_KEY not configured" })
      .eq("id", propertyId);
    return errorResponse("AI service is not configured. Please contact support.", 500);
  }

  // Mark as processing
  await adminClient.from("properties")
    .update({ status: "processing", pipeline_status: "extracting" })
    .eq("id", propertyId);

  // ── Call Gemini — extraction ──────────────────────────────────────────
  console.log(`[generate:pass1] starting ${walkthroughText?.trim() ? "text" : "audio"} extraction for property ${propertyId}`);

  let rawText: string;
  try {
    const onRateLimitRetry = async (attempt: number, max: number) => {
      console.warn(`[generate:pass1] rate limited — retry ${attempt}/${max} after 60s wait`);
      await adminClient.from("properties")
        .update({ pipeline_status: "retrying_extraction" })
        .eq("id", propertyId);
    };
    const onRetry = async (attempt: number, max: number) => {
      console.warn(`[generate:pass1] AI service hiccup — retry ${attempt}/${max}`);
      await adminClient.from("properties")
        .update({ pipeline_status: "retrying_extraction" })
        .eq("id", propertyId);
    };

    if (walkthroughText?.trim()) {
      const prompt = buildTextExtractionPrompt().replace("[PASTED_WALKTHROUGH_TEXT]", walkthroughText.trim());
      rawText = await callTextGemini(apiKey, prompt, 16000, onRateLimitRetry, onRetry);
    } else {
      const { data: audioBlob, error: downloadError } = await adminClient.storage
        .from("walkthrough-audio")
        .download(audioStoragePath!);

      if (downloadError || !audioBlob) {
        console.error("[generate:pass1] audio download error:", downloadError);
        await adminClient.from("properties")
          .update({ status: "error", pipeline_status: "error", error_message: "Audio file not found in storage" })
          .eq("id", propertyId);
        return errorResponse("Could not retrieve your audio recording. It may have been deleted. Please re-record.", 400);
      }

      let audioBase64: string;
      try {
        audioBase64 = await blobToBase64(audioBlob);
      } catch (encodeErr) {
        console.error("[generate:pass1] audio encoding error:", encodeErr);
        await adminClient.from("properties")
          .update({ status: "error", pipeline_status: "error", error_message: "Failed to encode audio" })
          .eq("id", propertyId);
        return errorResponse("Failed to process audio file. Please try re-recording.", 500);
      }

      rawText = await callGemini(
        apiKey, buildExtractionPrompt(), audioBase64, mimeTypeFromPath(audioStoragePath!), 16000,
        { onRateLimitRetry, onRetry }
      );
    }
  } catch (geminiErr) {
    const msg = geminiErr instanceof Error ? geminiErr.message : "AI service error. Please try again.";
    console.error("[generate:pass1] Gemini error:", msg);
    await adminClient.from("properties")
      .update({ status: "error", pipeline_status: "error", error_message: msg })
      .eq("id", propertyId);
    return errorResponse(msg, 502);
  }

  console.log(`[generate:pass1] raw response length: ${rawText.length}`);

  // ── Parse + validate ───────────────────────────────────────────────────
  let extraction: ExtractionData;
  try {
    const parsed = parseJson(rawText);
    extraction = validateExtraction(parsed);
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : "Unreadable AI response";
    console.error("[generate:pass1] JSON parse failure:", msg, "raw snippet:", rawText.slice(0, 300));
    await adminClient.from("properties")
      .update({ status: "error", pipeline_status: "error", error_message: "AI returned an unreadable response" })
      .eq("id", propertyId);
    return errorResponse(
      "The AI returned an unreadable response. Please try again — if this keeps happening, try re-recording with clearer speech.",
      502
    );
  }

  // Structured log of confidence per top-level field, for debugging
  console.log("[generate:pass1] confidence summary:", JSON.stringify({
    rooms: extraction.rooms.confidence,
    rooms_count: extraction.rooms.value.length,
    beds: extraction.fact_sheet.beds.confidence,
    baths: extraction.fact_sheet.baths.confidence,
    sqft: extraction.fact_sheet.sqft.confidence,
    features: extraction.features.confidence,
    issues: extraction.issues.confidence,
  }));

  // ── Sparse check (derived from extraction, no extra Gemini call) ───────
  const detection = detectSparseExtraction(extraction);
  if (detection.isSparse) {
    console.log(`[generate:pass1] sparse extraction — rooms=${detection.capturedRooms.length}`);

    // BUGFIX: previously we returned immediately WITHOUT saving extraction_data.
    // This caused a loop: when the user answered follow-up questions and
    // GenerateStage called analyze() again, the edge function saw no
    // extraction_data, re-ran Pass 1, hit sparse again, and showed the
    // "recording was brief" form a second time — discarding all follow-up answers.
    //
    // Fix: save the sparse extraction to the DB NOW so the next call (after
    // the user answers follow-ups) sees extraction_data and goes straight to
    // Pass 2 with those answers merged in. Also fire generate-followups so
    // FollowUpStage gets targeted questions about the gaps, not just generic
    // fallback questions.
    const { error: saveExtractionError } = await adminClient.from("properties")
      .update({
        extraction_data: extraction,
        status: "recording",
        pipeline_status: "idle",
        workflow_stage: "outputs",
        error_message: null,
      })
      .eq("id", propertyId);

    if (saveExtractionError) {
      console.error("[generate:pass1] failed to save sparse extraction_data (non-fatal):", saveExtractionError);
    } else {
      // Fire generate-followups so the user gets targeted questions about
      // the gaps in their sparse recording, not just generic fallback questions.
      triggerFollowUps(supabaseUrl, authHeader, anonKey, propertyId, outputs);
      console.log("[generate:pass1] sparse extraction saved and generate-followups triggered");
    }

    return jsonResponse(buildSparseResult(detection), 200);
  }

  // ── Persist extraction_data ─────────────────────────────────────────────
  const { error: saveExtractionError } = await adminClient.from("properties")
    .update({
      extraction_data: extraction,
      pipeline_status: "generating",
      workflow_stage: "outputs",
      error_message: null,
    })
    .eq("id", propertyId);

  if (saveExtractionError) {
    console.error("[generate:pass1] failed to save extraction_data:", saveExtractionError);
    // Non-fatal for THIS request — we can still attempt Pass 2 below using
    // the in-memory extraction, but generate-followups won't have anything
    // to read, so skip firing it.
  } else {
    // Fire generate-followups in the background — it reads extraction_data
    // from the DB, so only do this if the save above succeeded.
    triggerFollowUps(supabaseUrl, authHeader, anonKey, propertyId, outputs);
  }

  console.log(`[generate:pass1] extraction complete and saved for property ${propertyId}`);

  // ── Immediately run Pass 2 with no follow-up answers yet ────────────────
  // This means a single call to /generate (right after upload) can return
  // a first draft of documents. If the user later answers follow-ups,
  // calling /generate again re-runs Pass 2 only (extraction_data already
  // exists) with the merged answers.
  return await runPass2(adminClient, propertyId, userId, address, audioStoragePath, extraction, outputs, undefined, undefined, false);
}

// ─── Batched generation ─────────────────────────────────────────────────────

/** Result of generating one batch of document types. */
interface BatchGenerationResult {
  parsed: Record<string, unknown>;
  warnings: string[];
  emptyOutputs: OutputType[];
  /** Set if the Gemini call itself failed (network/API error, unreadable
   *  response) rather than just returning thin content — this batch
   *  contributes nothing, but other batches are unaffected. */
  fatalError?: string;
}

/**
 * Generate one batch of document types with its own dedicated Gemini call
 * and its own full token budget — completely independent of any other
 * batch. A generous per-document budget (6000 tokens, batch capped at 3
 * documents so at most 18000 tokens — well under Gemini's ~65K output
 * limit) makes truncation within a batch unlikely; if a document in this
 * batch still comes back empty, this batch is retried once on its own,
 * same as the old whole-response retry, but scoped small enough to
 * actually fix the specific gap instead of re-rolling everything.
 */
async function runGenerationBatch(
  apiKey: string,
  address: string,
  mergedExtraction: ExtractionData,
  batchOutputs: OutputType[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  propertyId: string,
): Promise<BatchGenerationResult> {
  const prompt = buildGenerationPrompt(address, mergedExtraction, batchOutputs);
  const maxTokens = Math.min(6000 * batchOutputs.length, 24000);

  const onRateLimit = async (attempt: number, max: number) => {
    console.warn(`[generate:pass2:batch ${batchOutputs.join(",")}] rate limited — retry ${attempt}/${max} after 60s wait`);
    await adminClient.from("properties").update({ pipeline_status: "retrying_generation" }).eq("id", propertyId);
  };
  const onHiccup = async (attempt: number, max: number) => {
    console.warn(`[generate:pass2:batch ${batchOutputs.join(",")}] AI service hiccup — retry ${attempt}/${max}`);
    await adminClient.from("properties").update({ pipeline_status: "retrying_generation" }).eq("id", propertyId);
  };

  let rawText: string;
  try {
    rawText = await callTextGemini(apiKey, prompt, maxTokens, onRateLimit, onHiccup);
  } catch (geminiErr) {
    const msg = geminiErr instanceof Error ? geminiErr.message : "AI service error";
    console.error(`[generate:pass2:batch ${batchOutputs.join(",")}] Gemini error:`, msg);
    return { parsed: {}, warnings: [], emptyOutputs: batchOutputs, fatalError: `batch [${batchOutputs.join(",")}]: ${msg}` };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJson(rawText);
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : "Unreadable AI response";
    console.error(`[generate:pass2:batch ${batchOutputs.join(",")}] JSON parse failure:`, msg, "raw snippet:", rawText.slice(0, 300));
    return { parsed: {}, warnings: [], emptyOutputs: batchOutputs, fatalError: `batch [${batchOutputs.join(",")}]: unreadable AI response` };
  }

  let { warnings, emptyOutputs } = validateGenerationResponse(parsed, batchOutputs);

  if (emptyOutputs.length > 0) {
    console.warn(
      `[generate:pass2:batch ${batchOutputs.join(",")}] ${emptyOutputs.length} document(s) came back empty ` +
      `(${emptyOutputs.join(", ")}) — retrying this batch once`
    );
    try {
      const retryText = await callTextGemini(apiKey, prompt, maxTokens, onRateLimit, onHiccup);
      const retryParsed = parseJson(retryText);
      const retryValidation = validateGenerationResponse(retryParsed, batchOutputs);
      for (const outputType of emptyOutputs) {
        if (retryParsed[outputType] && !retryValidation.emptyOutputs.includes(outputType)) {
          parsed[outputType] = retryParsed[outputType];
          console.log(`[generate:pass2:batch ${batchOutputs.join(",")}] retry recovered content for ${outputType}`);
        }
      }
      const revalidated = validateGenerationResponse(parsed, batchOutputs);
      warnings = revalidated.warnings;
      emptyOutputs = revalidated.emptyOutputs;
    } catch (retryErr) {
      console.warn(`[generate:pass2:batch ${batchOutputs.join(",")}] retry failed (non-fatal):`, retryErr);
    }
  }

  return { parsed, warnings, emptyOutputs };
}

// ─── Pass 2 ───────────────────────────────────────────────────────────────────

interface RegenerationOptions {
  isRegeneration: boolean;
  regenerateOutput: OutputType;
  existingDocumentPaths: Record<string, string>;
  existingDocumentDataVersions: Record<string, number>;
  existingDocumentRegenerationCounts: Record<string, number>;
  existingDocumentManifest: Record<string, unknown>;
  propertyDataVersion: number;
  existingSelectedOutputs: OutputType[];
}

/**
 * Run Pass 2 (document generation) from existing extraction_data.
 * Merges any follow-up answers / sparse-form manual data first.
 * On success, persists documents and deletes the audio file (once).
 */
async function runPass2(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  propertyId: string,
  userId: string,
  address: string,
  audioStoragePath: string | null,
  extraction: ExtractionData,
  outputs: OutputType[],
  followUpAnswers: Record<string, string> | undefined,
  manualData: Record<string, string> | undefined,
  audioAlreadyDeleted: boolean,
  regeneration?: RegenerationOptions,
): Promise<Response> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    await adminClient.from("properties")
      .update({ status: "error", pipeline_status: "error", error_message: "GEMINI_API_KEY not configured" })
      .eq("id", propertyId);
    return errorResponse("AI service is not configured. Please contact support.", 500);
  }

  await adminClient.from("properties")
    .update({ status: "processing", pipeline_status: "generating" })
    .eq("id", propertyId);

  // ── Merge follow-up answers / manual sparse-form data ───────────────────
  let mergedExtraction = extraction;

  if (followUpAnswers && Object.keys(followUpAnswers).length > 0) {
    // Diagnostic: confirm answers are reaching this function. If this log
    // shows 0 in Supabase logs while the user clearly answered questions,
    // the problem is in how the frontend is passing followUpAnswers.
    console.log(
      `[generate:pass2] follow-up answers received: ${Object.keys(followUpAnswers).length} answer(s) ` +
      `for property ${propertyId} — keys: ${Object.keys(followUpAnswers).join(", ")}`
    );

    // Re-fetch the stored follow-up questions so we can map answer ids → field paths.
    //
    // BUGFIX: previously this destructured only `data`, silently ignoring
    // any query error. If the query failed (or simply found no row, e.g.
    // due to a transient issue) `prop` was `null`/`undefined`, so
    // `questions` became `[]`. mergeFollowUpAnswers()'s `for (const q of
    // questions)` loop then never executed at all — meaning answers were
    // not just unmapped to a field_path, they never even reached the
    // general_summary fallback. The result: follow-up answers vanished
    // with no error surfaced anywhere, no log line, nothing — exactly the
    // "I answered baths but the document still says not mentioned" bug.
    // Now we check for the error explicitly and log a clear warning if the
    // re-fetch comes back empty, so this failure mode is visible in
    // Supabase logs instead of silently discarding the agent's answers.
    const { data: prop, error: refetchError } = await adminClient
      .from("properties")
      .select("follow_up_questions")
      .eq("id", propertyId)
      .maybeSingle();

    if (refetchError) {
      console.error(
        `[generate:pass2] failed to re-fetch follow_up_questions for property ${propertyId} — ` +
        `follow-up answers cannot be mapped to fields and will be skipped: ${refetchError.message}`
      );
    }

    const questions: FollowUpQuestion[] = Array.isArray(prop?.follow_up_questions) ? prop.follow_up_questions : [];

    // Diagnostic: shows whether generate-followups had time to write questions
    // before this second generate call fired. By the time Pass 2 runs with
    // follow-up answers, the user has spent at minimum ~35s on the poll budget
    // plus however long they spent reading and answering — generate-followups
    // (which only reads from DB and runs deterministic logic) should always
    // have completed well before this point. If this log shows 0 questions
    // while answers were submitted, check generate-followups logs for errors.
    console.log(
      `[generate:pass2] re-fetched follow_up_questions for property ${propertyId}: ` +
      `${questions.length} question(s) found — ` +
      (questions.length > 0
        ? `ids: ${questions.map((q) => q.id).join(", ")}`
        : "NONE — will fall back to appending raw answers to general_summary")
    );

    if (questions.length === 0) {
      // No questions to map answers against. Don't silently drop the
      // agent's answers — fold them into general_summary directly so
      // they still reach the final documents, same as the "couldn't
      // apply to a field_path" fallback inside mergeFollowUpAnswers.
      console.warn(
        `[generate:pass2] no follow_up_questions found for property ${propertyId} while ` +
        `${Object.keys(followUpAnswers).length} follow-up answer(s) were submitted — ` +
        `falling back to appending raw answers to general_summary`
      );
      const rawAnswerNotes = Object.values(followUpAnswers).map(normalizeFollowUpAnswer).filter(Boolean);
      if (rawAnswerNotes.length > 0) {
        mergedExtraction = JSON.parse(JSON.stringify(mergedExtraction)) as ExtractionData;
        const existing = mergedExtraction.general_summary.value === "not mentioned"
          ? ""
          : mergedExtraction.general_summary.value;
        mergedExtraction.general_summary = {
          value: [existing, ...rawAnswerNotes].filter(Boolean).join(" "),
          confidence: 100,
          source: "user_confirmed",
          note: "Supplemented by follow-up answers when the question list was unavailable",
        };
      }
    } else {
      mergedExtraction = mergeFollowUpAnswers(mergedExtraction, questions, followUpAnswers);
      console.log(`[generate:pass2] merged ${Object.keys(followUpAnswers).length} follow-up answers`);
    }
  }

  if (manualData && Object.keys(manualData).length > 0) {
    // Manual sparse-form data: simple field-name → value map.
    // Map common field keys onto fact_sheet / arrays.
    const simpleFieldMap: Record<string, string> = {
      beds: "fact_sheet.beds",
      baths: "fact_sheet.baths",
      sqft: "fact_sheet.sqft",
      year_built: "fact_sheet.year_built",
      price_range: "fact_sheet.price_range",
    };
    const pseudoQuestions: FollowUpQuestion[] = [];
    const pseudoAnswers: Record<string, string> = {};
    let i = 1;
    for (const [key, value] of Object.entries(manualData)) {
      if (!value?.trim()) continue;
      const id = `m${i++}`;
      if (simpleFieldMap[key]) {
        pseudoQuestions.push({ id, question: key, category: "Details", field_path: simpleFieldMap[key] });
      } else if (key === "condition" || key === "features") {
        pseudoQuestions.push({ id, question: key, category: "Details", field_path: key === "condition" ? "issues" : "features" });
      } else {
        pseudoQuestions.push({ id, question: `${key.replace(/_/g, " ")}:`, category: "Details" });
      }
      pseudoAnswers[id] = value;
    }
    mergedExtraction = mergeFollowUpAnswers(mergedExtraction, pseudoQuestions, pseudoAnswers);
    console.log(`[generate:pass2] merged ${Object.keys(manualData).length} manual sparse-form fields`);
  }

  // ── Call Gemini — generation (text-only, no audio) ──────────────────────
  // FIX (was the root cause of "only 2 of 6 documents generate"): a single
  // Gemini call was asked to write ALL selected documents as one JSON
  // object, sharing one token budget (capped at 16000 total). Listing Pack
  // and Client Summary are always first in `outputs` (they're the default
  // selection), so Gemini wrote them first and usually finished them —
  // then ran out of budget partway through whichever document came next,
  // truncating the response. parseJson()'s brace-repair produced valid
  // JSON from the truncated text, but every document key Gemini hadn't
  // reached yet was silently missing — no error, just an empty document.
  //
  // Fix: split `outputs` into small batches (at most BATCH_SIZE documents
  // each), and run one independent Gemini call per batch, in parallel.
  // Each batch gets its own full token budget — no document's budget is
  // eaten by an unrelated document earlier in a shared list. This also
  // means a truncation/failure in one batch can no longer cascade into
  // documents in a different batch.
  console.log(`[generate:pass2] starting generation for property ${propertyId}, outputs=[${outputs.join(",")}]`);

  const BATCH_SIZE = 3;
  const batches: OutputType[][] = [];
  for (let i = 0; i < outputs.length; i += BATCH_SIZE) {
    batches.push(outputs.slice(i, i + BATCH_SIZE));
  }
  console.log(
    `[generate:pass2] split into ${batches.length} batch(es): ` +
    batches.map((b) => `[${b.join(",")}]`).join(" ")
  );

  const batchResults = await Promise.all(
    batches.map((batchOutputs) => runGenerationBatch(apiKey, address, mergedExtraction, batchOutputs, adminClient, propertyId))
  );

  // Merge every batch's results into one combined response, same shape as
  // the old single-call code produced downstream.
  const parsed: Record<string, unknown> = {};
  let warnings: string[] = [];
  let emptyOutputs: OutputType[] = [];
  let anyBatchFailedOutright = false;

  for (const result of batchResults) {
    if (result.fatalError) {
      anyBatchFailedOutright = true;
      warnings.push(result.fatalError);
      continue;
    }
    Object.assign(parsed, result.parsed);
    warnings = warnings.concat(result.warnings);
    emptyOutputs = emptyOutputs.concat(result.emptyOutputs);
  }

  if (warnings.length > 0) console.warn("[generate:pass2] validation warnings:", warnings);

  // Re-validate the fully-merged result (cheap, pure, no extra Gemini call)
  // so `usable`/`emptyOutputs` mean exactly what they meant before this was
  // batched — "has real content", not just "the key exists".
  const merged = validateGenerationResponse(parsed, outputs);
  const usable = merged.usable;
  emptyOutputs = merged.emptyOutputs;
  if (emptyOutputs.length > 0) console.warn(`[generate:pass2] still empty after per-batch retries: ${emptyOutputs.join(", ")}`);

  if (!usable) {
    // Every batch failed outright, or none produced usable content —
    // surface a clear error rather than saving nothing.
    const msg = anyBatchFailedOutright
      ? "The AI service had trouble generating your documents. Please try again."
      : "We couldn't generate documents from the information gathered so far. Please try answering a few more follow-up questions, or re-record with more detail.";
    await adminClient.from("properties")
      .update({ status: "error", pipeline_status: "error", error_message: msg })
      .eq("id", propertyId);
    return errorResponse(msg, 502);
  }

  // ── Look up the user's Brand Kit (if any) ────────────────────────────
  // A missing kit (no row, or a lookup error) is not a failure — it just
  // means the document is generated with Walkthrough AI's own default
  // navy/sage look, exactly as it always has been.
  let brandOptions: { primaryHex?: string; secondaryHex?: string; brandName?: string } | undefined;
  try {
    const { data: brandKit } = await adminClient
      .from("brand_kits")
      .select("brand_name, primary_color_key, secondary_color_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (brandKit) {
      brandOptions = {
        primaryHex:   paletteHex(brandKit.primary_color_key) ?? undefined,
        secondaryHex: paletteHex(brandKit.secondary_color_key) ?? undefined,
        brandName:    brandKit.brand_name ?? undefined,
      };
    }
  } catch (brandErr) {
    console.warn("[generate:pass2] could not load brand kit (non-fatal, using defaults):", brandErr);
  }

  // ── Load agent-uploaded room photos (if Listing Pack is being generated) ─
  // Photos are uploaded client-side in the Photos step, before this Pass 2
  // call ever runs — this step just downloads their bytes so buildDocx can
  // embed them. No AI call, no re-processing of the photo itself. A photo
  // that fails to download is skipped (logged, non-fatal) rather than
  // failing the whole document — the room simply has no image, same as if
  // no photo had been attached at all.
  let roomPhotoMap: RoomPhotoMap | undefined;
  if (outputs.includes("listing_pack")) {
    try {
      const { data: photoRow } = await adminClient
        .from("properties")
        .select("room_photos")
        .eq("id", propertyId)
        .maybeSingle();

      const rawRoomPhotos = (photoRow?.room_photos ?? null) as
        | Record<string, { path: string; width: number; height: number } | { path: string; width: number; height: number }[]>
        | null;

      if (rawRoomPhotos && Object.keys(rawRoomPhotos).length > 0) {
        roomPhotoMap = {};
        await Promise.all(
          Object.entries(rawRoomPhotos).map(async ([roomName, value]) => {
            const photos = Array.isArray(value) ? value : [value];
            const loaded = await Promise.all(photos.map(async (photo) => {
              try {
                const { data: fileData, error: downloadError } = await adminClient.storage
                  .from("walkthrough-audio")
                  .download(photo.path);
                if (downloadError || !fileData) {
                  console.warn(`[generate:pass2] could not download room photo for "${roomName}" (non-fatal):`, downloadError?.message);
                  return null;
                }
                const bytes = new Uint8Array(await fileData.arrayBuffer());
                return { bytes, width: photo.width, height: photo.height };
              } catch (photoErr) {
                console.warn(`[generate:pass2] error downloading room photo for "${roomName}" (non-fatal):`, photoErr);
                return null;
              }
            }));
            const valid = loaded.filter((photo): photo is { bytes: Uint8Array; width: number; height: number } => photo !== null);
            if (valid.length > 0) roomPhotoMap![roomName] = valid;
          })
        );
      }
    } catch (roomPhotosErr) {
      console.warn("[generate:pass2] could not load room_photos (non-fatal, documents generate without photos):", roomPhotosErr);
    }
  }

  // ── Build .docx files and upload to Supabase Storage ─────────────────
  // Each requested document type gets its own .docx file. These are the
  // single source of truth — the in-app viewer (mammoth) and the download
  // button both serve the same file from storage.
  const documentPaths: Record<string, string> = {};

  await Promise.all(
    outputs.map(async (outputType) => {
      const docData = parsed[outputType] as Record<string, unknown> | undefined;
      if (!docData) return;
      try {
        const bytes    = await buildDocx(outputType, docData, address, brandOptions, roomPhotoMap);
        const safeName = outputType.replace(/_/g, "-");
        const path     = `documents/${userId}/${propertyId}/${safeName}.docx`;

        const { error: uploadError } = await adminClient.storage
          .from("walkthrough-audio")
          .upload(path, bytes, {
            contentType:  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            upsert:       true,
          });

        if (uploadError) {
          console.error(`[generate:pass2] failed to upload ${outputType} docx:`, uploadError.message);
        } else {
          documentPaths[outputType] = path;
          console.log(`[generate:pass2] uploaded ${path}`);
        }
      } catch (buildErr) {
        console.error(`[generate:pass2] failed to build ${outputType} docx:`, buildErr);
      }
    })
  );

  // ── Persist documents ─────────────────────────────────────────────────
  // The manifest is the single source for the UI count and Download All. It
  // contains only verified stored files as generated; a missing upload is
  // explicitly failed instead of being silently counted as complete.
  const previousPaths = regeneration?.existingDocumentPaths ?? {};
  const finalDocumentPaths = { ...previousPaths, ...documentPaths };
  const previousVersions = regeneration?.existingDocumentDataVersions ?? {};
  const finalDocumentDataVersions = { ...previousVersions };
  const previousCounts = regeneration?.existingDocumentRegenerationCounts ?? {};
  const finalRegenerationCounts = { ...previousCounts };
  const previousManifest = regeneration?.existingDocumentManifest ?? {};
  const finalManifest: Record<string, unknown> = { ...previousManifest };
  const propertyDataVersion = regeneration?.propertyDataVersion ?? 1;

  for (const outputType of outputs) {
    const path = documentPaths[outputType];
    if (path) {
      finalDocumentDataVersions[outputType] = propertyDataVersion;
      finalManifest[outputType] = { status: "generated", path, data_version: propertyDataVersion };
      if (regeneration?.isRegeneration) {
        finalRegenerationCounts[outputType] = Number(previousCounts[outputType] ?? 0) + 1;
      } else if (finalRegenerationCounts[outputType] == null) {
        finalRegenerationCounts[outputType] = 0;
      }
    } else if (!regeneration?.isRegeneration) {
      finalManifest[outputType] = { status: "failed", error: "The document could not be stored. Please try again." };
    }
  }

  const updateData: Record<string, unknown> = {
    status: "completed",
    pipeline_status: "done",
    workflow_stage: "generate",
    selected_outputs: regeneration?.existingSelectedOutputs ?? outputs,
    error_message: null,
    extraction_data: mergedExtraction,
    document_paths: Object.keys(finalDocumentPaths).length > 0 ? finalDocumentPaths : null,
    property_data_version: propertyDataVersion,
    document_data_versions: finalDocumentDataVersions,
    document_regeneration_counts: finalRegenerationCounts,
    document_manifest: finalManifest,
    // Freeze the exact colors/name used for THIS generation — the in-app
    // viewer reads this back instead of the user's current Brand Kit.
    document_brand: {
      primary_hex: brandOptions?.primaryHex ?? "0F2740",
      secondary_hex: brandOptions?.secondaryHex ?? "6FAF9A",
      brand_name: brandOptions?.brandName ?? "Walkthrough AI",
    },
  };

  // Still save the raw JSON for backward compat / debugging. A selective
  // regeneration replaces only that document's current JSON payload.
  for (const outputType of outputs) {
    if (parsed[outputType]) updateData[outputType] = parsed[outputType];
  }

  // ── Delete audio (privacy) — only after Pass 2 succeeds, only once ─────
  let audioJustDeleted = false;
  if (!audioAlreadyDeleted && audioStoragePath) {
    const { error: removeError } = await adminClient.storage
      .from("walkthrough-audio")
      .remove([audioStoragePath]);
    if (removeError) {
      console.warn("[generate:pass2] could not delete audio file (non-fatal):", removeError.message);
    } else {
      audioJustDeleted = true;
      updateData.audio_deleted = true;
      console.log(`[generate:pass2] deleted audio file ${audioStoragePath} after successful generation`);
    }
  }

  const { error: saveError } = await adminClient
    .from("properties")
    .update(updateData)
    .eq("id", propertyId);

  if (saveError) {
    console.error("[generate:pass2] DB save error:", saveError);
    return jsonResponse(
      { ...parsed, _save_warning: "Results generated but could not be saved. Copy your content now." },
      200
    );
  }

  console.log(`[generate:pass2] generation complete for property ${propertyId}, warnings=${warnings.length}`);

  return jsonResponse({
    ...parsed,
    document_paths: finalDocumentPaths,
    document_manifest: finalManifest,
    document_data_versions: finalDocumentDataVersions,
    document_regeneration_counts: finalRegenerationCounts,
    _audio_deleted: audioJustDeleted || audioAlreadyDeleted,
  }, 200);
}

// ─── Text-only Gemini call (Pass 2 — no audio) ────────────────────────────────

/**
 * Pass 2 sends text only (the extraction JSON + instructions), so it
 * mirrors callGemini's retry/rate-limit semantics but without the
 * inline_data audio part (Gemini rejects empty inline_data payloads).
 */
async function callTextGemini(
  apiKey: string,
  textPrompt: string,
  maxTokens: number,
  onRateLimitRetry?: (attempt: number, max: number) => Promise<void> | void,
  onGeneralRetry?: (attempt: number, max: number) => Promise<void> | void,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: textPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
    },
  };

  const MAX_RETRIES = 5;
  const BASE_BACKOFF_MS = 2000;
  const MAX_RATE_LIMIT_RETRIES = 3;
  const RATE_LIMIT_WAIT_MS = 60_000;

  let rateLimitAttempt = 0;
  let generalAttempt = 0;

  while (true) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (networkError) {
      generalAttempt++;
      const msg = networkError instanceof Error ? networkError.message : String(networkError);
      console.warn(`[gemini:text] network error on attempt ${generalAttempt}:`, msg);
      if (generalAttempt > MAX_RETRIES) {
        throw new Error(`Gemini API unreachable after ${MAX_RETRIES + 1} attempts: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * Math.pow(2, generalAttempt - 1)));
      continue;
    }

    if (response.status === 429) {
      rateLimitAttempt++;
      console.warn(`[gemini:text] rate limited (429) — attempt ${rateLimitAttempt}/${MAX_RATE_LIMIT_RETRIES}`);
      if (rateLimitAttempt > MAX_RATE_LIMIT_RETRIES) {
        throw new Error("AI service is currently rate-limited and didn't recover after several retries. Please try again in a few minutes.");
      }
      if (onRateLimitRetry) await onRateLimitRetry(rateLimitAttempt, MAX_RATE_LIMIT_RETRIES);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
      continue;
    }

    if (response.status === 500 || response.status === 503) {
      generalAttempt++;
      console.warn(`[gemini:text] retriable status ${response.status} — attempt ${generalAttempt}/${MAX_RETRIES}`);
      if (generalAttempt > MAX_RETRIES) {
        throw new Error(`AI service unavailable (${response.status}) after ${MAX_RETRIES} retries. Please try again.`);
      }
      if (onGeneralRetry) await onGeneralRetry(generalAttempt, MAX_RETRIES);
      await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * Math.pow(2, generalAttempt - 1)));
      continue;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "(unreadable)");
      console.error(`[gemini:text] HTTP ${response.status}:`, errText.slice(0, 300));
      const userMessage = response.status === 400
        ? "Invalid request to AI service. Please try again."
        : `AI service error (${response.status}). Please try again.`;
      throw new Error(userMessage);
    }

    const geminiData = await response.json();
    const candidate = geminiData.candidates?.[0];
    const blockReason = geminiData.promptFeedback?.blockReason;
    const finishReason = candidate?.finishReason;

    if (blockReason) throw new Error(`Content was blocked by content filters: ${blockReason}.`);
    if (!candidate || finishReason === "SAFETY") throw new Error("Content was flagged by content filters.");
    if (finishReason === "MAX_TOKENS") {
      console.warn(`[gemini:text] response was TRUNCATED (finishReason=MAX_TOKENS, maxTokens=${maxTokens}) — the response likely will not parse as valid JSON`);
    } else if (finishReason && finishReason !== "STOP") {
      console.warn(`[gemini:text] unexpected finish reason: ${finishReason}`);
    }

    const text = candidate?.content?.parts?.[0]?.text;
    if (!text || text.trim().length === 0) {
      generalAttempt++;
      console.warn(`[gemini:text] empty text on attempt ${generalAttempt}/${MAX_RETRIES + 1}`);
      if (generalAttempt > MAX_RETRIES) {
        throw new Error("AI returned an empty response while drafting documents. Please try again.");
      }
      await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * Math.pow(2, generalAttempt - 1)));
      continue;
    }

    return text;
  }
}
