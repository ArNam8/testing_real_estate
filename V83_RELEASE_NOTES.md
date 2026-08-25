# Walkthrough V83 — Trust and Offer Summary Reliability

## Scope

V83 is built from V82. It changes only the document-generation backend paths needed for two live-test findings. The visual design, voice recording flow, frontend workflow stages, Supabase schema, and Gemini model choice are unchanged.

## 1. Listing Pack attribution protection

Seller- and agent-attributed claims now reach document generation as **source-qualified values**, not as bare facts. For example, a value that came from the seller is supplied to the drafting step as `Seller stated: …`, along with a binding presentation requirement. The generation prompt now explicitly prohibits changing seller- or agent-attributed claims into observed or confirmed statements in a headline, description, bullet, highlight, fact sheet, or room detail.

This is designed to stop the prior failure where a statement such as “the seller said the roof was replaced” appeared as an observed roof replacement in the Listing Pack.

## 2. Offer Summary storage reliability

An Offer Summary is now safe to generate even when no offer price, deposit, or closing date was discussed. The DOCX builder no longer creates an empty term-table in that case; it produces the working summary and disclaimer without that empty visual strip.

V83 also builds and uploads documents one at a time, rather than making every DOCX pack and Storage write concurrently. Each DOCX upload retries once after a short pause if Storage returns a transient error. If a document still cannot be stored, the manifest now records a specific reason instead of a generic unavailable message.

## Validation completed

| Check | Result |
|---|---|
| Listing Pack provenance prompt check | Passed: seller-attributed data remains source-qualified in the Pass 2 input. |
| Upload retry check | Passed: a one-time Storage failure recovers on the second attempt; a persistent failure is reported clearly. |
| Empty Offer Summary DOCX build | Passed: a no-terms Offer Summary built into a non-empty DOCX package. |
| Edge Function syntax bundles | Passed for `generate`, `generation`, `documentPersistence`, and `docBuilder`. |
| Frontend TypeScript and production build | Passed; existing non-blocking Fast Refresh warnings remain unchanged. |

## Deployment boundary

V83 source is packaged but not deployed. To verify live, deploy the updated `generate` Edge Function to the isolated testing Supabase project first. Do not deploy it to the V81 production project until the isolated test has passed.
