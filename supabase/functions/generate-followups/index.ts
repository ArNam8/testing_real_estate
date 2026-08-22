/**
 * generate-followups/index.ts
 * Supabase Edge Function — Follow-up question generation.
 *
 * REDESIGNED: this function no longer makes its own Gemini call. It is
 * triggered (fire-and-forget) by `generate` immediately after Pass 1
 * (extraction) succeeds, and derives follow-up questions directly from
 * extraction_data using:
 *
 *   - REQUIRED_FIELDS per selected document type — any required field
 *     that's "not mentioned" / empty ALWAYS produces a question.
 *   - CONFIDENCE_THRESHOLD (70) — any other non-empty field below this
 *     confidence produces a "can you confirm/clarify" question.
 *
 * This is deterministic, fast, and has no failure mode tied to Gemini
 * availability or response parsing — it can only fail if extraction_data
 * itself is missing (i.e. Pass 1 hasn't completed or failed), in which
 * case it returns a clear error and the caller's FollowUpStage fallback
 * questions are used instead.
 *
 * Flow:
 *   1. Authenticate the caller via JWT
 *   2. Verify property ownership
 *   3. Read extraction_data (written by Pass 1)
 *   4. Derive follow-up questions via findLowConfidenceFields()
 *   5. Save follow_up_questions to the property record
 *   6. Return the questions to the client
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/gemini.ts";
import { findLowConfidenceFields } from "../_shared/extraction.ts";
import type { ExtractionData, OutputType } from "../_shared/types.ts";

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
  if (!authHeader) return errorResponse("Missing Authorization header", 401);

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return errorResponse("Invalid or expired session. Please sign in again.", 401);
  }

  // ── 2. Parse request body ────────────────────────────────────────────────

  let body: { propertyId?: string; selectedOutputs?: OutputType[] };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON request body.", 400);
  }

  const { propertyId, selectedOutputs } = body;

  if (!propertyId || typeof propertyId !== "string") {
    return errorResponse("Missing or invalid propertyId.", 400);
  }

  const outputs: OutputType[] = Array.isArray(selectedOutputs) && selectedOutputs.length > 0
    ? selectedOutputs
    : ["listing_pack", "client_summary"];

  // ── 3. Verify ownership and load extraction_data ────────────────────────

  const { data: property, error: propError } = await adminClient
    .from("properties")
    .select("id, user_id, extraction_data")
    .eq("id", propertyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (propError || !property) {
    return errorResponse("Property not found or access denied.", 404);
  }

  const extraction = property.extraction_data as ExtractionData | null;
  if (!extraction) {
    console.warn(`[generate-followups] no extraction_data yet for property ${propertyId}`);
    return errorResponse("Extraction has not completed yet for this property.", 409);
  }

  // ── 4. Derive follow-up questions from confidence scores ────────────────

  const questions = findLowConfidenceFields(
    extraction,
    outputs.map((type) => ({ type }))
  );

  console.log(
    `[generate-followups] derived ${questions.length} follow-up questions for property ${propertyId}: ` +
    JSON.stringify(questions.map((q) => ({ id: q.id, field_path: q.field_path, category: q.category })))
  );

  if (questions.length === 0) {
    console.log(`[generate-followups] no low-confidence/missing fields — extraction was thorough`);
  }

  // ── 5. Save to property record ───────────────────────────────────────────

  const { error: saveError } = await adminClient
    .from("properties")
    .update({ follow_up_questions: questions })
    .eq("id", propertyId);

  if (saveError) {
    // Non-fatal — return questions anyway so the client has them in memory
    console.warn("[generate-followups] could not save follow_up_questions to DB:", saveError.message);
  }

  return jsonResponse({ questions });
});
