/** V87 authenticated agent recording: returns a draft only; agent must review before saving. */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { CORS_HEADERS, errorResponse, jsonResponse, parseJson } from "../_shared/gemini.ts";

const clean = (value: unknown, limit = 300) => typeof value === "string" ? value.trim().slice(0, limit) : "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  const auth = req.headers.get("Authorization"); if (!auth) return errorResponse("Please sign in again.", 401);
  let body: { buyerSearchId?: string; audioBase64?: string; mimeType?: string }; try { body = await req.json(); } catch { return errorResponse("Invalid request.", 400); }
  const buyerSearchId = clean(body.buyerSearchId, 100); const audio = clean(body.audioBase64, 14_000_000); const mime = clean(body.mimeType, 80);
  if (!buyerSearchId || !audio || !["audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/mpeg", "audio/wav"].includes(mime)) return errorResponse("Please record a short buyer conversation and try again.", 400);
  const url = Deno.env.get("SUPABASE_URL")!; const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser(); if (!user) return errorResponse("Please sign in again.", 401);
  const { data: search } = await admin.from("buyer_searches").select("id").eq("id", buyerSearchId).eq("agent_id", user.id).maybeSingle(); if (!search) return errorResponse("Buyer search not found.", 404);
  const prompt = `Transcribe this in-person buyer conversation faithfully in plain English. Then return JSON exactly as {"transcript":"...","preferences":{"must_haves":["..."],"nice_to_haves":["..."],"locations":["..."],"budget":"... or unknown","flexible_on":["..."],"unknowns":["..."]}}. Preserve uncertainty and distinguish stated preferences from gaps. Do not infer protected characteristics, safety preferences, schools, demographics, legal advice, or financial advice. This is a draft for the agent to edit before saving.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")!}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: audio } }] }], generationConfig: { temperature: 0.05, maxOutputTokens: 1400, responseMimeType: "application/json" } }) });
  if (!response.ok) return errorResponse(response.status === 429 ? "AI is busy. Please try again shortly." : "Could not prepare the buyer brief.", 502);
  const payload = await response.json(); const text = payload.candidates?.[0]?.content?.parts?.[0]?.text; if (!text) return errorResponse("The recording could not be read. Please try again.", 502);
  try { const result = parseJson(text); const transcript = clean(result.transcript, 12000); if (!transcript) return errorResponse("The recording did not contain usable buyer preferences.", 422); return jsonResponse({ transcript, preferences: result.preferences && typeof result.preferences === "object" ? result.preferences : {} }); } catch { return errorResponse("The recording could not be read. Please try again.", 502); }
});
