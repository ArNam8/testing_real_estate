/*
  Walkthrough V84: Seller Home Launch Checklist.
  All records are agent-owned. Seller browsers never receive direct table access;
  public data is served only through a revocable, SHA-256-token edge function.
*/

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  email text,
  role text NOT NULL DEFAULT 'seller' CHECK (role IN ('seller', 'buyer', 'both')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS home_launch_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE UNIQUE,
  seller_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'shared', 'submitted', 'under_review', 'ready')),
  agent_intro text,
  launch_target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS home_launch_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES home_launch_plans(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('fix', 'prepare', 'proof', 'access')),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 180),
  why_it_matters text,
  mandatory boolean NOT NULL DEFAULT false,
  requires_upload boolean NOT NULL DEFAULT false,
  requires_review boolean NOT NULL DEFAULT true,
  due_date date,
  display_order integer NOT NULL DEFAULT 0,
  seller_status text NOT NULL DEFAULT 'not_started' CHECK (seller_status IN ('not_started', 'in_progress', 'submitted', 'needs_help', 'not_applicable', 'reviewed')),
  seller_completion_date date,
  seller_note text,
  agent_review_status text NOT NULL DEFAULT 'pending' CHECK (agent_review_status IN ('pending', 'approved', 'follow_up')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seller_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES home_launch_plans(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seller_task_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES home_launch_plans(id) ON DELETE CASCADE,
  task_id uuid REFERENCES home_launch_tasks(id) ON DELETE SET NULL,
  seller_link_id uuid NOT NULL REFERENCES seller_links(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('task_update', 'task_upload', 'fact_response', 'message', 'final_submit')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES home_launch_plans(id) ON DELETE CASCADE,
  task_id uuid REFERENCES home_launch_tasks(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES seller_task_submissions(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'handled', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_contacts_agent ON contacts(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launch_plans_agent ON home_launch_plans(agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_launch_tasks_plan ON home_launch_tasks(plan_id, display_order);
CREATE INDEX IF NOT EXISTS idx_seller_links_hash ON seller_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_notices_agent ON notices(agent_id, status, created_at DESC);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_launch_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_launch_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents manage own contacts" ON contacts FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents manage own launch plans" ON home_launch_plans FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents manage own launch tasks" ON home_launch_tasks FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents manage own seller links" ON seller_links FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents view own seller submissions" ON seller_task_submissions FOR SELECT TO authenticated USING (agent_id = auth.uid());
CREATE POLICY "Agents manage own notices" ON notices FOR ALL TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());

