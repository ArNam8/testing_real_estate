import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const generate = read('src/components/workflow/GenerateStage.tsx');
const launchPlan = read('src/components/launch/HomeLaunchPlan.tsx');
const sellerPortal = read('src/components/launch/SellerPortal.tsx');
const generator = read('supabase/functions/generate-launch-plan/index.ts');
const shell = read('src/components/workflow/WorkflowShell.tsx');

// The familiar workflow must remain five complete stages; Home Launch starts after it.
assert.match(shell, /walkthrough[\s\S]*outputs[\s\S]*followup[\s\S]*photos[\s\S]*generate/);
assert.ok(generate.indexOf('Document list') < generate.indexOf('Now get the house ready'), 'Home Launch must appear after the completed document list.');
assert.match(generate, /optional next job—not a sixth required workflow step/);

// The agent sees an AI draft, reviews it, previews it, then creates the link.
assert.match(launchPlan, /launchPlanService\.generateDraft\(property\.id\)/);
assert.match(launchPlan, /setScreen\('review'\)/);
assert.match(launchPlan, /setScreen\('preview'\)/);
assert.match(launchPlan, /Create private Seller Link/);
assert.match(launchPlan, /AI draft, agent decision/);

// The Seller Link starts with one next action; the full plan is deliberately secondary.
assert.match(sellerPortal, /Your next step/);
assert.match(sellerPortal, /See the full plan/);
assert.match(sellerPortal, /important item/);
assert.match(sellerPortal, /I need help/);
assert.match(sellerPortal, /I don’t know/);

// The AI draft is bounded, ownership-protected, evidence-grounded, and never auto-shared.
assert.match(generator, /\.eq\("user_id", user\.id\)/);
assert.match(generator, /value\.slice\(0, 6\)/);
assert.match(generator, /Use ONLY the structured walkthrough evidence below/);
assert.match(generator, /agent will review every suggestion before it is sent/i);

console.log('V84 listing-flow contract checks passed.');
