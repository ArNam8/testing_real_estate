/**
 * StepsExperience.tsx
 * "5 Steps to Polished, Branded Documents" — the centerpiece section.
 *
 * Two interaction models, one per breakpoint (see styles/steps.ts for why):
 *   - Desktop (>1024px): scroll-pinned horizontal scrub track that eases to
 *     rest on the nearest step once scrolling pauses.
 *   - Mobile/tablet (<=1024px): native horizontal swipe/scroll-snap carousel.
 * Both share the same per-step visual markup via renderStepVisual(), so the
 * five step designs are defined once.
 */

import { useEffect, useRef } from 'react';
import { CheckCircle2, Mic } from 'lucide-react';
import {
  WORKFLOW_STEPS, DOCUMENT_TYPES, TRANSCRIPT_SNIPPETS, WALKTHROUGH_ROOMS, SAMPLE_FOLLOW_UP,
} from './constants';
import type { WorkflowStep } from './constants';
import { useScrollReveal } from './hooks';

const STEP_COUNT = WORKFLOW_STEPS.length;

/** Renders the illustrative inner visual for one step. Same markup used in both the desktop panel and the mobile card. */
function renderStepVisual(step: WorkflowStep) {
  switch (step.index) {
    case 1:
      return (
        <div className="step-visual-record">
          <div className="record-orb-mini">
            <Mic size={22} color="white" strokeWidth={2.25} />
            <span className="rec-dot" />
          </div>
          <div className="transcript-flow">
            <div className="transcript-row">
              <div className="transcript-row-inner">
                {[...TRANSCRIPT_SNIPPETS, ...TRANSCRIPT_SNIPPETS].map((s, i) => (
                  <span key={i} className="transcript-pill">{s}</span>
                ))}
              </div>
            </div>
            <div className="transcript-row reverse">
              <div className="transcript-row-inner">
                {[...TRANSCRIPT_SNIPPETS.slice().reverse(), ...TRANSCRIPT_SNIPPETS.slice().reverse()].map((s, i) => (
                  <span key={i} className="transcript-pill">{s}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="room-chip-row">
            {WALKTHROUGH_ROOMS.map((room) => <span key={room} className="room-chip">{room}</span>)}
          </div>
        </div>
      );
    case 2:
      return (
        <div className="step-visual-select">
          {DOCUMENT_TYPES.slice(0, 4).map((doc, i) => {
            const Icon = doc.icon;
            const selected = i === 0 || i === 1;
            return (
              <div key={doc.key} className={`doc-select-card${selected ? ' selected' : ''}`}>
                <div className="sel-icon-row">
                  <div className="sel-icon"><Icon size={15} /></div>
                  <div className="sel-check">{selected && <CheckCircle2 size={20} />}</div>
                </div>
                <div className="sel-label">{doc.label}</div>
              </div>
            );
          })}
        </div>
      );
    case 3:
      return (
        <div className="step-visual-followup">
          <div className="followup-card">
            <span className="fu-badge">Quick check</span>
            <div className="fu-question">{SAMPLE_FOLLOW_UP.question}</div>
            <div className="fu-answer-box">
              <CheckCircle2 size={15} color="#56917E" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{SAMPLE_FOLLOW_UP.answer}</span>
            </div>
          </div>
        </div>
      );
    case 4:
      return (
        <div className="step-visual-photos">
          {WALKTHROUGH_ROOMS.map((room, i) => (
            <div key={room} className={`photo-slot${i < 3 ? ' filled' : ''}`}>
              {i < 3 ? <CheckCircle2 size={18} /> : <span style={{ fontSize: 18 }}>+</span>}
              <span className="slot-label">{room}</span>
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div className="step-visual-payoff">
          <div className="payoff-doc">
            <div className="payoff-head">
              <span className="ph-name">Property Listing Pack</span>
              <span className="ph-badge">DOCX</span>
            </div>
            <div className="payoff-body">
              <div className="payoff-line" />
              <div className="payoff-line" />
              <div className="payoff-line short" />
              <div className="payoff-line accent" />
            </div>
            <div className="payoff-actions">
              <span className="pa-btn solid">Download PDF</span>
              <span className="pa-btn">Download DOCX</span>
            </div>
          </div>
          <span className="payoff-timer">Under 5 minutes, start to finish</span>
        </div>
      );
  }
}

export function StepsExperience() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackWrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const threadFillRef = useRef<HTMLDivElement>(null);
  const mobileTrackRef = useRef<HTMLDivElement>(null);

  useScrollReveal(sectionRef);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const dots = Array.from(section.querySelectorAll<HTMLElement>('.prog-dot'));

    function setActiveDot(activeIndex: number) {
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === activeIndex);
        dot.classList.toggle('passed', i < activeIndex);
      });
    }
    setActiveDot(0);

    // ── DESKTOP: scroll-pinned scrub + snap-on-settle ──────────────────
    let snapTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let ticking = false;

    function getMetrics() {
      const wrapper = trackWrapperRef.current;
      if (!wrapper) return null;
      const rect = wrapper.getBoundingClientRect();
      const wrapperTop = window.scrollY + rect.top;
      const wrapperHeight = wrapper.offsetHeight;
      const viewportHeight = window.innerHeight;
      const range = wrapperHeight - viewportHeight;
      return { wrapperTop, range };
    }

    function applyProgress(progress: number) {
      const track = trackRef.current;
      const threadFill = threadFillRef.current;
      const panelPercent = progress * ((STEP_COUNT - 1) / STEP_COUNT) * 100;
      if (track) track.style.transform = `translateX(-${panelPercent}%)`;
      if (threadFill) threadFill.style.width = `${progress * 100}%`;
      setActiveDot(Math.round(progress * (STEP_COUNT - 1)));
    }

    function handleDesktopScroll() {
      if (window.innerWidth <= 1024) return;
      const metrics = getMetrics();
      if (!metrics || metrics.range <= 0) return;
      const raw = (window.scrollY - metrics.wrapperTop) / metrics.range;
      const progress = Math.min(1, Math.max(0, raw));
      applyProgress(progress);

      if (snapTimer) clearTimeout(snapTimer);
      if (raw > 0.015 && raw < 0.985) {
        snapTimer = setTimeout(() => {
          const m = getMetrics();
          if (!m || m.range <= 0) return;
          const currentRaw = Math.min(1, Math.max(0, (window.scrollY - m.wrapperTop) / m.range));
          const nearestIndex = Math.round(currentRaw * (STEP_COUNT - 1));
          const targetProgress = nearestIndex / (STEP_COUNT - 1);
          const targetY = m.wrapperTop + targetProgress * m.range;
          if (Math.abs(window.scrollY - targetY) > 3) {
            window.scrollTo({ top: targetY, behavior: 'smooth' });
          }
        }, 160);
      }
    }

    function onScrollOrResize() {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(() => {
        handleDesktopScroll();
        ticking = false;
      });
    }

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    onScrollOrResize();

    // ── MOBILE: swipe-scroll progress dots ─────────────────────────────
    let mobileTicking = false;
    function handleMobileScroll() {
      const el = mobileTrackRef.current;
      if (!el || window.innerWidth > 1024) return;
      const card = el.querySelector<HTMLElement>('.step-card-mobile');
      const cardWidth = card ? card.offsetWidth + 16 : el.clientWidth;
      const index = Math.round(el.scrollLeft / cardWidth);
      setActiveDot(Math.min(STEP_COUNT - 1, Math.max(0, index)));
    }
    function onMobileScroll() {
      if (mobileTicking) return;
      mobileTicking = true;
      requestAnimationFrame(() => {
        handleMobileScroll();
        mobileTicking = false;
      });
    }
    const mobileTrack = mobileTrackRef.current;
    mobileTrack?.addEventListener('scroll', onMobileScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      mobileTrack?.removeEventListener('scroll', onMobileScroll);
      if (snapTimer) clearTimeout(snapTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section className="steps-section" id="steps" ref={sectionRef}>
      <div className="steps-head reveal">
        <span className="lp-eyebrow">The Workflow</span>
        <h2>5 Steps to Polished, Branded Documents</h2>
        <p>One recording. Scroll through exactly how it becomes finished paperwork.</p>
        <div className="steps-progress" style={{ marginTop: 28 }}>
          {WORKFLOW_STEPS.map((s) => <span key={s.index} className="prog-dot" />)}
        </div>
      </div>

      {/* Desktop scroll-pinned track */}
      <div className="steps-desktop">
        <div className="steps-track-wrapper" ref={trackWrapperRef}>
          <div className="steps-track-sticky">
            <div className="steps-thread"><div className="steps-thread-fill" ref={threadFillRef} /></div>
            <div className="steps-track" ref={trackRef}>
              {WORKFLOW_STEPS.map((step) => (
                <div className="step-panel" key={step.index}>
                  <div className="step-panel-inner">
                    <div className="step-panel-text">
                      <div className="step-number"><span className="num-badge">{step.index}</span>{step.kicker}</div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                    <div className="step-panel-visual">{renderStepVisual(step)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / tablet swipe carousel */}
      <div className="steps-mobile">
        <div className="steps-mobile-hint">Swipe to move through the workflow →</div>
        <div className="steps-mobile-track" ref={mobileTrackRef}>
          {WORKFLOW_STEPS.map((step) => (
            <div className="step-card-mobile" key={step.index}>
              <div className="step-panel-text">
                <div className="step-number"><span className="num-badge">{step.index}</span>{step.kicker}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
              <div className="step-panel-visual">{renderStepVisual(step)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
