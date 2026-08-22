/**
 * BrandingSection.tsx
 * Shows the difference between raw extracted information and a finished,
 * branded document — using the app's real doc-viewer visual language
 * (colored heading, status chips) rather than generic "before/after" art.
 */

import { useRef } from 'react';
import { FileWarning, Sparkles } from 'lucide-react';
import { BRAND_PALETTE } from '../../../utils/brandPalette';
import { useScrollReveal } from './hooks';

const SWATCH_KEYS = ['navy', 'sage', 'terracotta', 'forest', 'amber-gold', 'plum', 'ink', 'rust'];

export function BrandingSection() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  const swatches = BRAND_PALETTE.filter((c) => SWATCH_KEYS.includes(c.key));

  return (
    <section className="branding-section" ref={sectionRef}>
      <div className="lp-section-head reveal">
        <span className="lp-eyebrow"><Sparkles size={12} /> Branding</span>
        <h2>Documents that look like they came from you</h2>
        <p>
          Walkthrough AI doesn't hand you raw AI output. Every document is formatted, structured, and
          finished in your brand colors before you ever see it.
        </p>
      </div>

      <div className="branding-compare reveal reveal-delay-1">
        <div className="compare-card plain">
          <div className="compare-label"><FileWarning size={13} style={{ marginRight: 6, verticalAlign: -2 }} />Raw extraction</div>
          <div className="compare-body">
            <div className="plain-line" style={{ width: '90%' }} />
            <div className="plain-line" style={{ width: '95%' }} />
            <div className="plain-line" />
            <div className="plain-line" style={{ width: '80%' }} />
            <div className="plain-line" />
          </div>
        </div>
        <div className="compare-card branded">
          <div className="compare-label">Finished, branded document</div>
          <div className="compare-body">
            <div className="branded-heading">Property Listing Pack</div>
            <div className="branded-sub">142 Maple Street</div>
            <div className="branded-line" style={{ width: '92%' }} />
            <div className="branded-line" />
            <div className="branded-line" style={{ width: '96%' }} />
            <div className="branded-chip-row">
              <span className="branded-chip good">Move-in ready</span>
              <span className="branded-chip warn">Needs attention: 1</span>
            </div>
          </div>
        </div>
      </div>

      <div className="brand-palette-strip reveal reveal-delay-2">
        {swatches.map((c) => (
          <span key={c.key} className="palette-dot" style={{ background: `#${c.hex}` }} title={c.name} />
        ))}
        <span className="palette-note">30 brand colors, applied automatically at generation</span>
      </div>
    </section>
  );
}
