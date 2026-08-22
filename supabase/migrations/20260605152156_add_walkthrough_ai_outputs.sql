-- Add new output columns for the renamed Walkthrough AI product
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS selected_outputs text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS listing_pack jsonb,
  ADD COLUMN IF NOT EXISTS inspection_notes jsonb,
  ADD COLUMN IF NOT EXISTS client_summary jsonb,
  ADD COLUMN IF NOT EXISTS offer_summary jsonb,
  ADD COLUMN IF NOT EXISTS transaction_timeline jsonb,
  ADD COLUMN IF NOT EXISTS disclosure_prep jsonb,
  ADD COLUMN IF NOT EXISTS follow_up_questions jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS follow_up_answers jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS workflow_stage text DEFAULT 'name';

-- Rename status values conceptually (existing data keeps working)
-- 'recording' maps to 'walkthrough', 'extraction' maps to 'generate'
-- We'll handle mapping in the app layer rather than altering existing data