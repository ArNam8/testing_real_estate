/*
  # Add Structured Property Intelligence Tables

  1. New Tables
    - `property_rooms` - Room-by-room details
    - `property_features` - Feature list with categories
    - `property_renovations` - Renovation history
    - `property_issues` - Identified issues/concerns
    - `property_follow_ups` - Missing information follow-ups
    - `property_outputs` - Generated output selection and results

  2. Changes to properties table
    - Add structured_data JSONB for final extracted intelligence
    - Add extraction_confidence numeric
    - Add current_step for workflow enforcement

  3. Security
    - RLS enabled on all new tables
    - Policies restrict access to property owner
*/

-- Add new columns to properties table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'structured_data'
  ) THEN
    ALTER TABLE properties ADD COLUMN structured_data JSONB DEFAULT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'extraction_confidence'
  ) THEN
    ALTER TABLE properties ADD COLUMN extraction_confidence numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'current_step'
  ) THEN
    ALTER TABLE properties ADD COLUMN current_step text NOT NULL DEFAULT 'project_creation' 
      CHECK (current_step IN ('project_creation', 'recording', 'extraction', 'follow_ups', 'output_selection', 'generation'));
  END IF;
END $$;

-- Rooms table
CREATE TABLE IF NOT EXISTS property_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_name text NOT NULL,
  dimensions text,
  flooring text,
  condition text,
  features text[],
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own property rooms"
  ON property_rooms FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_rooms.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own property rooms"
  ON property_rooms FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_rooms.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own property rooms"
  ON property_rooms FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_rooms.property_id
      AND properties.user_id = auth.uid()
    )
  );

-- Features table
CREATE TABLE IF NOT EXISTS property_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category text NOT NULL,
  feature text NOT NULL,
  details text,
  priority text DEFAULT 'standard',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own property features"
  ON property_features FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_features.property_id
      AND properties.user_id = auth.uid()
    )
  );

-- Renovations table
CREATE TABLE IF NOT EXISTS property_renovations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  item text NOT NULL,
  year integer,
  condition text,
  cost_estimate text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_renovations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own property renovations"
  ON property_renovations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_renovations.property_id
      AND properties.user_id = auth.uid()
    )
  );

-- Issues table
CREATE TABLE IF NOT EXISTS property_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  severity text NOT NULL,
  description text NOT NULL,
  location text,
  status text DEFAULT 'identified',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own property issues"
  ON property_issues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_issues.property_id
      AND properties.user_id = auth.uid()
    )
  );

-- Follow-ups table
CREATE TABLE IF NOT EXISTS property_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  question text NOT NULL,
  category text NOT NULL,
  answer text,
  answered boolean DEFAULT false,
  answer_type text DEFAULT 'voice',
  created_at timestamptz DEFAULT now(),
  answered_at timestamptz
);

ALTER TABLE property_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own property follow-ups"
  ON property_follow_ups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_follow_ups.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own property follow-ups"
  ON property_follow_ups FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_follow_ups.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own property follow-ups"
  ON property_follow_ups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_follow_ups.property_id
      AND properties.user_id = auth.uid()
    )
  );

-- Outputs table
CREATE TABLE IF NOT EXISTS property_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  output_type text NOT NULL,
  content text,
  generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own property outputs"
  ON property_outputs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_outputs.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own property outputs"
  ON property_outputs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_outputs.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own property outputs"
  ON property_outputs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_outputs.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_property_rooms_property_id ON property_rooms(property_id);
CREATE INDEX IF NOT EXISTS idx_property_features_property_id ON property_features(property_id);
CREATE INDEX IF NOT EXISTS idx_property_renovations_property_id ON property_renovations(property_id);
CREATE INDEX IF NOT EXISTS idx_property_issues_property_id ON property_issues(property_id);
CREATE INDEX IF NOT EXISTS idx_property_follow_ups_property_id ON property_follow_ups(property_id);
CREATE INDEX IF NOT EXISTS idx_property_outputs_property_id ON property_outputs(property_id);
