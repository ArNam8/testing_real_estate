# Walkthrough V86 — Buyer Workflow

## What V86 adds

V86 keeps the V85 seller/listing flow intact and adds a new buyer path from the familiar main microphone entry:

1. **What are you doing today?** lets an agent choose **Create a listing** or **Find a house for my buyer**.
2. The agent creates a Buyer Search, then either captures a Buyer Brief directly or creates a private **Buyer Preferences Link**.
3. Buyers can record their preferences, receive a plain-language Gemini transcript, edit it, and send it to the agent.
4. The app creates a Notice when preferences arrive. The agent can review temporary, grounded sources and manually curate up to five original listing links.
5. The agent offers available times in the next ten days and creates a polished private **Buyer Link**.
6. Buyers open agent-approved original listing cards, share feedback, and request a tour time. Each feedback item and tour request creates an agent Notice.

## Trust and data boundary

`review-buyer-sources` uses Gemini Google Search grounding only as a temporary, authenticated agent review. Grounded output is not persisted or passed to a buyer. The buyer sees only original listing cards that the agent independently chooses and adds. See `V86_SOURCE_GROUNDING_NOTES.md`.

## Validation completed

- TypeScript: passed.
- ESLint: passed with two existing Fast Refresh warnings in unrelated components.
- Vite production build: passed.
- V86 buyer workflow contract test: passed.
- `buyer-link`, `transcribe-buyer-preferences`, and `review-buyer-sources` Edge Function parse checks: passed.

## Required isolated deployment before live testing

Apply `20260826000000_add_buyer_workflow.sql`, then deploy these new functions to the isolated Supabase test project:

- `buyer-link`
- `transcribe-buyer-preferences`
- `review-buyer-sources`

V86 requires the existing `GEMINI_API_KEY` Edge Function secret. No new custom secret is needed.

After deployment, test a buyer preference recording, transcript edit/submission, agent notice, curated manual listing links, buyer feedback, availability selection, and tour request before promoting the feature.
