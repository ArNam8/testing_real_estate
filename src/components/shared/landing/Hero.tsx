/**
 * Hero.tsx
 * The hero section. No phone mockup — instead a floating composition of
 * a voice orb, branded document card fragments, and transcript snippets
 * that visually explains "your voice becomes finished documents" before
 * the visitor reads a word.
 *
 * Renders two visual compositions: a richer absolutely-positioned one for
 * desktop/tablet, and a simpler contained flex row for mobile (per the
 * brief: "design the mobile composition intentionally," not a shrunk copy).
 */

import type { CSSProperties } from 'react';
import { Mic, ArrowRight, CheckCircle2 } from 'lucide-react';

interface HeroProps {
  onSignUp: () => void;
}

/** A small floating branded-document card fragment used throughout the hero. */
function FloatingDocCard({
  className,
  rotate,
  color,
  title,
  chip,
}: {
  className: string;
  rotate: number;
  color: string;
  title: string;
  chip?: string;
}) {
  return (
    <div className={`hero-doc-card ${className}`} style={{ '--rot': `${rotate}deg` } as CSSProperties}>
      <div className="doc-card-head" style={{ background: color }}>{title}</div>
      <div className="doc-card-body">
        <div className="doc-line" />
        <div className="doc-line" />
        <div className="doc-line" />
        {chip && (
          <span className="doc-chip"><CheckCircle2 size={11} />{chip}</span>
        )}
      </div>
    </div>
  );
}

function VoiceOrb() {
  return (
    <div className="hero-orb-wrap">
      <div className="hero-orb-ring ring-1" />
      <div className="hero-orb-ring ring-2" />
      <div className="hero-orb-ring ring-3" />
      <div className="hero-orb" />
      <div className="hero-orb-mic"><Mic size={30} strokeWidth={2.25} /></div>
      <div className="hero-orb-waves" aria-hidden="true">
        {[10, 16, 22, 14, 18, 11].map((h, i) => (
          <span key={i} className="bar" style={{ height: h, animationDelay: `${i * 0.11}s` }} />
        ))}
      </div>
    </div>
  );
}

export function Hero({ onSignUp }: HeroProps) {
  return (
    <section className="hero" id="top">
      <div className="hero-inner">
        <div className="hero-copy">
          <span className="lp-eyebrow reveal">Real estate walkthroughs, done talking</span>
          <h1 id="hero-h1" className="reveal reveal-delay-1">
            Finish your listing paperwork <span className="accent">before you leave the driveway</span>
          </h1>
          <p className="hero-sub reveal reveal-delay-2">
            Record a spoken walkthrough of the property. Walkthrough AI turns it into up to six
            polished, branded documents — listing pack, client summary, inspection notes and more —
            without you typing a word.
          </p>
          <div className="hero-cta-group reveal reveal-delay-2">
            <button type="button" className="btn-primary btn-primary-lg" onClick={onSignUp}>
              Try Walkthrough AI <ArrowRight size={17} />
            </button>
            <span className="hero-cta-note">No paperwork left for later</span>
          </div>
          <div className="hero-trust-strip reveal reveal-delay-3">
            <span><CheckCircle2 size={14} /> Talk, don't type</span>
            <span><CheckCircle2 size={14} /> 6 documents, one recording</span>
            <span><CheckCircle2 size={14} /> Branded to your business</span>
          </div>
        </div>

        {/* Desktop / tablet composition */}
        <div className="hero-visual" aria-hidden="true">
          <VoiceOrb />
          <FloatingDocCard className="card-a" rotate={-6} color="#1E3A5F" title="Listing Pack" chip="Ready" />
          <FloatingDocCard className="card-c" rotate={5} color="#6FAF9A" title="Client Summary" />
          <FloatingDocCard className="card-b" rotate={-4} color="#4C6E93" title="Inspection Notes" />
          <FloatingDocCard className="card-d" rotate={7} color="#0F2740" title="Timeline" />
          <span className="hero-snippet snip-a"><span className="dot" />Kitchen — quartz counters</span>
          <span className="hero-snippet snip-b"><span className="dot" />New carpet, primary bedroom</span>
        </div>
      </div>

      {/* Mobile composition: contained, no absolute overflow */}
      <div className="hero-visual-mobile" aria-hidden="true">
        <FloatingDocCard className="card-a" rotate={-5} color="#1E3A5F" title="Listing Pack" />
        <VoiceOrb />
        <FloatingDocCard className="card-c" rotate={5} color="#6FAF9A" title="Client Summary" />
      </div>

      <div className="hero-scroll-hint">
        <span>See how it works</span>
        <ArrowRight size={14} className="chev" style={{ transform: 'rotate(90deg)' }} />
      </div>
    </section>
  );
}
