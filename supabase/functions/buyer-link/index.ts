/**
 * V86 public Buyer Link gateway. Buyer browsers receive only their own
 * preference or curated-shortlist payload through a revocable opaque token.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/gemini.ts";

const clean = (value: unknown, limit = 3000) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const unavailable = () => errorResponse("This private link is unavailable.", 404);
async function hash(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  let body: { action?: string; token?: string; transcript?: string; preferences?: Record<string, unknown>; homeId?: string; kind?: string; detail?: string; slotId?: string };
  try { body = await req.json(); } catch { return errorResponse("Invalid request.", 400); }
  const token = clean(body.token, 256);
  if (token.length < 32) return unavailable();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: link } = await admin.from("buyer_links").select("id,agent_id,buyer_search_id,kind,status,expires_at").eq("token_hash", await hash(token)).maybeSingle();
  if (!link || link.status !== "active" || (link.expires_at && new Date(link.expires_at).getTime() <= Date.now())) return unavailable();
  const { data: search } = await admin.from("buyer_searches").select("id,label,status,preferences_data,agent_note,contacts(name)").eq("id", link.buyer_search_id).eq("agent_id", link.agent_id).maybeSingle();
  if (!search) return unavailable();

  if (body.action === "read") {
    if (link.kind === "preferences") return jsonResponse({ kind: "preferences", search: { label: search.label, status: search.status, agentNote: search.agent_note, buyerName: (search.contacts as { name?: string } | null)?.name ?? null, preferences: search.preferences_data } });
    const [{ data: homes }, { data: slots }] = await Promise.all([
      admin.from("buyer_homes").select("id,title,listing_url,image_url,summary,agent_reason,display_order,status").eq("buyer_search_id", link.buyer_search_id).eq("status", "sent").order("display_order"),
      admin.from("buyer_availability_slots").select("id,starts_at,ends_at").eq("buyer_search_id", link.buyer_search_id).eq("status", "available").gte("starts_at", new Date().toISOString()).order("starts_at"),
    ]);
    return jsonResponse({ kind: "shortlist", search: { label: search.label, buyerName: (search.contacts as { name?: string } | null)?.name ?? null, preferences: search.preferences_data, agentNote: search.agent_note }, homes: homes ?? [], slots: slots ?? [] });
  }

  if (body.action === "submit_preferences") {
    if (link.kind !== "preferences") return errorResponse("This link cannot receive preferences.", 400);
    const transcript = clean(body.transcript, 12000);
    if (!transcript) return errorResponse("Please add your preferences before sending.", 400);
    const preferences = body.preferences && typeof body.preferences === "object" ? body.preferences : {};
    const { data: submission, error } = await admin.from("buyer_preference_submissions").insert({ agent_id: link.agent_id, buyer_search_id: link.buyer_search_id, buyer_link_id: link.id, transcript, preferences_data: preferences }).select("id").single();
    if (error || !submission) return errorResponse("Could not send your preferences. Please try again.", 500);
    await admin.from("buyer_searches").update({ status: "preferences_received", preferences_data: preferences, updated_at: new Date().toISOString() }).eq("id", link.buyer_search_id);
    await admin.from("notices").insert({ agent_id: link.agent_id, buyer_search_id: link.buyer_search_id, buyer_link_id: link.id, kind: "buyer_preferences_received", title: `${(search.contacts as { name?: string } | null)?.name ?? 'Buyer'} completed their preferences.`, detail: transcript.slice(0, 320) });
    return jsonResponse({ ok: true, message: "Your preferences are with your agent." });
  }

  if (link.kind !== "shortlist") return errorResponse("This link cannot receive shortlist feedback.", 400);
  const homeId = clean(body.homeId, 80);
  const detail = clean(body.detail, 3000);
  if (body.action === "feedback") {
    if (!["fits", "concern", "question", "message"].includes(clean(body.kind, 30))) return errorResponse("Choose feedback type.", 400);
    const kind = clean(body.kind, 30);
    const { data: home } = homeId ? await admin.from("buyer_homes").select("id,title").eq("id", homeId).eq("buyer_search_id", link.buyer_search_id).eq("status", "sent").maybeSingle() : { data: null };
    if (homeId && !home) return errorResponse("That home is unavailable.", 400);
    const { error } = await admin.from("buyer_feedback").insert({ agent_id: link.agent_id, buyer_search_id: link.buyer_search_id, buyer_home_id: home?.id ?? null, buyer_link_id: link.id, kind, detail: detail || null });
    if (error) return errorResponse("Could not save your feedback.", 500);
    const title = kind === "fits" ? `Buyer says this home fits: ${home?.title ?? 'a home'}` : kind === "concern" ? `Buyer has a concern about: ${home?.title ?? 'a home'}` : kind === "question" ? `Buyer asked about: ${home?.title ?? 'the shortlist'}` : `Buyer sent a home-search message.`;
    await admin.from("notices").insert({ agent_id: link.agent_id, buyer_search_id: link.buyer_search_id, buyer_home_id: home?.id ?? null, buyer_link_id: link.id, kind: `buyer_${kind}`, title, detail: detail || null });
    return jsonResponse({ ok: true, message: "Your agent has been updated." });
  }

  if (body.action === "request_tour") {
    const slotId = clean(body.slotId, 80);
    if (!homeId || !slotId) return errorResponse("Choose a home and a time.", 400);
    const [{ data: home }, { data: slot }] = await Promise.all([
      admin.from("buyer_homes").select("id,title").eq("id", homeId).eq("buyer_search_id", link.buyer_search_id).eq("status", "sent").maybeSingle(),
      admin.from("buyer_availability_slots").select("id,starts_at,ends_at,status").eq("id", slotId).eq("buyer_search_id", link.buyer_search_id).eq("status", "available").maybeSingle(),
    ]);
    if (!home || !slot) return errorResponse("That home or time is no longer available.", 400);
    const tenDays = Date.now() + 10 * 24 * 60 * 60 * 1000;
    if (new Date(slot.starts_at).getTime() > tenDays) return errorResponse("Please choose a time in the next 10 days.", 400);
    const { data: request, error } = await admin.from("tour_requests").insert({ agent_id: link.agent_id, buyer_search_id: link.buyer_search_id, buyer_home_id: home.id, buyer_link_id: link.id, availability_slot_id: slot.id, buyer_note: detail || null }).select("id").single();
    if (error || !request) return errorResponse("Could not request that tour. Please try again.", 500);
    await admin.from("buyer_availability_slots").update({ status: "held" }).eq("id", slot.id).eq("status", "available");
    await admin.from("buyer_homes").update({ status: "tour_requested", updated_at: new Date().toISOString() }).eq("id", home.id);
    await admin.from("buyer_searches").update({ status: "tour_requests", updated_at: new Date().toISOString() }).eq("id", link.buyer_search_id);
    await admin.from("notices").insert({ agent_id: link.agent_id, buyer_search_id: link.buyer_search_id, buyer_home_id: home.id, tour_request_id: request.id, buyer_link_id: link.id, kind: "tour_requested", title: `${(search.contacts as { name?: string } | null)?.name ?? 'Buyer'} wants to tour ${home.title}.`, detail: new Date(slot.starts_at).toLocaleString() });
    return jsonResponse({ ok: true, message: "Your tour request is with your agent." });
  }
  return errorResponse("Invalid request.", 400);
});
