# V86 source-grounding implementation note

## Official Gemini documentation consulted

- [Grounding with Google Search — Gemini API](https://ai.google.dev/gemini-api/docs/generate-content/google-search) — retrieved 25 August 2026.
- [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) — effective 23 March 2026; retrieved 25 August 2026.

## Findings applied to V86

Gemini 2.5 Flash supports the current `google_search` tool. The Generate Content API returns `groundingMetadata`, including the web search queries, source chunks, and supports connecting output text to sources. V86's `review-buyer-sources` endpoint uses this only for an authenticated agent's temporary source review and retains source titles/URLs only in the immediate response.

The Additional Terms say that Grounded Results and Search Suggestions must be displayed with their associated material to the end user who submitted the prompt, and prohibit using them to extract/collect links for another purpose or build an index. For that reason, V86 does not persist a grounded result or send it through to a buyer. Instead, the agent sees a temporary review, opens a source, and manually adds only the original listing cards that they independently approve for the private Buyer Link.

This boundary keeps the intended product experience—AI helps the agent identify current sources; the buyer receives real, agent-approved original listing links—while avoiding non-compliant re-sharing or caching of grounded output.
