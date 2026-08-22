/*
  # Create properties table and audio storage bucket

  1. New Tables
    - `properties`
      - `id` (uuid, primary key) - Unique property listing identifier
      - `address` (text, not null) - Property street address
      - `audio_storage_path` (text) - Path to audio file in Supabase storage
      - `status` (text, default 'recording') - One of: recording, processing, completed, error
      - `mls_description` (text) - Generated MLS listing description
      - `feature_bullets` (text) - JSON array of feature bullet points
      - `agent_remarks` (text) - Private agent remarks
      - `crm_summary` (text) - CRM summary card text
      - `error_message` (text) - Error details if generation failed
      - `created_at` (timestamptz, default now()) - Record creation timestamp

  2. Security
    - Enable RLS on `properties` table
    - Add policies for authenticated users to CRUD their own data
    - All operations require authentication and ownership verification

  3. Storage
    - Create `walkthrough-audio` bucket for storing audio recordings
    - Set bucket to private (access via signed URLs only)

  4. Indexes
    - Index on created_at for timeline ordering
*/

CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address text NOT NULL,
  audio_storage_path text,
  status text NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'processing', 'completed', 'error')),
  mls_description text,
  feature_bullets text,
  agent_remarks text,
  crm_summary text,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own properties"
  ON properties FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own properties"
  ON properties FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own properties"
  ON properties FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own properties"
  ON properties FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);

-- Insert storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('walkthrough-audio', 'walkthrough-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: users can upload their own audio
CREATE POLICY "Users can upload own audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'walkthrough-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policy: users can read their own audio
CREATE POLICY "Users can read own audio"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'walkthrough-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policy: users can delete their own audio
CREATE POLICY "Users can delete own audio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'walkthrough-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
