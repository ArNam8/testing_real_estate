/**
 * V86 agent-only source review. Google-grounded results are returned only to
 * the authenticated agent who initiated this review and are never persisted.
 * The agent must independently curate any original listing card shared later.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { CORS_HEADERS, errorResponse, jsonResponse, parseJson } from "../_shared/gemini.ts";

const allowedHosts = ["zillow.com", "realtor.com", "redfin.com", "rightmove.co.uk", "zoopla.co.uk"];
const hostAllowed = (url: string) => { try { const host = new URL(url).hostname.toLowerCase(); return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)); } catch { return false; } };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  const authHeader = req.headers.get("Authorization"); if (!authHeader) return errorResponse("Please sign in again.", 401);
  let body: { buyerSearchId?: string }; try { body = await req.json(); } catch { return errorResponse("Invalid request.", 400); }
  if (!body.buyerSearchId || typeof body.buyerSearchId !== "string") return errorResponse("Missing buyer search ID.", 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser(); if (!user) return errorResponse("Please sign in again.", 401);
  const { data: search, error } = await admin.from("buyer_searches").select("id,label,preferences_data").eq("id", body.buyerSearchId).eq("agent_id", user.id).maybeSingle();
  if (error || !search) return errorResponse("Buyer search not found.", 404);
  if (!search.preferences_data || Object.keys(search.preferences_data as Record<string, unknown>).length === 0) return errorResponse("Wait for buyer preferences before reviewing sources.", 409);
  const prompt = `You are assisting a real-estate agent with an internal source review. Search current public listing pages only on these selected source domains: ${allowedHosts.join(", ")}. Use the buyer preferences below. Return JSON exactly as {"homes":[{"title":"short plain title","source_index":0,"match_reason":"one factual reason based only on the buyer preferences and the cited source"}]}. Return at most 5 homes. source_index refers to the zero-based source list that grounding returns. Do not invent prices, beds, areas, availability, titles, or links. This is an internal agent review; the agent will separately choose and add any original listings to a buyer shortlist.\n\nBuyer preferences:\n${JSON.stringify(search.preferences_data)}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")!}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.1, maxOutputTokens: 1000, responseMimeType: "application/json" } }) });
  if (!response.ok) return errorResponse(response.status === 429 ? "Source review is busy. Please try again shortly." : "Could not review live sources.", 502);
  const raw = await response.json(); const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return errorResponse("Source review returned no usable results.", 502);
  let parsed: Record<string, unknown>; try { parsed = parseJson(text); } catch { return errorResponse("Source review returned an unreadable result.", 502); }
  const chunks = raw.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const homes = Array.isArray(parsed.homes) ? parsed.homes.slice(0, 5).flatMap((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>; const index = Number(item.source_index); const web = chunks[index]?.web; const url = typeof web?.uri === "string" ? web.uri : "";
    const title = typeof item.title === "string" ? item.title.trim().slice(0, 200) : ""; const reason = typeof item.match_reason === "string" ? item.match_reason.trim().slice(0, 300) : "";
    if (!title || !reason || !url || !hostAllowed(url)) return [];
    return [{ title, url, match_reason: reason, source_title: typeof web.title === "string" ? web.title.slice(0, 160) : "Source" }];
  }) : [];
  return jsonResponse({ homes, note: "Source-review results are temporary. Open a source, then add only the original listing cards you choose to share." });
});
