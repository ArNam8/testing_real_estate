import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const has = (source, value) => source.includes(value);

const app = read('src/App.tsx');
const propertyTextStage = read('src/components/workflow/TextWalkthroughStage.tsx');
const workspace = read('src/components/buyer/BuyerWorkspace.tsx');
const portal = read('src/components/buyer/BuyerPortal.tsx');
const sellerPortal = read('src/components/launch/SellerPortal.tsx');
const service = read('src/services/supabase.ts');
const generator = read('supabase/functions/generate/index.ts');
const extraction = read('supabase/functions/_shared/extraction.ts');

assert(has(app, "TextWalkthroughStage"), 'App must render the pasted listing walkthrough stage.');
assert(!has(app, "<WalkthroughStage"), 'App must not render the microphone listing stage.');
assert(has(app, "startPipeline(propertyId, '', selectedOutputs, walkthroughText)"), 'Pasted listing text must enter the existing pipeline.');
assert(has(propertyTextStage, 'Text test input'), 'Listing test stage must identify itself as text input.');
assert(has(service, 'walkthroughText'), 'Client service must submit optional pasted walkthrough text.');
assert(has(generator, 'buildTextExtractionPrompt'), 'Generator must route pasted walkthrough text through Pass 1 extraction.');
assert(has(generator, 'walkthroughText?.trim()'), 'Generator must accept text without an audio path.');
assert(has(extraction, 'Pasted walkthrough text:'), 'Shared text extraction prompt must preserve the pasted source.');

for (const [name, source] of [['Buyer Workspace', workspace], ['Buyer Portal', portal]]) {
  assert(!has(source, 'getUserMedia'), `${name} must not request microphone access.`);
  assert(!has(source, 'MediaRecorder'), `${name} must not create a media recorder.`);
  assert(!has(source, 'buyerPreferenceTranscribe'), `${name} must not call buyer audio transcription.`);
  assert(!has(source, 'agentBuyerBriefTranscribe'), `${name} must not call agent audio transcription.`);
}

assert(has(workspace, 'Save Buyer Brief'), 'Agent-side text Buyer Brief review/save remains present.');
assert(has(workspace, 'createLink(agentId, active.id, \'preferences\')'), 'Private buyer preferences links remain present.');
assert(has(workspace, 'reviewSources'), 'Agent-only source review remains present.');
assert(has(workspace, 'Create testing Buyer Link'), 'Buyer shortlist link creation remains present.');
assert(has(portal, "action: 'submit_preferences'"), 'Buyer text preferences must submit through the existing link action.');
assert(has(portal, "action: 'feedback'"), 'Buyer shortlist feedback remains present.');
assert(has(portal, "action: 'request_tour'"), 'Buyer tour requests remain present.');
assert(has(sellerPortal, "action: 'submit'"), 'Seller Link update workflow remains present.');

console.log('V87_testing contract passed: text-only captures wired; seller and buyer link workflows retained.');
