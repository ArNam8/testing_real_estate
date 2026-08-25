# Walkthrough V87 — Agent Buyer Brief Microphone

## What V87 adds

V87 is built from V86 and retains all V85 seller work and V86 buyer work unchanged. It completes the missing in-person buyer path.

When an agent chooses **Find a house for my buyer**, creates a Buyer Search, and the buyer is beside them, the agent now sees a clear **Record with buyer now** card:

1. Start recording.
2. Let the buyer speak naturally about the home they want.
3. Finish recording.
4. Gemini creates a draft Buyer Brief.
5. The agent reviews and edits the transcript before pressing **Save Buyer Brief**.
6. The flow continues into temporary source review, agent-controlled shortlist curation, available tour times, and a private Buyer Link.

The private Buyer Preferences Link remains the alternative when the buyer is not with the agent.

## Safeguards

`transcribe-agent-buyer-brief` requires an authenticated agent and confirms that the agent owns the Buyer Search before sending audio to Gemini. It returns a draft only; no buyer preference data is saved until the agent explicitly reviews and saves it.

## Validation completed

- TypeScript: passed.
- ESLint: passed with two existing Fast Refresh warnings in unrelated components.
- Vite production build: passed.
- Agent Buyer Brief microphone contract test: passed.
- `transcribe-agent-buyer-brief` Edge Function parse check: passed.

## Isolated deployment requirement

Deploy the new `transcribe-agent-buyer-brief` Edge Function together with the V86 buyer migration/functions to the isolated test project before live testing. It uses the existing `GEMINI_API_KEY` secret and requires no new secret.
