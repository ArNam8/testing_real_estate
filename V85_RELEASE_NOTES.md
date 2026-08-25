# Walkthrough AI V85 — Listing Home Launch Checklist

## Scope delivered

V85 is an **isolated, listing-only** extension of V83. It leaves the existing five-step recording, extraction, follow-up, photo, fact-review, and document-generation workflow in place. Documents remain a complete stopping point: the agent can download them and leave. Beneath the completed document list is one optional continuation: **“Now get the house ready.”**

Selecting that continuation triggers `generate-launch-plan`, which uses the already extracted property data to propose a concise, evidence-grounded Home Launch draft. It can suggest only 3–6 seller-facing tasks across **fix before launch**, **prepare the home**, **prove and confirm**, and **access/showings**. It may ask the seller to confirm missing facts but must not invent defects, warranties, documents, or property facts.

The agent reviews this short AI draft one card at a time. They can keep, edit, remove, add, mark required, request proof, and set a suggested date. Advanced plan settings stay collapsed. This preserves the useful AI magic without turning the experience into a task-management dashboard.

The agent can preview the seller portal before creating the link. The Seller Link is created only after the agent has prepared the final plan and selected a seller contact; it is then shown as a copyable private URL. Walkthrough does not send the link automatically.

The seller portal is a responsive private Home Launch Checklist with purposeful motion and a **single next task by default**. The full plan is available only when the seller asks to see it. Each task supports an expected completion date, proof/photo upload, notes, “I need help,” “I don’t know,” direct message, and a final submit action. Mandatory tasks block final submission until they have been marked ready. Seller updates create agent notices and remain subject to agent review.

## Security and trust boundaries

The database migration makes all plan, task, link, submission, and notice records agent-owned under row-level security. The raw link token is not stored: the database retains only its SHA-256 hash. The client-facing seller page uses the `seller-link` edge function, which validates the token and returns only a limited public checklist payload.

Seller evidence uploads receive a short-lived, single-path upload URL only after token validation. Seller submissions create notices for the owning agent. Seller statements and uploads are not automatically treated as verified facts, and documents are not automatically published or regenerated.

## Required isolated deployment steps

1. Apply `supabase/migrations/20260825000000_add_seller_launch_checklist.sql` to the **chosen isolated V84 Supabase project**.
2. Deploy `supabase/functions/generate-launch-plan/index.ts` as the `generate-launch-plan` Edge Function. It uses the existing custom `GEMINI_API_KEY` secret; do not add or request a new secret.
3. Deploy `supabase/functions/seller-link/index.ts` as the `seller-link` Edge Function.
4. Deploy the V85 frontend with the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for that isolated V85 project.
5. Test one complete agent-to-seller journey before any wider use.

## Validation completed locally

| Check | Result |
|---|---|
| TypeScript application type check | Passed |
| ESLint | Passed with two pre-existing Fast Refresh warnings in unrelated V83 files |
| Vite production build | Passed |
| Seller Link edge-function parse check | Passed with esbuild; Deno was not installed in this sandbox |
| AI Home Launch edge-function parse check | Passed with esbuild; Deno was not installed in this sandbox |
| Listing flow contract test | Passed: five-step endpoint, optional post-document action, AI draft, agent review, guided Seller Link, and safeguards |

## Still required after deployment

Run one targeted live test in the isolated environment: create a listing, open Home Launch Plan, add a mandatory proof task, preview the seller portal, create/copy the link, open it in a fresh browser session, attempt final submission while incomplete, upload proof, set an expected date, submit, and confirm that the agent receives the notice and can review the result. Do not deploy this V85 build over V81, V82, or V83 production sources.
