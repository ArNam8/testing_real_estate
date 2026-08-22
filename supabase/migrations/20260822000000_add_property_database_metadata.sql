/*
  Property Database metadata

  Keeps extraction_data as the canonical structured property record while
  adding only the metadata needed for persistence, truthful document status,
  and independent regeneration limits.
*/

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_data_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS document_data_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS document_regeneration_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS document_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;

/*
  Atomic property-data save. The client may use this RPC when available so a
  saved edit and its monotonically increasing version cannot be split across
  two writes. It is intentionally owner-scoped and returns only the updated
  property metadata needed by the client.
*/
CREATE OR REPLACE FUNCTION save_property_facts(
  p_property_id uuid,
  p_extraction_data jsonb
)
RETURNS TABLE(property_data_version integer, extraction_data jsonb)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE properties
  SET extraction_data = p_extraction_data,
      property_data_version = COALESCE(property_data_version, 0) + 1
  WHERE id = p_property_id
    AND user_id = auth.uid()
  RETURNING properties.property_data_version, properties.extraction_data;
$$;
