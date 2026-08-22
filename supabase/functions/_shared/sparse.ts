/**
 * _shared/sparse.ts
 * Sparse-audio detection and Pass 2 output validation.
 *
 * Sparse detection is now derived directly from Pass 1's extraction
 * output (no separate Gemini call needed) — if almost every field is
 * "not mentioned" / confidence 0, the recording was effectively empty
 * and we should let the user fill in details manually rather than
 * generate a document that's mostly "not mentioned" badges.
 */

import type { ExtractionData, OutputType, SparseAudioResult } from "./types.ts";

/** Minimum number of "populated" top-level signals before we call a recording usable. */
const MIN_POPULATED_SIGNALS = 2;

/**
 * Inspect a validated ExtractionData object and decide whether the
 * recording was too sparse to generate meaningful documents.
 *
 * "Populated" signals counted: rooms with any non-empty field, plus each
 * of features/renovations/issues/highlights/general_summary that has
 * real content (non-"not mentioned", non-empty).
 */
export function detectSparseExtraction(data: ExtractionData): {
  isSparse: boolean;
  capturedRooms: string[];
  capturedDetails: string;
  missingFields: string[];
} {
  let populatedSignals = 0;

  const capturedRooms = data.rooms.value
    .map((r) => r.name.value)
    .filter((n) => n && n !== "not mentioned");

  if (capturedRooms.length > 0) populatedSignals++;

  const arrayFields: { value: string[] }[] = [
    data.features, data.renovations, data.issues, data.highlights,
  ];
  for (const f of arrayFields) {
    if (f.value.length > 0) populatedSignals++;
  }

  if (data.general_summary.value !== "not mentioned" && data.general_summary.value.trim().length > 0) {
    populatedSignals++;
  }

  const isSparse = populatedSignals < MIN_POPULATED_SIGNALS && capturedRooms.length < 2;

  // Build a human-readable summary of what was captured.
  const capturedParts: string[] = [];
  if (capturedRooms.length > 0) capturedParts.push(`Rooms mentioned: ${capturedRooms.join(", ")}.`);
  if (data.general_summary.value !== "not mentioned") capturedParts.push(data.general_summary.value);
  const capturedDetails = capturedParts.join(" ");

  // Suggest the most commonly-needed missing fields for the fill-in form.
  const missingFields: string[] = [];
  if (data.fact_sheet.beds.value === "not mentioned") missingFields.push("beds");
  if (data.fact_sheet.baths.value === "not mentioned") missingFields.push("baths");
  if (data.fact_sheet.sqft.value === "not mentioned") missingFields.push("sqft");
  if (data.fact_sheet.year_built.value === "not mentioned") missingFields.push("year_built");
  if (data.issues.value.length === 0) missingFields.push("condition");
  if (data.features.value.length === 0) missingFields.push("features");
  if (data.fact_sheet.price_range.value === "not mentioned") missingFields.push("price_range");

  return { isSparse, capturedRooms, capturedDetails, missingFields };
}

/** Build the SparseAudioResult payload returned to the client. */
export function buildSparseResult(
  detection: ReturnType<typeof detectSparseExtraction>
): SparseAudioResult {
  return {
    sparse_audio: true,
    captured_rooms: detection.capturedRooms,
    captured_details: detection.capturedDetails || "Very little detail was captured from the recording.",
    missing_fields: detection.missingFields.length > 0
      ? detection.missingFields
      : ["beds", "baths", "sqft", "condition", "features"],
    message: "Your recording was quite brief. We captured what we could — please fill in the missing details below before generating your documents.",
  };
}

// ─── Pass 2 output validation ─────────────────────────────────────────────────

/**
 * Validate that the parsed Pass 2 response contains at least some real
 * content for each requested output type. Returns warnings (non-fatal)
 * and whether the response is usable at all.
 */
export function validateGenerationResponse(
  parsed: Record<string, unknown>,
  requestedOutputs: OutputType[]
): { usable: boolean; warnings: string[]; emptyOutputs: OutputType[] } {
  const warnings: string[] = [];
  const emptyOutputs: OutputType[] = [];
  let usableOutputCount = 0;

  for (const outputType of requestedOutputs) {
    const value = parsed[outputType];

    if (!value) {
      warnings.push(`${outputType}: missing entirely from response`);
      emptyOutputs.push(outputType);
      continue;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      warnings.push(`${outputType}: unexpected type (${typeof value})`);
      emptyOutputs.push(outputType);
      continue;
    }
    const keys = Object.keys(value as object);
    if (keys.length === 0) {
      warnings.push(`${outputType}: empty object`);
      emptyOutputs.push(outputType);
      continue;
    }

    const hasRealContent = Object.values(value as Record<string, unknown>).some((v) => {
      if (typeof v === "string") return v.length > 0 && v !== "not mentioned";
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "object" && v !== null) return Object.keys(v).length > 0;
      return false;
    });

    if (hasRealContent) {
      usableOutputCount++;
    } else {
      // BUGFIX: this used to only feed into the overall usable/not-usable
      // decision below, which only required ONE requested document to have
      // content for the whole batch to be saved. That meant e.g. 4 out of 5
      // requested documents could come back completely empty and still get
      // silently saved to the DB with no error shown — exactly the
      // "downloaded document has nothing filled in" symptom. Now we track
      // each empty output explicitly so the caller can log/handle them
      // individually instead of only seeing one aggregate "usable: true".
      warnings.push(`${outputType}: all fields returned "not mentioned" — extraction may be too sparse`);
      emptyOutputs.push(outputType);
    }
  }

  return { usable: usableOutputCount > 0, warnings, emptyOutputs };
}
