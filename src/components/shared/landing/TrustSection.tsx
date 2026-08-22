/**
 * TrustSection.tsx
 * Honest trust-building section. Deliberately contains no testimonials,
 * customer names, or usage statistics — there are zero paying customers
 * and no usage data yet, so trust is built on describing the actual
 * guardrails in the product instead.
 */

import { useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import { TRUST_POINTS } from './constants';
import { useScrollReveal } from './hooks';

export function TrustSection() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  return (
    <section className="trust-section" id="trust" ref={sectionRef}>
      <div className="lp-section-head reveal">
        <span className="lp-eyebrow"><ShieldCheck size={12} /> Why trust it</span>
        <h2>Built to be careful with your listings</h2>
        <p>No shortcuts on accuracy — here's what actually keeps the documents reliable.</p>
      </div>
      <div className="trust-grid">
        {TRUST_POINTS.map((point, i) => {
          const Icon = point.icon;
          return (
            <div key={point.title} className={`trust-card reveal reveal-delay-${Math.min(i + 1, 3)}`}>
              <div className="trust-icon"><Icon size={20} /></div>
              <div>
                <h3>{point.title}</h3>
                <p>{point.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
