/*
  # Clean up unused auxiliary tables

  The tables property_rooms, property_features, property_renovations,
  property_issues, property_follow_ups, and property_outputs were created
  in migration 20260603152804 but were never written to by the application.
  All structured data is stored as JSONB columns directly on the properties
  table, which is the correct and intended design.

  This migration:
  1. Drops all six unused auxiliary tables (CASCADE handles their policies/indexes)
  2. Drops the current_step column added in the same migration, which was
     replaced by workflow_stage in migration 20260605152156
  3. Ensures workflow_stage has a clean default of 'walkthrough' (not 'name',
     which was the old orphaned value from a removed NameStage screen)

  Data impact: none — these tables were never populated.
*/

-- Drop unused auxiliary tables.
-- CASCADE automatically removes their RLS policies and indexes.
DROP TABLE IF EXISTS property_outputs    CASCADE;
DROP TABLE IF EXISTS property_follow_ups CASCADE;
DROP TABLE IF EXISTS property_issues     CASCADE;
DROP TABLE IF EXISTS property_renovations CASCADE;
DROP TABLE IF EXISTS property_features   CASCADE;
DROP TABLE IF EXISTS property_rooms      CASCADE;

-- Drop the current_step column that was superseded by workflow_stage.
-- The CHECK constraint is dropped automatically with the column.
ALTER TABLE properties
  DROP COLUMN IF EXISTS current_step;

-- Fix the workflow_stage default.
-- Old default was 'name' (from a removed screen); new default is 'walkthrough'.
ALTER TABLE properties
  ALTER COLUMN workflow_stage SET DEFAULT 'walkthrough';

-- Back-fill any existing rows that have 'name' as their workflow_stage
-- (these are stale records from the old flow that never progressed).
UPDATE properties
  SET workflow_stage = 'walkthrough'
  WHERE workflow_stage = 'name';
