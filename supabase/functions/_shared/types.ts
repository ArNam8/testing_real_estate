/**
 * _shared/types.ts
 * Shared type definitions for the Walkthrough AI edge functions.
 *
 * Both `generate` and `generate-followups` operate on the same
 * "extraction" data structure produced by Pass 1 (audio → structured
 * JSON with confidence scores). Keeping the shape in one place ensures
 * the two functions never drift apart.
 */

/** The six document types Walkthrough AI can produce. */
export type OutputType =
  | "listing_pack"
  | "inspection_notes"
  | "client_summary"
  | "offer_summary"
  | "transaction_timeline"
  | "disclosure_prep";

/**
 * A single extracted field: the value Gemini found (or "not mentioned")
 * plus a 0-100 confidence score. confidence 0 always pairs with
 * value === "not mentioned" (or an empty array for list fields).
 */
export type FactSource =
  | "observed"
  | "seller_stated"
  | "agent_stated"
  | "user_confirmed"
  | "external_document"
  | "unverified"
  | "unknown"
  | "conflicting";

export interface ExtractedField<T = unknown> {
  value: T;
  confidence: number;
  /** Where the value came from and how it may be phrased downstream. */
  source?: FactSource;
  /** Optional qualifier preserved for document generation. */
  note?: string;
}

/**
 * Pass 1 output shape. This is the canonical structured representation
 * of everything Gemini understood from the walkthrough audio (translated
 * to English if needed). Pass 2 reads ONLY from this object — it never
 * sees the audio again.
 */
export interface ExtractionData {
  rooms: ExtractedField<RoomExtraction[]>;
  fact_sheet: {
    beds: ExtractedField<string>;
    baths: ExtractedField<string>;
    sqft: ExtractedField<string>;
    year_built: ExtractedField<string>;
    lot: ExtractedField<string>;
    style: ExtractedField<string>;
    price_range: ExtractedField<string>;
  };
  features: ExtractedField<string[]>;
  renovations: ExtractedField<string[]>;
  issues: ExtractedField<string[]>;
  highlights: ExtractedField<string[]>;
  client_notes: {
    preferences: ExtractedField<string[]>;
    priorities: ExtractedField<string[]>;
    likes: ExtractedField<string[]>;
    dislikes: ExtractedField<string[]>;
    budget_indicators: ExtractedField<string>;
    next_steps: ExtractedField<string[]>;
  };
  offer_notes: {
    amount: ExtractedField<string>;
    conditions: ExtractedField<string[]>;
    timelines: ExtractedField<string>;
    financing_notes: ExtractedField<string>;
    contingencies: ExtractedField<string[]>;
  };
  transaction_notes: {
    milestones: ExtractedField<{ step: string; status: string; date: string; notes: string }[]>;
    missing_items: ExtractedField<string[]>;
    overall_status: ExtractedField<string>;
  };
  /** Free-text summary of anything notable that doesn't fit the fields above. */
  general_summary: ExtractedField<string>;
}

/** Room-level extraction with per-field confidence. */
export interface RoomExtraction {
  name: ExtractedField<string>;
  condition: ExtractedField<string>;
  observations: ExtractedField<string>;
  maintenance_flags: ExtractedField<string[]>;
  dimensions: ExtractedField<string>;
  flooring: ExtractedField<string>;
}

/** A follow-up question, with the extraction field path it targets. */
export interface FollowUpQuestion {
  id: string;
  question: string;
  category: string;
  /** Dot-path into ExtractionData this question is trying to fill, e.g. "fact_sheet.sqft" */
  field_path?: string;
}

/** Returned to the client when the audio contains too little information. */
export interface SparseAudioResult {
  sparse_audio: true;
  captured_rooms: string[];
  captured_details: string;
  missing_fields: string[];
  message: string;
}

/**
 * Confidence threshold (0-100). Any extracted field with a confidence
 * score below this is a candidate for a follow-up question.
 */
export const CONFIDENCE_THRESHOLD = 70;

/**
 * Per-document-type required fields. If these dot-paths into
 * ExtractionData are "not mentioned" / empty / confidence 0, a follow-up
 * question is FORCED regardless of whether the confidence threshold was met
 * (a field can't be "confidently" not mentioned and also satisfy a hard
 * requirement).
 *
 * Design principles:
 *  - Only include fields that a walkthrough recording can actually provide.
 *  - Exclude fields that presume a client conversation happened (preferences,
 *    next steps, likes/dislikes) — these are CRM fields, not walkthrough fields.
 *    Forcing them as required questions produces out-of-context prompts that
 *    agents can't meaningfully answer from a property recording.
 *  - Keep lists short: a hard cap of 5 questions is enforced downstream in
 *    findLowConfidenceFields(), with fact_sheet fields taking priority.
 */
export const REQUIRED_FIELDS: Record<OutputType, string[]> = {
  // BUGFIX: "fact_sheet.lot" and "fact_sheet.price_range" used to be
  // entirely absent from every document type's required list. That meant
  // they were NEVER asked about as follow-up questions, no matter how
  // empty they were — they'd just silently ship as "not mentioned" in
  // every document forever. Added here so listing_pack (the document
  // that most needs them) will prompt for them when missing. The per-doc
  // cap of 5 questions still applies, so beds/baths/sqft/style keep
  // priority via the existing fact_sheet-first sort — lot and price only
  // get asked if there's room left after the core facts.
  listing_pack: [
    "fact_sheet.beds", "fact_sheet.baths", "fact_sheet.sqft",
    "fact_sheet.style", "fact_sheet.year_built",
    "fact_sheet.lot", "fact_sheet.price_range",
    "features",
  ],
  inspection_notes: ["rooms", "issues"],
  // client_summary: the new schema always generates property_appeal from
  // the extraction data itself, so no fields are strictly required as
  // follow-up questions — the document will never be blank even with zero
  // questions asked. We still ask about features/highlights if missing,
  // since those feed the standout_features section.
  client_summary: ["features", "highlights"],
  offer_summary: [
    "offer_notes.amount", "offer_notes.timelines",
    "offer_notes.financing_notes",
  ],
  transaction_timeline: [
    "transaction_notes.milestones", "transaction_notes.overall_status",
  ],
  disclosure_prep: ["issues", "renovations"],
};

/** Human-readable labels for required-field dot-paths, used in follow-up question text. */
export const FIELD_LABELS: Record<string, string> = {
  "fact_sheet.beds": "number of bedrooms",
  "fact_sheet.baths": "number of bathrooms",
  "fact_sheet.sqft": "approximate square footage",
  "fact_sheet.year_built": "year the property was built",
  "fact_sheet.lot": "lot size",
  "fact_sheet.style": "architectural style",
  "fact_sheet.price_range": "asking price or price range",
  rooms: "a room-by-room walkthrough",
  issues: "any known issues or maintenance concerns",
  features: "key property features",
  renovations: "any recent renovations or upgrades",
  "client_notes.preferences": "the client's preferences",
  "client_notes.next_steps": "agreed next steps",
  "client_notes.priorities": "the client's top priorities",
  "client_notes.likes": "what the client liked about the property",
  "client_notes.dislikes": "what the client didn't like about the property",
  "client_notes.budget_indicators": "the client's budget range",
  "offer_notes.amount": "the offer amount",
  "offer_notes.timelines": "the offer timeline (closing date, response deadline, etc.)",
  "offer_notes.financing_notes": "the financing details",
  "offer_notes.conditions": "any conditions attached to the offer",
  "offer_notes.contingencies": "any contingencies in the offer",
  "transaction_notes.milestones": "transaction milestones / timeline",
  "transaction_notes.overall_status": "the current status of the transaction",
  "transaction_notes.missing_items": "any outstanding items needed to move forward",
};
