import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const workspace = read('src/components/buyer/BuyerWorkspace.tsx');
const service = read('src/services/supabase.ts');
const edge = read('supabase/functions/transcribe-agent-buyer-brief/index.ts');

assert.match(workspace, /Record with buyer now/);
assert.match(workspace, /Start recording/);
assert.match(workspace, /Finish recording/);
assert.match(workspace, /REVIEW BEFORE SAVING/);
assert.match(workspace, /Save Buyer Brief/);
assert.match(workspace, /Send preferences link/);
assert.match(workspace, /agentBuyerBriefTranscribe/);
assert.match(service, /transcribe-agent-buyer-brief/);
assert.match(edge, /Authorization/);
assert.match(edge, /buyerSearchId/);
assert.match(edge, /agent_id/);
assert.match(edge, /Preserve uncertainty/);
assert.match(edge, /draft for the agent to edit before saving/);
console.log('V87 agent Buyer Brief microphone contract checks passed.');
