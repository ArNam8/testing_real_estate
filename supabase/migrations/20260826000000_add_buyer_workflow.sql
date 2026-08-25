/*
  Walkthrough V86: buyer workflow.
  All durable data is agent-owned. Public buyer browsers access only narrowly
  scoped, revocable token endpoints; they never receive direct table access.
*/

CREATE TABLE IF NOT EXISTS buyer_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  label text NOT NULL DEFAULT 'New buyer search' CHECK (char_length(trim(label)) BETWEEN 1 AND 140),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','waiting_preferences','preferences_received','source_review','shortlist_shared','tour_requests','complete')),
  preferences_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buyer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_search_id uuid NOT NULL REFERENCES buyer_searches(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('preferences','shortlist')),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buyer_preference_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_search_id uuid NOT NULL REFERENCES buyer_searches(id) ON DELETE CASCADE,
  buyer_link_id uuid NOT NULL REFERENCES buyer_links(id) ON DELETE CASCADE,
  transcript text NOT NULL CHECK (char_length(transcript) BETWEEN 1 AND 12000),
  preferences_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buyer_homes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_search_id uuid NOT NULL REFERENCES buyer_searches(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  listing_url text NOT NULL CHECK (listing_url ~ '^https?://'),
  image_url text,
  summary text,
  agent_reason text,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 20),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','tour_requested','not_interested','tour_booked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(buyer_search_id, listing_url)
);

CREATE TABLE IF NOT EXISTS buyer_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_search_id uuid NOT NULL REFERENCES buyer_searches(id) ON DELETE CASCADE,
  buyer_home_id uuid REFERENCES buyer_homes(id) ON DELETE SET NULL,
  buyer_link_id uuid NOT NULL REFERENCES buyer_links(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('fits','concern','question','tour_request','message')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buyer_availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_search_id uuid NOT NULL REFERENCES buyer_searches(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','booked','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE(buyer_search_id, starts_at)
);

CREATE TABLE IF NOT EXISTS tour_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_search_id uuid NOT NULL REFERENCES buyer_searches(id) ON DELETE CASCADE,
  buyer_home_id uuid NOT NULL REFERENCES buyer_homes(id) ON DELETE CASCADE,
  buyer_link_id uuid NOT NULL REFERENCES buyer_links(id) ON DELETE CASCADE,
  availability_slot_id uuid REFERENCES buyer_availability_slots(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','declined','alternative_needed')),
  buyer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notices ADD COLUMN IF NOT EXISTS buyer_search_id uuid REFERENCES buyer_searches(id) ON DELETE CASCADE;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS buyer_home_id uuid REFERENCES buyer_homes(id) ON DELETE SET NULL;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS tour_request_id uuid REFERENCES tour_requests(id) ON DELETE SET NULL;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS buyer_link_id uuid REFERENCES buyer_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_buyer_searches_agent ON buyer_searches(agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_buyer_links_hash ON buyer_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_buyer_homes_search ON buyer_homes(buyer_search_id, display_order);
CREATE INDEX IF NOT EXISTS idx_buyer_slots_search ON buyer_availability_slots(buyer_search_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_tour_requests_agent ON tour_requests(agent_id, status, created_at DESC);

ALTER TABLE buyer_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_preference_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents manage own buyer searches" ON buyer_searches FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents manage own buyer links" ON buyer_links FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents view own buyer preferences" ON buyer_preference_submissions FOR SELECT TO authenticated USING (agent_id = auth.uid());
CREATE POLICY "Agents manage own buyer homes" ON buyer_homes FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents view own buyer feedback" ON buyer_feedback FOR SELECT TO authenticated USING (agent_id = auth.uid());
CREATE POLICY "Agents manage own availability" ON buyer_availability_slots FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents manage own tour requests" ON tour_requests FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
