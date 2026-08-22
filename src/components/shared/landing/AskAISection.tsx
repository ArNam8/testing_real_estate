/**
 * AskAISection.tsx
 * "Still aren't sure? Ask your AI." Opens Claude, ChatGPT, or Gemini with
 * a prompt asking THAT assistant to read this page and give an honest,
 * critical opinion — not to blindly praise the product.
 *
 * ChatGPT and Claude generally honor a `?q=` URL parameter to prefill the
 * prompt; Gemini does not reliably support this, so a "copy prompt"
 * fallback is always offered too, with real error handling if the
 * clipboard write fails (no silent failure).
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Sparkles, MessageCircle, Wand2, Copy, Check, AlertCircle } from 'lucide-react';
import { AI_PROVIDERS, buildAskAiPrompt } from './constants';
import type { AiProvider } from './constants';

const PROVIDER_VISUALS: Record<AiProvider['id'], { icon: typeof Sparkles; glow: string }> = {
  claude: { icon: Sparkles, glow: '#C16B4F' },
  chatgpt: { icon: MessageCircle, glow: '#5B8C7B' },
  gemini: { icon: Wand2, glow: '#46647F' },
};

export function AskAISection() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  function openProvider(provider: AiProvider) {
    const prompt = buildAskAiPrompt(window.location.href);
    const url = provider.buildUrl(encodeURIComponent(prompt));
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyPrompt() {
    const prompt = buildAskAiPrompt(window.location.href);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2200);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2800);
    }
  }

  return (
    <section className="ask-ai-section">
      <span className="lp-eyebrow">Not just our word for it</span>
      <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, color: 'var(--navy-dark)', margin: '18px 0 10px', letterSpacing: '-0.02em' }}>
        Still aren't sure? Ask your AI.
      </h2>
      <p style={{ color: 'var(--muted)', maxWidth: 460, margin: '0 auto', fontSize: 15.5, lineHeight: 1.6 }}>
        Send this page to Claude, ChatGPT, or Gemini and ask them to look it over honestly —
        strengths, gaps, and who it's actually a fit for.
      </p>

      <div className="ask-ai-providers">
        {AI_PROVIDERS.map((provider) => {
          const visual = PROVIDER_VISUALS[provider.id];
          const Icon = visual.icon;
          return (
            <button
              key={provider.id}
              type="button"
              className="ask-ai-btn"
              onClick={() => openProvider(provider)}
              aria-label={`Ask ${provider.name} about Walkthrough AI`}
            >
              <span className="ask-ai-glyph" style={{ '--glow-color': visual.glow } as CSSProperties}>
                <Icon size={24} color={visual.glow} strokeWidth={2} />
              </span>
              <span className="ask-ai-name">{provider.name}</span>
            </button>
          );
        })}
      </div>

      <div className="ask-ai-fallback">
        {copyState === 'error' ? (
          <><AlertCircle size={14} /> Couldn't copy — your browser may be blocking clipboard access.</>
        ) : copyState === 'copied' ? (
          <><Check size={14} /> Prompt copied — paste it into any AI chat.</>
        ) : (
          <>Prefill doesn't work everywhere — <button type="button" onClick={copyPrompt}><Copy size={11} style={{ verticalAlign: -1, marginRight: 3 }} />copy the prompt instead</button></>
        )}
      </div>
    </section>
  );
}
