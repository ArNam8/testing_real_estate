/**
 * DocumentsSection.tsx
 * "Documents We Offer" — all six real document types as visual preview
 * cards. Fanned/overlapping on desktop (each card keeps its fanned
 * rotation on hover, just lifts), a clean grid on mobile/tablet where a
 * fanned overlap wouldn't work with touch.
 */

import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { DOCUMENT_TYPES } from './constants';
import { useScrollReveal } from './hooks';

const CENTER = (DOCUMENT_TYPES.length - 1) / 2;

function fanTransform(i: number, lifted: boolean) {
  const offset = i - CENTER;
  const rotate = offset * 7;
  const translateX = offset * 76;
  const translateY = Math.abs(offset) * 14 + (lifted ? -14 : 0);
  return `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg)`;
}

export function DocumentsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  return (
    <section className="documents-section" id="documents" ref={sectionRef}>
      <div className="lp-section-head reveal">
        <span className="lp-eyebrow">Documents We Offer</span>
        <h2>Six documents, one recording</h2>
        <p>Every document below is generated from the same walkthrough — pick the ones you need for each listing.</p>
      </div>

      {/* Desktop fanned stack */}
      <div className="documents-fan reveal reveal-delay-1">
        {DOCUMENT_TYPES.map((doc, i) => {
          const Icon = doc.icon;
          const style: CSSProperties = {
            transform: fanTransform(i, false),
            zIndex: i,
            '--fan-hover-transform': fanTransform(i, true),
          } as CSSProperties;
          return (
            <div key={doc.key} className="doc-fan-card" style={style}>
              <div className="fan-icon"><Icon size={17} /></div>
              <div className="fan-label">{doc.label}</div>
              <div className="fan-desc">{doc.description}</div>
            </div>
          );
        })}
      </div>

      {/* Mobile / tablet grid (shown via CSS at <=900px) */}
      <div className="documents-grid reveal reveal-delay-1">
        {DOCUMENT_TYPES.map((doc) => {
          const Icon = doc.icon;
          return (
            <div key={doc.key} className="doc-fan-card">
              <div className="fan-icon"><Icon size={17} /></div>
              <div className="fan-label">{doc.label}</div>
              <div className="fan-desc">{doc.description}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
