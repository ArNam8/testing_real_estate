/*
  # Create brand_kits table

  1. New Table
    - `brand_kits`
      - `id` (uuid, primary key)
      - `user_id` (uuid, unique, references auth.users) — one Brand Kit per user
      - `brand_name` (text) — shown in generated documents in place of
        "Walkthrough AI" once a kit exists
      - `primary_color_key` (text) — key into the fixed 30-color palette
        (see supabase/functions/_shared/palette.ts / src/utils/brandPalette.ts)
      - `secondary_color_key` (text) — key into the same palette
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Users can select/insert/update/delete only their own row

  3. Notes
    - Colors are stored as palette KEYS (e.g. "forest"), never raw hex —
      the palette itself is fixed, so this keeps documents/viewer rendering
      simple and avoids storing arbitrary user-supplied color values.
    - No logo support yet (deliberately out of scope for this pass).
*/

CREATE TABLE IF NOT EXISTS brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name text NOT NULL DEFAULT 'Walkthrough AI',
  primary_color_key text NOT NULL DEFAULT 'navy',
  secondary_color_key text NOT NULL DEFAULT 'sage',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brand kit"
  ON brand_kits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brand kit"
  ON brand_kits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brand kit"
  ON brand_kits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own brand kit"
  ON brand_kits FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_brand_kits_user_id ON brand_kits(user_id);
