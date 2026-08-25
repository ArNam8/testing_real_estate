/**
 * V84: turns existing extracted property data into a compact, agent-reviewed
 * Home Launch draft. It does not contact the seller, create a link, or persist
 * tasks; the agent remains the only person who decides what will be shared.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { CORS_HEADERS, errorResponse, jsonResponse, parseJson } from "../_shared/gemini.ts";
import type { ExtractionData } from "../_shared/types.ts";

type Category = "fix" | "prepare" | "proof" | "access";
interface DraftTask { category: Category; title: string; why_it_matters: string; mandatory: boolean; requires_upload: boolean; }

const isMentioned = (value: unknown): boolean => {
  if (value === null || value === undefined || value === "" || value === "not mentioned") return false;
  return !Array.isArray(value) || value.length > 0;
};
const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";

async function callGeminiForText(apiKey: string, prompt: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, topP: 0.8, maxOutputTokens: 1200, responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[generate-launch-plan] Gemini error", response.status, detail.slice(0, 200));
    throw new Error(response.status === 429 ? "AI is busy. Please try again in a moment." : "Could not create a Home Launch draft. Please try again.");
  }
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI returned an empty Home Launch draft. Please try again.");
  return parseJson(text);
}

function safeTasks(value: unknown): DraftTask[] {
  if (!Array.isArray(value)) return [];
  const categories = new Set<Category>(["fix", "prepare", "proof", "access"]);
  const output: DraftTask[] = [];
  for (const candidate of value.slice(0, 6)) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    const title = clean(item.title, 180);
    const why = clean(item.why_it_matters, 300);
    const category = categories.has(item.category as Category) ? item.category as Category : "prepare";
    if (!title || !why) continue;
    output.push({ category, title, why_it_matters: why, mandatory: item.mandatory === true, requires_upload: item.requires_upload === true });
  }
  return output;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errorResponse("Please sign in again.", 401);
  let body: { propertyId?: string };
  try { body = await req.json(); } catch { return errorResponse("Invalid request.", 400); }
  if (!body.propertyId || typeof body.propertyId !== "string") return errorResponse("Missing property ID.", 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return errorResponse("Please sign in again.", 401);
  const { data: property, error } = await admin.from("properties").select("id,address,extraction_data").eq("id", body.propertyId).eq("user_id", user.id).maybeSingle();
  if (error || !property) return errorResponse("Listing not found.", 404);
  const extraction = property.extraction_data as ExtractionData | null;
  if (!extraction) return errorResponse("Finish the walkthrough before creating a Home Launch Plan.", 409);

  const facts = extraction.fact_sheet;
  const compactContext = {
    address: property.address,
    issues: extraction.issues?.value ?? [],
    room_maintenance_flags: (extraction.rooms?.value ?? []).map((room) => ({ room: room.name?.value, flags: room.maintenance_flags?.value ?? [], observations: room.observations?.value })).filter((room) => isMentioned(room.flags) || isMentioned(room.observations)),
    renovations: extraction.renovations?.value ?? [],
    features: extraction.features?.value ?? [],
    missing_or_uncertain_facts: Object.entries(facts ?? {}).filter(([, field]) => !isMentioned(field?.value) || Number(field?.confidence ?? 0) < 70).map(([name]) => name),
    available_document_clues: extraction.transaction_notes?.missing_items?.value ?? [],
  };
  const prompt = `You are preparing a concise, practical Home Launch Plan for a real-estate agent. Use ONLY the structured walkthrough evidence below. Return JSON exactly as {"tasks":[...]}.\n\nEvidence:\n${JSON.stringify(compactContext)}\n\nCreate 3 to 6 high-value, seller-facing tasks. Categories must be fix, prepare, proof, or access. Every task has: category, title, why_it_matters, mandatory, requires_upload.\nRules: Do not invent defects, warranties, documents, or property facts. If a field is missing, ask the seller to confirm it rather than asserting a value. Phrase uncertain evidence as a request to check or confirm. Prioritise visible maintenance issues, photo readiness, requested evidence, and showings/access readiness. Keep titles under 100 characters, reasons under 180 characters. Do not give legal, pricing, safety, school, neighbourhood, or discrimination advice. The agent will review every suggestion before it is sent.`;
  try {
    const output = await callGeminiForText(Deno.env.get("GEMINI_API_KEY")!, prompt);
    const tasks = safeTasks(output.tasks);
    if (tasks.length === 0) return errorResponse("AI could not create a usable Home Launch draft. Please try again.", 502);
    return jsonResponse({ tasks });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not create a Home Launch draft.", 502);
  }
});
