/**
 * _shared/extraction.ts
 * Pass 1 — Extraction prompt, schema, validation, and follow-up helpers.
 *
 * Pass 1 sends the walkthrough audio to Gemini ONCE and gets back a
 * structured ExtractionData object (see _shared/types.ts) where every
 * field has a value AND a confidence score (0-100). Fields that weren't
 * mentioned in the audio are explicitly marked "not mentioned" with
 * confidence 0 — never omitted, never invented.
 *
 * This module also provides:
 *  - validateExtraction(): checks the parsed response has the expected
 *    shape, filling in safe "not mentioned"/0-confidence defaults for
 *    anything missing so downstream code never has to null-check.
 *  - findLowConfidenceFields(): walks the extraction looking for fields
 *    below CONFIDENCE_THRESHOLD or empty required fields, used by
 *    generate-followups to build its question list.
 *  - mergeFollowUpAnswers(): merges agent-confirmed follow-up answers
 *    into an ExtractionData object ahead of Pass 2, overriding
 *    low-confidence / missing fields with the confirmed values at
 *    confidence 100.
 */

import type { ExtractedField, ExtractionData, FollowUpQuestion, RoomExtraction } from "./types.ts";
import { CONFIDENCE_THRESHOLD, FIELD_LABELS, REQUIRED_FIELDS } from "./types.ts";

// ─── Extraction prompt ────────────────────────────────────────────────────────

/**
 * ANTI-HALLUCINATION + FAIR HOUSING rules baked into the extraction prompt.
 * Every field must be populated — if not mentioned, value = "not mentioned"
 * (or [] for arrays) and confidence = 0. Never omit a field.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are Walkthrough AI's audio extraction system.

Your job is to listen to a property walkthrough audio recording and extract EVERY piece of property information into a strict structured JSON format, with a confidence score for each field.

Agents speak naturally while walking through properties. Expect:
- Fragmented sentences and mid-thought corrections ("actually no, make that three")
- Verbal room transitions announced out loud ("okay now I'm walking into the kitchen", "right, so this is the master bedroom")
- Background noise, echoes, or overlapping voices — focus on the primary speaker
- Stream-of-consciousness narration that jumps between topics
- Approximate figures given conversationally ("about 1,800 square feet", "I think it was built around 1995", "maybe three bedrooms")

Extract the substance of what was said, not the exact words. Treat each verbal room transition as the start of a new room entry.

## CRITICAL RULES

### 1. NEVER HALLUCINATE
- Only extract information that was explicitly stated or clearly implied in the audio.
- Preserve who supplied the information. If the agent says “the seller said the roof was replaced,” the value source must be seller_stated, not observed or user_confirmed.
- If a field was NOT mentioned, set "value" to the string "not mentioned" (or [] for array fields) and "confidence" to 0.
- Do NOT invent dimensions, conditions, prices, dates, or any detail not present in the audio.
- It is correct and expected for many fields to be "not mentioned" — that is not a failure.

### 2. CONFIDENCE SCORES (0-100)
For every field, include a "confidence" score reflecting how clearly the information was stated:
- 90-100: stated explicitly and clearly ("four bedrooms", "built in 2005")
- 70-89: stated but with minor ambiguity (e.g. "I think it's four bedrooms", unclear which room)
- 50-69: approximate or hedged ("about 2,000 square feet", "probably built in the 90s", "maybe three or four bedrooms") — extract the best value and score 50-69, do NOT score these 0
- 1-49: strongly implied or inferred from context with significant uncertainty
- 0: not mentioned at all — value must be "not mentioned" or []

### 3. SOURCE AND CERTAINTY
Every extracted field object must include value, confidence, and source. Use exactly one source value:
- observed: directly observed or described by the agent as present
- seller_stated: attributed to the seller or owner
- agent_stated: stated by the agent but not presented as personally observed or externally verified
- external_document: taken from a provided document
- unverified: a claim or estimate that still needs verification
- unknown: not mentioned or unavailable
- conflicting: multiple incompatible values were supplied
Do not use user_confirmed in Pass 1; that source is reserved for later edits and follow-up answers.

IMPORTANT: "about X", "around X", "maybe X", "I think X", "probably X" are partial statements — extract the value and score 50-69, never treat them as "not mentioned".

### 3. GENERAL SUMMARY — CAPTURE MOOD AND CHARACTER
The general_summary field should capture the overall feel and character of the property, not just list facts. Agents often describe the vibe of a property as much as its features:
- Preserve emotional and tonal language: "it feels really spacious", "very premium feel", "a bit tired but loads of potential"
- Include the agent's overall impression, not just a fact list
- Write 1-3 natural sentences summarising what was said AND how the property felt
- Only write "not mentioned" here if literally nothing was said in the recording

### 4. FAIR HOUSING ACT COMPLIANCE
Do not extract or include:
- References to neighbourhood demographics, ethnicity, race, religion, national origin, sex, disability, or familial status
- Phrases implying demographic steering (e.g. "desirable neighbourhood", "ideal for families with children")
If the speaker mentions such details, omit them from your extraction entirely.

### 5. TRANSLATION AND NOISE HANDLING
The recording may be in ANY language or accent and may include background noise or a crowded environment (e.g. open houses).
- Transcribe and understand the content regardless of language or accent.
- Translate everything to English in your extraction — all "value" fields must be in English regardless of the spoken language.
- Ignore background voices unrelated to the primary speaker's walkthrough narration.
- If parts of the audio are unclear due to noise, do your best from context; only mark "not mentioned" if a detail genuinely cannot be determined.

### 6. JSON ONLY
Respond with ONLY a valid JSON object matching the schema below exactly. No markdown, no code fences, no commentary.`;

/**
 * The exact JSON shape Pass 1 must return. Mirrors ExtractionData in types.ts.
 * Every leaf is { "value": ..., "confidence": 0-100, "source": "..." }.
 */
export const EXTRACTION_SCHEMA = `{
  "rooms": {
    "value": [
      {
        "name": {"value": "room name as spoken, e.g. Kitchen", "confidence": 0, "source": "unknown"},
        "condition": {"value": "good/fair/needs attention, or 'not mentioned'", "confidence": 0, "source": "unknown"},
        "observations": {"value": "what was said about this room, or 'not mentioned'", "confidence": 0, "source": "unknown"},
        "maintenance_flags": {"value": ["issue mentioned for this room"], "confidence": 0, "source": "unknown"},
        "dimensions": {"value": "dimensions if stated, or 'not mentioned'", "confidence": 0, "source": "unknown"},
        "flooring": {"value": "flooring type if stated, or 'not mentioned'", "confidence": 0, "source": "unknown"}
      }
    ],
    "confidence": 0, "source": "unknown"
  },
  "fact_sheet": {
    "beds": {"value": "number of bedrooms or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "baths": {"value": "number of bathrooms or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "sqft": {"value": "square footage or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "year_built": {"value": "year built or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "lot": {"value": "lot size or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "style": {"value": "architectural style or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "price_range": {"value": "asking price or price range or 'not mentioned'", "confidence": 0, "source": "unknown"}
  },
  "features": {"value": ["feature explicitly mentioned"], "confidence": 0, "source": "unknown"},
  "renovations": {"value": ["renovation or upgrade explicitly mentioned, with year if stated"], "confidence": 0, "source": "unknown"},
  "issues": {"value": ["maintenance issue, defect, or concern explicitly mentioned"], "confidence": 0, "source": "unknown"},
  "highlights": {"value": ["standout feature or selling point explicitly mentioned"], "confidence": 0, "source": "unknown"},
  "client_notes": {
    "preferences": {"value": ["buyer/seller preference explicitly stated"], "confidence": 0, "source": "unknown"},
    "priorities": {"value": ["priority explicitly stated"], "confidence": 0, "source": "unknown"},
    "likes": {"value": ["positive reaction explicitly mentioned"], "confidence": 0, "source": "unknown"},
    "dislikes": {"value": ["negative reaction explicitly mentioned"], "confidence": 0, "source": "unknown"},
    "budget_indicators": {"value": "budget info if discussed, or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "next_steps": {"value": ["next step explicitly discussed"], "confidence": 0, "source": "unknown"}
  },
  "offer_notes": {
    "amount": {"value": "offer amount if stated, or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "conditions": {"value": ["condition explicitly discussed"], "confidence": 0, "source": "unknown"},
    "timelines": {"value": "timeline if discussed, or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "financing_notes": {"value": "financing info if discussed, or 'not mentioned'", "confidence": 0, "source": "unknown"},
    "contingencies": {"value": ["contingency explicitly mentioned"], "confidence": 0, "source": "unknown"}
  },
  "transaction_notes": {
    "milestones": {"value": [{"step": "milestone name", "status": "pending/complete", "date": "date or 'not mentioned'", "notes": "details or 'not mentioned'"}], "confidence": 0, "source": "unknown"},
    "missing_items": {"value": ["item explicitly noted as outstanding"], "confidence": 0, "source": "unknown"},
    "overall_status": {"value": "overall status if stated, or 'not mentioned'", "confidence": 0, "source": "unknown"}
  },
  "general_summary": {"value": "1-3 sentences capturing the overall feel, character, and key facts of the property as described by the agent — include mood and impressions ('feels very spacious', 'premium finish throughout') as well as factual highlights. Only use 'not mentioned' if literally nothing at all was said in the recording.", "confidence": 0, "source": "unknown"}
}`;

/** Build the full Pass 1 prompt. */
export function buildExtractionPrompt(): string {
  return `${EXTRACTION_SYSTEM_PROMPT}

Return ONLY this JSON object, fully populated for every field shown (use real extracted data, "not mentioned"/[] where nothing was said, a confidence 0-100, and a source for every field):

${EXTRACTION_SCHEMA}

Respond with ONLY the JSON object.`;
}

/**
 * QA-only Pass 1 prompt for pasted walkthrough text. It keeps the same
 * schema and provenance rules but removes the audio/transcription framing.
 */
export function buildTextExtractionPrompt(): string {
  return `You are Walkthrough AI's text extraction system.

Read the pasted property walkthrough below and convert the information it contains into the strict structured JSON format. Do not transcribe, summarize outside the JSON, or invent details. Extract the substance of what is written and preserve the speaker's meaning, attribution, uncertainty, estimates, and claims.

## CRITICAL RULES
- Use ONLY information explicitly present in the pasted walkthrough. Never add, infer, or invent property details.
- Preserve who supplied each claim. For example, "the seller said the roof was replaced" must use source seller_stated, not observed or user_confirmed.
- Preserve uncertainty and estimates such as "I think", "believed", "possibly", "around", "approximately", "may", and "unconfirmed" in the value and source metadata.
- If a field is not present, use value "not mentioned" (or [] for arrays), confidence 0, and source unknown.
- Every field object must include value, confidence, and source. Use the source vocabulary from the schema: observed, seller_stated, agent_stated, external_document, unverified, unknown, or conflicting. Do not use user_confirmed in Pass 1.
- Approximate or hedged details are still details: extract them with confidence 50-69 rather than treating them as absent.
- Correct obvious spelling or punctuation only when needed to understand the written walkthrough; do not strengthen the claim.
- Do not include fair-housing or demographic steering content.
- Respond with ONLY a valid JSON object. No markdown, code fences, transcription, or commentary.

Return ONLY this JSON object, fully populated for every field shown:

${EXTRACTION_SCHEMA}

Pasted walkthrough text:

[PASTED_WALKTHROUGH_TEXT]

Respond with ONLY the JSON object.`;
}

// ─── Validation / safe defaults ───────────────────────────────────────────────

/** Build a default "not mentioned" field at confidence 0. */
function emptyField<T>(empty: T): ExtractedField<T> {
  return { value: empty, confidence: 0, source: isFieldEmptyValue(empty) ? "unknown" : "observed" };
}

const VALID_SOURCES = new Set([
  "observed", "seller_stated", "agent_stated", "user_confirmed",
  "external_document", "unverified", "unknown", "conflicting",
]);

function isFieldEmptyValue(value: unknown): boolean {
  return value === "not mentioned" || (Array.isArray(value) && value.length === 0) || value === "" || value == null;
}

function sourceOf(raw: unknown, fallback: ExtractedField["source"]): ExtractedField["source"] {
  return typeof raw === "string" && VALID_SOURCES.has(raw) ? raw as ExtractedField["source"] : fallback;
}

/** Coerce an arbitrary parsed value into ExtractedField<T>, with a safe default. */
function coerceField<T>(raw: unknown, empty: T): ExtractedField<T> {
  if (raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    const r = raw as { value: unknown; confidence?: unknown; source?: unknown; note?: unknown };
    const confidence = typeof r.confidence === "number"
      ? Math.max(0, Math.min(100, r.confidence))
      : 0;
    const value = (r.value ?? empty) as T;
    return {
      value,
      confidence,
      source: sourceOf(r.source, isFieldEmptyValue(value) ? "unknown" : "observed"),
      ...(typeof r.note === "string" && r.note.trim() ? { note: r.note.trim() } : {}),
    };
  }
  return emptyField(empty);
}

/**
 * Validate and normalise a parsed Pass 1 response into a complete
 * ExtractionData object. Any missing/malformed field is filled with a
 * safe "not mentioned" / confidence-0 default — Pass 2 and
 * generate-followups can therefore assume every field exists.
 */
export function validateExtraction(parsed: Record<string, unknown>): ExtractionData {
  const p = parsed as Record<string, Record<string, unknown> | undefined>;

  const roomsRaw = (parsed.rooms as { value?: unknown; confidence?: unknown } | undefined);
  const roomsValue = Array.isArray(roomsRaw?.value) ? (roomsRaw!.value as unknown[]) : [];
  const rooms: RoomExtraction[] = roomsValue.map((r) => {
    const room = (r ?? {}) as Record<string, unknown>;
    return {
      name: coerceField<string>(room.name, "not mentioned"),
      condition: coerceField<string>(room.condition, "not mentioned"),
      observations: coerceField<string>(room.observations, "not mentioned"),
      maintenance_flags: coerceField<string[]>(room.maintenance_flags, []),
      dimensions: coerceField<string>(room.dimensions, "not mentioned"),
      flooring: coerceField<string>(room.flooring, "not mentioned"),
    };
  });

  const factSheet = p.fact_sheet ?? {};
  const clientNotes = p.client_notes ?? {};
  const offerNotes = p.offer_notes ?? {};
  const transactionNotes = p.transaction_notes ?? {};

  return {
    rooms: {
      value: rooms,
      confidence: typeof roomsRaw?.confidence === "number" ? roomsRaw!.confidence as number : (rooms.length > 0 ? 80 : 0),
    },
    fact_sheet: {
      beds: coerceField<string>(factSheet.beds, "not mentioned"),
      baths: coerceField<string>(factSheet.baths, "not mentioned"),
      sqft: coerceField<string>(factSheet.sqft, "not mentioned"),
      year_built: coerceField<string>(factSheet.year_built, "not mentioned"),
      lot: coerceField<string>(factSheet.lot, "not mentioned"),
      style: coerceField<string>(factSheet.style, "not mentioned"),
      price_range: coerceField<string>(factSheet.price_range, "not mentioned"),
    },
    features: coerceField<string[]>(parsed.features, []),
    renovations: coerceField<string[]>(parsed.renovations, []),
    issues: coerceField<string[]>(parsed.issues, []),
    highlights: coerceField<string[]>(parsed.highlights, []),
    client_notes: {
      preferences: coerceField<string[]>(clientNotes.preferences, []),
      priorities: coerceField<string[]>(clientNotes.priorities, []),
      likes: coerceField<string[]>(clientNotes.likes, []),
      dislikes: coerceField<string[]>(clientNotes.dislikes, []),
      budget_indicators: coerceField<string>(clientNotes.budget_indicators, "not mentioned"),
      next_steps: coerceField<string[]>(clientNotes.next_steps, []),
    },
    offer_notes: {
      amount: coerceField<string>(offerNotes.amount, "not mentioned"),
      conditions: coerceField<string[]>(offerNotes.conditions, []),
      timelines: coerceField<string>(offerNotes.timelines, "not mentioned"),
      financing_notes: coerceField<string>(offerNotes.financing_notes, "not mentioned"),
      contingencies: coerceField<string[]>(offerNotes.contingencies, []),
    },
    transaction_notes: {
      milestones: coerceField<{ step: string; status: string; date: string; notes: string }[]>(transactionNotes.milestones, []),
      missing_items: coerceField<string[]>(transactionNotes.missing_items, []),
      overall_status: coerceField<string>(transactionNotes.overall_status, "not mentioned"),
    },
    general_summary: coerceField<string>(parsed.general_summary, "not mentioned"),
  };
}

/** True if a field's value counts as "empty" (not mentioned / no data). */
function isFieldEmpty(value: unknown): boolean {
  if (value === "not mentioned") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value === null || value === undefined || value === "") return true;
  return false;
}

/** Get a field by dot-path from an ExtractionData object (read-only). */
function getFieldByPath(data: ExtractionData, path: string): ExtractedField<unknown> | undefined {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = data;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  if (cur && typeof cur === "object" && "value" in cur && "confidence" in cur) {
    return cur as ExtractedField<unknown>;
  }
  return undefined;
}

/**
 * Walk the extraction looking for follow-up candidates:
 *  - Required fields (per REQUIRED_FIELDS) that are empty/not-mentioned →
 *    ALWAYS produce a follow-up, regardless of confidence.
 *  - Fact-sheet fields below CONFIDENCE_THRESHOLD that have SOME value (not
 *    empty) → produce a "can you confirm/clarify" follow-up.
 *
 * Hard cap: MAX_QUESTIONS questions. Priority order:
 *   (1) required fact_sheet fields
 *   (2) other required fields (rooms, issues, etc.)
 *   (3) low-confidence (but non-empty) fact-sheet clarifications
 *   (4) low-confidence condition/feature clarifications
 *
 * Fields deliberately excluded from the candidate list:
 *  - client_notes.preferences/priorities/likes/dislikes/next_steps — CRM
 *    fields that require a client conversation, not a property walkthrough.
 *    An agent recording an empty property can't answer these, and asking them
 *    produces unanswerable, out-of-context questions.
 *  - offer/transaction fields — specialised output types; only produced when
 *    those outputs are selected and the data appears as a required path above.
 *
 * Zero questions is a valid outcome for a thorough walkthrough — there's no
 * artificial minimum. The frontend handles zero questions gracefully by
 * skipping the follow-up screen.
 */
/**
 * Maximum questions per document type (before deduplication across types).
 * This means selecting more document types can produce more questions,
 * up to the deduped global cap below.
 */
const MAX_QUESTIONS_PER_DOC = 5;

/**
 * Absolute maximum questions regardless of how many document types selected.
 * Prevents overwhelming the agent even when all 6 output types are chosen.
 */
const MAX_QUESTIONS_GLOBAL = 10;

export function findLowConfidenceFields(
  data: ExtractionData,
  requestedOutputs: { type: keyof typeof REQUIRED_FIELDS }[]
): FollowUpQuestion[] {
  // Collect required paths per document type separately so we can apply
  // per-doc caps before deduplication. This ensures each document type
  // gets its fair share of questions rather than being squeezed out by
  // another type's required fields dominating the global cap.
  const seenPaths = new Set<string>(); // for deduplication across doc types
  const allRequired: FollowUpQuestion[] = [];
  let qIndex = 1;

  // BUGFIX: basic property facts (beds/baths/sqft) were only ever asked
  // about if the agent selected a document type whose REQUIRED_FIELDS
  // happened to include them (currently only listing_pack). A run with
  // only e.g. disclosure_prep or offer_summary selected would never ask
  // about bedroom count at all, even with zero info captured — every
  // document type benefits from knowing basic facts about the property.
  // This baseline check runs once up front, independent of which
  // documents were selected, and only fires if ALL THREE core facts are
  // missing — a deliberately narrow trigger so it doesn't add noise to
  // walkthroughs that already captured the basics.
  const coreFacts = ["fact_sheet.beds", "fact_sheet.baths", "fact_sheet.sqft"];
  const allCoreFactsMissing = coreFacts.every((path) => {
    const field = getFieldByPath(data, path);
    return !field || isFieldEmpty(field.value);
  });
  if (allCoreFactsMissing) {
    for (const path of coreFacts) {
      seenPaths.add(path);
      allRequired.push({
        id: `q${qIndex++}`,
        question: buildRequiredQuestion(path),
        category: categoryForPath(path),
        field_path: path,
      });
    }
  }

  for (const { type } of requestedOutputs) {
    const docPaths = REQUIRED_FIELDS[type] ?? [];
    const docQuestions: FollowUpQuestion[] = [];

    for (const path of docPaths) {
      if (seenPaths.has(path)) continue; // already asked from another doc type
      const field = getFieldByPath(data, path);
      if (!field || isFieldEmpty(field.value)) {
        seenPaths.add(path);
        docQuestions.push({
          id: `q${qIndex++}`,
          question: buildRequiredQuestion(path),
          category: categoryForPath(path),
          field_path: path,
        });
      }
    }

    // Sort: fact_sheet first, then other
    docQuestions.sort((a, b) => {
      const aFact = a.field_path?.startsWith("fact_sheet") ? 0 : 1;
      const bFact = b.field_path?.startsWith("fact_sheet") ? 0 : 1;
      return aFact - bFact;
    });

    // Per-doc cap: don't let one document type flood the list
    allRequired.push(...docQuestions.slice(0, MAX_QUESTIONS_PER_DOC));
  }

  // Low-confidence clarification questions — lower priority than any required field.
  // These only fire when the extraction has a value but confidence is below threshold.
  // Only ask these if we still have room after required questions.
  const lowConfidenceFactSheet: FollowUpQuestion[] = [];
  const lowConfidenceOther: FollowUpQuestion[] = [];

  const factSheetPaths = [
    "fact_sheet.beds", "fact_sheet.baths", "fact_sheet.sqft",
    "fact_sheet.year_built", "fact_sheet.lot", "fact_sheet.style",
    "fact_sheet.price_range",
  ];
  for (const path of factSheetPaths) {
    if (seenPaths.has(path)) continue;
    const field = getFieldByPath(data, path);
    if (!field || isFieldEmpty(field.value)) continue;
    if (field.confidence >= CONFIDENCE_THRESHOLD) continue;

    const label = FIELD_LABELS[path] ?? path.replace(/[._]/g, " ");
    lowConfidenceFactSheet.push({
      id: `q${qIndex++}`,
      question: `We heard "${describeValue(field.value)}" for the ${label} — is that correct?`,
      category: categoryForPath(path),
      field_path: path,
    });
  }

  const conditionPaths = ["features", "renovations", "issues", "highlights"];
  for (const path of conditionPaths) {
    if (seenPaths.has(path)) continue;
    const field = getFieldByPath(data, path);
    if (!field || isFieldEmpty(field.value)) continue;
    if (field.confidence >= CONFIDENCE_THRESHOLD) continue;

    const label = FIELD_LABELS[path] ?? path.replace(/[._]/g, " ");
    lowConfidenceOther.push({
      id: `q${qIndex++}`,
      question: `We weren't fully sure about ${label} — can you confirm or add anything?`,
      category: categoryForPath(path),
      field_path: path,
    });
  }

  // Merge: required first (per-doc-capped and deduped), then low-confidence
  const all = [
    ...allRequired,
    ...lowConfidenceFactSheet,
    ...lowConfidenceOther,
  ];

  // Global cap — never overwhelm the agent regardless of output count
  return all.slice(0, MAX_QUESTIONS_GLOBAL);
}

/**
 * Build a natural, agent-appropriate question for a required field that
 * was not mentioned in the walkthrough audio. Reads as a normal conversation,
 * not a form label.
 */
function buildRequiredQuestion(path: string): string {
  if (path === "fact_sheet.beds")      return "How many bedrooms does the property have?";
  if (path === "fact_sheet.baths")     return "How many bathrooms does the property have?";
  if (path === "fact_sheet.sqft")      return "What's the approximate square footage?";
  if (path === "fact_sheet.year_built") return "What year was the property built?";
  if (path === "fact_sheet.lot")       return "What's the lot size?";
  if (path === "fact_sheet.style")     return "What's the property type — e.g. detached, semi-detached, terraced, bungalow?";
  if (path === "fact_sheet.price_range") return "What's the asking price or target price range?";
  if (path === "rooms")        return "Could you walk me through the main rooms — what did you see in each?";
  if (path === "issues")       return "Were there any known issues, defects, or maintenance concerns?";
  if (path === "features")     return "What are the key features or selling points of the property?";
  if (path === "renovations")  return "Have there been any recent renovations, upgrades, or improvements?";
  if (path === "offer_notes.amount")        return "What is the offer amount?";
  if (path === "offer_notes.timelines")     return "What are the key offer timelines — closing date, response deadline?";
  if (path === "offer_notes.financing_notes") return "What financing is the buyer using — mortgage, cash, other?";
  if (path === "transaction_notes.milestones")    return "What are the key transaction milestones — what's been done and what's pending?";
  if (path === "transaction_notes.overall_status") return "What's the current overall status of the transaction?";
  if (path === "client_notes.budget_indicators")  return "What's the client's budget range for this property?";
  // Generic fallback for any path not explicitly handled above
  const label = FIELD_LABELS[path] ?? path.replace(/[._]/g, " ");
  return `Could you provide the ${label}?`;
}

/** Short human description of a field value for use inside a follow-up question. */
function describeValue(value: unknown): string {
  if (Array.isArray(value)) return value.slice(0, 3).join(", ");
  return String(value);
}

/** Map a dot-path to a follow-up category label. */
function categoryForPath(path: string): string {
  if (path.startsWith("fact_sheet")) {
    if (path.endsWith("beds") || path.endsWith("baths") || path.endsWith("sqft")) return "Size";
    if (path.endsWith("year_built")) return "History";
    if (path.endsWith("price_range")) return "Price";
    return "Details";
  }
  if (path === "rooms") return "Layout";
  if (path === "issues") return "Condition";
  if (path === "features" || path === "highlights") return "Features";
  if (path.startsWith("client_notes")) return "Client";
  if (path.startsWith("offer_notes")) return "Offer";
  if (path.startsWith("transaction_notes")) return "Timeline";
  if (path === "renovations") return "Updates";
  return "Details";
}

// ─── Follow-up answer merging ─────────────────────────────────────────────────

/**
 * Merge agent-confirmed follow-up answers into an ExtractionData object
 * ahead of Pass 2. Each answer is keyed by the question's field_path and
 * overrides that field's value with confidence 100 — Pass 2 will then
 * treat it as a confirmed fact rather than "not mentioned".
 *
 * Answers without a recognised field_path (or for free-text-only
 * questions) are appended to general_summary so Pass 2 still sees them.
 */
export function mergeFollowUpAnswers(
  data: ExtractionData,
  questions: FollowUpQuestion[],
  answers: Record<string, string>
): ExtractionData {
  // Deep clone so we don't mutate the caller's object.
  const merged: ExtractionData = JSON.parse(JSON.stringify(data));

  const extraNotes: string[] = [];

  for (const q of questions) {
    const answer = answers[q.id]?.trim();
    if (!answer) continue;

    const normalizedAnswer = normalizeFollowUpAnswer(answer);
    if (!normalizedAnswer) continue;

    if (q.field_path) {
      const applied = setFieldByPath(merged, q.field_path, normalizedAnswer);
      if (applied) continue;
    }

    // No field_path, or couldn't apply — fold into the general summary
    extraNotes.push(`${q.question} ${normalizedAnswer}`);
  }

  if (extraNotes.length > 0) {
    const existing = merged.general_summary.value === "not mentioned" ? "" : merged.general_summary.value;
    const combined = [existing, ...extraNotes].filter(Boolean).join(" ");
    merged.general_summary = {
      value: combined,
      confidence: 100,
      source: "user_confirmed",
      note: "Supplemented by a follow-up answer",
    };
  }

  return merged;
}

/**
 * Set a field by dot-path to a confirmed value (confidence 100).
 * For array-typed fields, the answer is appended as a new entry rather
 * than replacing the whole list, since follow-up answers are usually
 * supplemental ("any issues?" → "leaky faucet in the kitchen").
 * Returns false if the path doesn't resolve to a known ExtractedField.
 */
function setFieldByPath(data: ExtractionData, path: string, answer: string): boolean {
  // BUGFIX: "rooms" and "transaction_notes.milestones" used to be rejected
  // here entirely (return false) because appending a raw answer string
  // would corrupt their structured array shapes (RoomExtraction[] and
  // milestone objects respectively). That meant the agent's actual answer
  // to "Could you walk me through the main rooms?" never reached the rooms
  // array at all — it was dumped into general_summary as one long sentence,
  // and Pass 2 (which has no audio context, text-only) usually failed to
  // re-extract a clean room breakdown from that prose. Net effect: the
  // agent visibly answered the follow-up, but Inspection Notes / the
  // listing room breakdown stayed empty. Same problem for milestones.
  //
  // Fix: build a minimal-but-valid structured entry from the free-text
  // answer and append it properly, instead of discarding the structure.
  if (path === "rooms") {
    return appendRoomAnswer(data, answer);
  }
  if (path === "transaction_notes.milestones") {
    return appendMilestoneAnswer(data, answer);
  }

  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null) return false;
    cur = cur[parts[i]];
  }
  const lastKey = parts[parts.length - 1];
  const field = cur?.[lastKey];
  if (!field || typeof field !== "object" || !("value" in field)) return false;

  if (Array.isArray(field.value)) {
    field.value = [...field.value, answer];
  } else {
    field.value = answer;
  }
  field.confidence = 100;
  field.source = "user_confirmed";
  field.note = "Confirmed or corrected through a follow-up answer";
  return true;
}

/**
 * Append a follow-up answer about rooms as a new RoomExtraction entry.
 * The answer is free text (e.g. "Kitchen has granite counters and a
 * breakfast bar, bathroom needs a new vanity") — we can't reliably parse
 * out individual room names from arbitrary prose without another AI call,
 * so we store the whole answer as one room entry's observations with a
 * generic name. This still gets the agent-confirmed content into the
 * structured rooms array where Pass 2 (and DocumentViewer / docx) expects
 * it, rather than losing it in general_summary where it's invisible to
 * room-based document sections.
 */
function appendRoomAnswer(data: ExtractionData, answer: string): boolean {
  const normalizedAnswer = normalizeFollowUpAnswer(answer);
  const newRoom: RoomExtraction = {
    name:              { value: "Additional details (from follow-up)", confidence: 100, source: "user_confirmed" },
    condition:         { value: "not mentioned", confidence: 0, source: "unknown" },
    observations:      { value: normalizedAnswer, confidence: 100, source: "user_confirmed", note: "Supplemented by a follow-up answer" },
    maintenance_flags: { value: [], confidence: 0 },
    dimensions:        { value: "not mentioned", confidence: 0 },
    flooring:          { value: "not mentioned", confidence: 0 },
  };
  data.rooms.value = [...data.rooms.value, newRoom];
  data.rooms.confidence = 100;
  return true;
}

/**
 * Make typed follow-up answers readable without inventing or strengthening
 * their meaning. Corrections are deliberately conservative: only common
 * shorthand/typos are changed, while attribution and uncertainty remain.
 * Pass 2 performs the final contextual prose drafting.
 */
export function normalizeFollowUpAnswer(answer: string): string {
  let cleaned = answer
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();

  const safeCorrections: Array<[RegExp, string]> = [
    [/\bsed\b/gi, "said"],
    [/\bchnged\b/gi, "changed"],
    [/\breno\b/gi, "renovation"],
    [/\bpls\b/gi, "please"],
    [/\bapprox\b/gi, "approximately"],
    [/\bim\b/gi, "I am"],
    [/\bdont\b/gi, "do not"],
    [/\bcant\b/gi, "cannot"],
    [/\bwont\b/gi, "will not"],
  ];
  for (const [pattern, replacement] of safeCorrections) cleaned = cleaned.replace(pattern, replacement);
  cleaned = cleaned.replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
  return cleaned;
}

/**
 * Append a follow-up answer about transaction milestones as a new
 * milestone entry, same reasoning as appendRoomAnswer above.
 */
function appendMilestoneAnswer(data: ExtractionData, answer: string): boolean {
  const newMilestone = { step: "Update from follow-up", status: "pending", date: "", notes: normalizeFollowUpAnswer(answer) };
  data.transaction_notes.milestones.value = [...data.transaction_notes.milestones.value, newMilestone];
  data.transaction_notes.milestones.confidence = 100;
  return true;
}
