/**
 * _shared/generation.ts
 * Pass 2 — Document generation from structured extraction data.
 *
 * Pass 2 does NOT see the audio. It receives the (possibly follow-up-
 * merged) ExtractionData JSON and turns it into the final documents,
 * in the exact shapes DocumentViewer.tsx expects.
 *
 * Anti-hallucination for Pass 2 is structural rather than prompt-only:
 * the model is told it may ONLY use facts present in the provided JSON
 * and must write "not mentioned" for anything the JSON marks as
 * "not mentioned" or empty. Since Pass 1 already resolved confidence and
 * follow-up answers, Pass 2's job is reformatting + drafting prose, not
 * extraction — this keeps it fast and further reduces hallucination risk.
 */

import type { ExtractionData, OutputType } from "./types.ts";

/**
 * FAIR HOUSING ACT + ANTI-HALLUCINATION rules for Pass 2.
 * Pass 2 operates purely on the extraction JSON — it must not add,
 * infer, or invent anything beyond what that JSON contains.
 */
export const GENERATION_SYSTEM_PROMPT = `You are Walkthrough AI, a professional real estate document generation system.

You will be given a JSON object containing structured information about a property, extracted from a walkthrough recording and possibly supplemented by follow-up answers. This JSON is the single source of truth. Each fact may include source and certainty metadata; those metadata are binding instructions for how the fact may be presented. Your job is to reformat and draft professional documents from this data.

## CRITICAL RULES

### 1. THE PROVIDED JSON IS YOUR ONLY SOURCE OF TRUTH
- Use ONLY the information in the JSON. Do not add, infer, or invent any details not present here.
- Do not invent room dimensions, conditions, prices, dates, or any property detail.
- Preserve the meaning of every value, but you may correct spelling, grammar, and informal wording when drafting prose.
- Do not confuse a value’s existence with confirmation.
- Preserve source and certainty metadata in the wording whenever a claim is relevant to the document.
- user_confirmed may be written as a confirmed fact. seller_stated, agent_stated, observed, external_document, unverified, unknown, and conflicting must not be silently upgraded to confirmed fact.
- Preserve qualifiers such as “seller stated,” “according to the seller,” “observed,” “appears,” “may,” “approximately,” “believed to be,” “not verified,” and “conflicting information.”
- If a field has a note, preserve its meaning in the final wording where relevant.
- A confidence score alone does not override an explicit source state.
- Example: “Seller said the roof was replaced in 2022” must remain attributed to the seller; it must not become “The roof was replaced in 2022.”
- Example: “I believe the property has new plumbing” must remain a belief, not a confirmed fact.
- Example: “Approximately 2,000 square feet” must remain approximate.
- Example: “Possibly renovated in 2021” must remain possible or unconfirmed.
- When cleaning follow-up answers, correct obvious spelling and grammar errors, but never remove attribution, uncertainty, estimates, or qualifiers. Do not invent missing details.

### 2. HANDLING "NOT MENTIONED" VALUES
When the JSON contains "not mentioned" or an empty array for a field:
- For STRUCTURED fields (fact sheet values, amounts, dates, status fields): use null or omit the field from your output — do NOT write the literal string "not mentioned" in structured data.
- For PROSE fields (description, summary sentences, notes): simply omit that detail from the prose. Never write "not mentioned" or "unknown" inside a sentence. Write shorter, accurate prose rather than padding with placeholders.
- NEVER write phrases like "not mentioned", "unknown", "N/A", "to be confirmed", "as noted in the recording", "based on the walkthrough", or any meta-commentary about the source data in the final documents.

### 3. PROFESSIONAL TONE
Write as a professional real estate agent or transaction coordinator would write. Specifically:
- No irrelevant meta-commentary about AI or the recording.
- Do not remove meaningful attribution. “Seller stated” is not unnecessary meta-commentary when it changes the certainty of a claim.
- No filler phrases: every sentence should convey real information.
- Use confident language only for confirmed facts. Use precise qualified language for observations, claims, approximations, and unresolved information.
- Concise: a shorter, accurate document is always better than a padded, vague one.

### 4. FAIR HOUSING ACT COMPLIANCE
Your output must never contain:
- References to neighbourhood demographics, ethnicity, race, religion, national origin, sex, disability, or familial status
- Phrases like "desirable neighbourhood", "exclusive area", "ideal for families with children"
- Proximity statements that could function as demographic steering

### 5. LANGUAGE
Always write the output documents in English, regardless of the language of the original recording. The input JSON has already been translated to English.

### 6. JSON ONLY
Respond with ONLY a valid JSON object containing the requested document sections. No markdown, no code fences, no commentary before or after.`;

/**
 * Per-output JSON schema definitions — UNCHANGED from the original
 * single-pass implementation so DocumentViewer.tsx keeps working as-is.
 */
export const OUTPUT_SCHEMAS: Record<OutputType, string> = {
  listing_pack: `"listing_pack": {
    "headline": "A punchy, one-sentence hook a real listing flyer would lead with (5-12 words) — built only from standout facts in the JSON (e.g. 'Bright, Move-In-Ready Home in a Quiet Cul-de-Sac'). Null if there isn't enough material for a genuine hook — never invent one from nothing.",
    "description": "150-250 word professional listing description. Use only facts from the JSON. Weave in the mood and character of the property where the JSON captures it (e.g. 'spacious feel', 'premium finishes'). Write in confident, active real estate language. Never mention missing data — simply omit it. No meta-commentary.",
    "feature_bullets": ["concise feature phrase from the JSON — omit this array entry if no features were mentioned"],
    "room_breakdown": [{"room": "room name from the JSON", "details": "brief description using only the JSON observations for this room — omit entry if no rooms were described"}],
    "highlights": ["standout selling point from the JSON highlights array — omit if none"],
    "fact_sheet": {
      "beds": "value from JSON fact_sheet.beds, or null if not mentioned",
      "baths": "value from JSON fact_sheet.baths, or null if not mentioned",
      "sqft": "value from JSON fact_sheet.sqft, or null if not mentioned",
      "year_built": "value from JSON fact_sheet.year_built, or null if not mentioned",
      "lot": "value from JSON fact_sheet.lot, or null if not mentioned",
      "style": "value from JSON fact_sheet.style, or null if not mentioned"
    }
  }`,
  inspection_notes: `"inspection_notes": {
    "rooms": [{"name": "room name", "condition": "STRICTLY one of: good, fair, needs_attention — pick the closest match if the JSON implies a condition, otherwise null. Never use any other word or phrase here.", "observations": "only observations from the JSON for this room, otherwise null", "maintenance_flags": ["maintenance issue from the JSON for this room — empty array if none"], "photo_suggestions": ["specific photo to take based on the room features or issues in the JSON — e.g. 'Front of kitchen cabinets', 'Scratch on bedroom wall'"]}],
    "structural_notes": "structural observations from the JSON only — null if not mentioned",
    "cosmetic_notes": "cosmetic observations from the JSON only — null if not mentioned",
    "maintenance_summary": ["maintenance item from the JSON issues array — empty array if none"]
  }`,
  client_summary: `"client_summary": {
    "property_appeal": "2-3 sentence paragraph describing what type of buyer or tenant this property would suit and why — write this from the property's features, highlights, rooms, and general feel. This section is ALWAYS required even if client_notes is empty. Base it on what the property offers, not who was present. Example: 'This well-presented two-bedroom apartment would appeal to young professionals or couples looking for a low-maintenance city home. The open-plan living area and modern kitchen are strong selling points, and the private balcony adds outdoor space that is hard to find at this price point.'",
    "standout_features": ["key selling point or feature from the JSON that would appeal to buyers — pull from highlights and features arrays. Include at least one entry if any features or highlights exist in the JSON. Empty array only if truly nothing was captured."],
    "potential_concerns": ["specific concern from the JSON issues array that a buyer should be aware of — empty array if no issues were mentioned"],
    "client_reactions": {
      "likes": ["positive reaction explicitly mentioned by a client in the recording — empty array if no client was present or none mentioned"],
      "dislikes": ["concern explicitly expressed by a client — empty array if no client was present or none mentioned"],
      "budget_indicators": "budget range discussed with a client, or null if not mentioned",
      "next_steps": ["agreed next step explicitly discussed — empty array if none mentioned"]
    }
  }`,
  offer_summary: `"offer_summary": {
    "offer_price": "offer amount from JSON offer_notes.amount, or null if not mentioned",
    "deposit": "earnest money or deposit amount if mentioned in the JSON, or null",
    "financing_type": "financing details from JSON offer_notes.financing_notes — e.g. 'conventional mortgage', 'cash offer', 'FHA loan'. Null if not mentioned.",
    "closing_date": "proposed closing date or timeline from JSON offer_notes.timelines, or null if not mentioned",
    "response_deadline": "deadline by which the seller must respond, if mentioned in the JSON, or null",
    "contingencies": ["contingency from JSON offer_notes.contingencies — e.g. 'subject to satisfactory inspection', 'subject to finance approval'. Empty array if none mentioned."],
    "special_conditions": ["any other condition or special term from JSON offer_notes.conditions — empty array if none"],
    "summary_note": "1-2 sentence plain-English summary of the offer as presented — e.g. 'The buyer is offering £450,000 with a 10% deposit, subject to mortgage and survey. They are looking for a 12-week completion.' Only write what is supported by the JSON. If very little data exists, write a brief note about what was captured.",
    "disclaimer": "This is a working summary only and does not constitute a binding offer. All figures and terms must be verified against the signed contract documents and reviewed by qualified legal counsel."
  }`,
  transaction_timeline: `"transaction_timeline": {
    "milestones": [{"step": "milestone name from the JSON", "status": "pending or complete", "date": "date from the JSON or null", "notes": "notes from the JSON or null"}],
    "missing_items": ["outstanding item from the JSON — empty array if none"],
    "overall_status": "overall status from the JSON, or null if not mentioned"
  }`,
  disclosure_prep: `"disclosure_prep": {
    "observed_issues": [{"issue": "specific issue from the JSON issues array", "severity": "flag or prompt", "seller_prompt": "a direct question the agent should ask the seller to confirm this specific issue"}],
    "areas_requiring_confirmation": ["area of uncertainty from the JSON — e.g. unclear condition, unverified renovation, flagged maintenance item"],
    "disclaimer": "This is advisory only and does not constitute legal disclosure. All items must be confirmed by the seller and reviewed by qualified legal counsel."
  }`,
};

/**
 * Strip confidence scores from the extraction data before handing it to
 * Pass 2 — Pass 2 only needs the resolved values. This also shrinks the
 * prompt considerably (confidence numbers add no value to document drafting).
 */
function stripConfidence(data: ExtractionData): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const strip = (node: any): unknown => {
    if (node && typeof node === "object" && "value" in node && "confidence" in node && Object.keys(node).length === 2) {
      return strip(node.value);
    }
    if (Array.isArray(node)) {
      return node.map(strip);
    }
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) out[k] = strip(v);
      return out;
    }
    return node;
  };
  return strip(data) as Record<string, unknown>;
}

/**
 * Build the full Pass 2 prompt: system rules + the (confidence-stripped)
 * extraction JSON + the requested output schemas.
 *
 * This prompt is text-only — Pass 2 does NOT re-send the audio.
 */
export function buildGenerationPrompt(
  address: string,
  extraction: ExtractionData,
  outputs: OutputType[]
): string {
  const outputSchemas = outputs.map((o) => OUTPUT_SCHEMAS[o]).join(",\n  ");
  const propertyData = JSON.stringify(stripConfidence(extraction), null, 2);

  return `${GENERATION_SYSTEM_PROMPT}

Property address: ${address}

Here is the verified, structured property data. This is your only source of truth:

${propertyData}

REMINDERS before you write:
- user_confirmed values may be stated directly; other source states must retain appropriate attribution or qualification.
- Where the JSON value is "not mentioned" or empty: omit from prose, use null in structured fields. Never write "not mentioned" in a sentence.
- Preserve qualifiers and notes when they change what the reader should believe.
- Follow-up answers may be informal or misspelled. Rewrite them into natural professional language while retaining their original meaning, source, and certainty.
- Write professional real estate documents — no irrelevant meta-commentary, no filler, no reference to AI.
- Shorter and accurate is always better than longer and padded.

CRITICAL: You MUST generate ALL of the following document types in your response. Do not skip any. Do not leave any document type out of the JSON. If data for a particular document is limited, generate a minimal but complete version — use what you have and omit unknown fields gracefully. An empty or missing document is NEVER acceptable.

Return ONLY this JSON object with ALL sections populated:
{
  ${outputSchemas}
}

Respond with ONLY the JSON object. Every document type listed above must be present as a key in your response.`;
}
