/*
  # Add document_paths column

  Walkthrough AI now generates real .docx files server-side and stores them
  in Supabase Storage. This column holds a JSON map of output type → storage
  path for each generated document.

  Example value:
  {
    "listing_pack":       "documents/{userId}/{propertyId}/listing_pack.docx",
    "inspection_notes":   "documents/{userId}/{propertyId}/inspection_notes.docx"
  }

  The existing per-document jsonb columns (listing_pack, inspection_notes, etc.)
  continue to hold the raw Gemini JSON — kept for backward compatibility and
  potential future use. document_paths is the new source of truth for downloads
  and the in-app viewer.
*/

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS document_paths jsonb DEFAULT NULL;

-- Storage policies for generated .docx files
-- Documents are stored in walkthrough-audio bucket under documents/{userId}/{propertyId}/
-- (same bucket as audio, separate folder, same RLS pattern)

INSERT INTO storage.buckets (id, name, public) VALUES ('walkthrough-audio', 'walkthrough-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Users can read their own generated documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname = 'Users can read own documents'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can read own documents"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'walkthrough-audio'
        AND (auth.uid())::text = (storage.foldername(name))[2]
        AND (storage.foldername(name))[1] = 'documents'
      )
    $policy$;
  END IF;
END $$;
