# Walkthrough_V87_testing

## Purpose

**Walkthrough_V87_testing** is an isolated, microphone-free testing variant of the real microphone-enabled V87 release. It exists so seller and buyer workflows can be exercised repeatedly on a separate Supabase and Netlify environment without requesting microphone permission or spending Gemini credits on speech transcription.

This package is intentionally named **Walkthrough_V87_testing**. It is not V88 and it does not modify or replace V81, V82, V83, V85, V86, or the real V87 release.

## What changed for testing

| Workflow area | Testing behavior | Real V87 behavior retained elsewhere |
|---|---|---|
| Listing walkthrough | The agent pastes a property walkthrough into **Text test input**. The existing Gemini Pass 1 extraction then creates facts, follow-up questions, photos/documents, and Home Launch Plan work as normal. | Agent records an on-site walkthrough. |
| Agent Buyer Brief | The agent pastes the buyer conversation, reviews it, and explicitly saves the Buyer Brief. | Agent can record with the buyer present. |
| Private buyer Preferences Link | The buyer pastes and edits preferences, optionally loading sample text, before submitting to the agent. | Buyer can record and review a transcript. |
| Seller Link | Unchanged: task checklist, dates, proof uploads, help/unknown choices, messages, mandatory-task block, and agent review workflow. | Same. |
| Buyer shortlist and tours | Unchanged: agent-curated original listing links, feedback, agent questions/notices, tour-time choices, and tour requests. | Same. |

## Data handling and compliance boundary

Property walkthrough text is sent to the existing `generate` Edge Function as `walkthroughText`. Pass 1 uses the existing Gemini text-generation route with a dedicated strict extraction prompt. The prompt preserves source labels such as `seller_stated`, `agent_stated`, `observed`, `unverified`, and `unknown`, as well as uncertainty and missing values.

Buyer Brief and buyer-preference test text are deliberately saved or submitted as editable text. They do not call the microphone transcription functions. Agent source review remains internal only; buyers still receive only agent-curated original listing links.

The microphone transcription Edge Function source files remain in this archive for compatibility with the inherited V87 codebase, but no testing UI path imports or calls them.

## Local validation completed

| Check | Result |
|---|---|
| TypeScript | Passed: `npm run typecheck` |
| Lint | Passed with two inherited Fast Refresh warnings and no errors: `npm run lint` |
| Production build | Passed: `npm run build` |
| Text-only source contract | Passed: `node tests/v87-testing-contract.mjs` |
| Updated `generate` Edge Function syntax/bundle check | Passed with `esbuild` |
| Live Gemini calls | Not run; no Gemini credits were spent during packaging. |
| Live Supabase/Netlify end-to-end testing | Not run; this package has not been deployed. |

## Deployment boundary

Deploy this package only to the separate testing Supabase and Netlify environment. It needs the inherited V85/V86/V87 migrations and required seller/buyer/generation Edge Functions, including the updated `generate` function in this package. `GEMINI_API_KEY` remains the only required custom Edge Function secret.

Do **not** deploy it over the existing production or earlier testing environments. This release is a local, static-validated source package only until the isolated environment is explicitly configured and deployed.
