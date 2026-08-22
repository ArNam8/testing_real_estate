/*
  # Two-pass Gemini pipeline support

  1. Changes to properties table
    - `extraction_data` (jsonb) — Pass 1 structured extraction output,
      including per-field confidence scores (0-100) and "not mentioned"
      markers. This is the source of truth that Pass 2 (document
      generation) and generate-followups both read from.
    - `pipeline_status` (text) — fine-grained status used by the frontend
      to show "Retrying..." instead of a generic error while the edge
      function is waiting out a Gemini rate limit. One of:
        'idle', 'extracting', 'retrying_extraction',
        'generating', 'retrying_generation', 'done', 'error'
    - `audio_deleted` (boolean) — true once the walkthrough audio file has
      been removed from storage after a successful Pass 2. Lets the UI
      show a small "audio deleted for privacy" note without re-checking
      storage.

  2. Notes
    - extraction_data shape (per field): { value: string | string[] | object,
      confidence: number (0-100) }. A value of "not mentioned" with
      confidence 0 means Gemini found nothing for that field.
    - No data migration needed — existing rows simply have NULL/false
      for the new columns until they go through the new pipeline.
*/

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS extraction_data jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pipeline_status text DEFAULT 'idle'
    CHECK (pipeline_status IN (
      'idle', 'extracting', 'retrying_extraction',
      'generating', 'retrying_generation', 'done', 'error'
    )),
  ADD COLUMN IF NOT EXISTS audio_deleted boolean DEFAULT false;
