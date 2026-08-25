/** V86 public preference-link audio draft; nothing is saved until buyer submit. */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { CORS_HEADERS, errorResponse, jsonResponse, parseJson } from "../_shared/gemini.ts";

const clean = (value: unknown, limit = 300) => typeof value === "string" ? value.trim().slice(0, limit) : "";
async function hash(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  let body: { token?: string; audioBase64?: string; mimeType?: string }; try { body = await req.json(); } catch { return errorResponse("Invalid request.", 400); }
  const token = clean(body.token, 256); const audio = clean(body.audioBase64, 14_000_000); const mime = clean(body.mimeType, 80);
  if (token.length < 32 || !audio || !["audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/mpeg", "audio/wav"].includes(mime)) return errorResponse("Please record a short preference note and try again.", 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: link } = await admin.from("buyer_links").select("id,kind,status,expires_at").eq("token_hash", await hash(token)).maybeSingle();
  if (!link || link.kind !== "preferences" || link.status !== "active" || (link.expires_at && new Date(link.expires_at).getTime() <= Date.now())) return errorResponse("This private link is unavailable.", 404);
  const prompt = `Transcribe this buyer's spoken home preferences faithfully in plain English. Then return JSON exactly as {"transcript":"...","preferences":{"must_haves":["..."],"nice_to_haves":["..."],"locations":["..."],"budget":"... or unknown","flexible_on":["..."],"unknowns":["..."]}}. Preserve uncertainty. Do not infer protected characteristics, safety preferences, schools, demographics, or legal/financial advice. Use empty arrays or "unknown" where nothing was said.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")!}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: audio } }] }], generationConfig: { temperature: 0.05, maxOutputTokens: 1400, responseMimeType: "application/json" } }) });
  if (!response.ok) return errorResponse(response.status === 429 ? "AI is busy. Please try again shortly." : "Could not turn that recording into preferences.", 502);
  const result = await response.json(); const text = result.candidates?.[0]?.content?.parts?.[0]?.text; if (!text) return errorResponse("The recording could not be read. Please try again.", 502);
  try { const output = parseJson(text); const transcript = clean(output.transcript, 12000); if (!transcript) return errorResponse("The recording did not contain usable preferences.", 422); return jsonResponse({ transcript, preferences: output.preferences && typeof output.preferences === "object" ? output.preferences : {} }); } catch { return errorResponse("The recording could not be read. Please try again.", 502); }
});
