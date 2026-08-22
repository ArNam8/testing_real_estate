/**
 * steps.ts
 * The "5 Steps to Polished, Branded Documents" experience.
 *
 * Two entirely different interaction models, each shown only at its own
 * breakpoint (never both at once):
 *   - Desktop (>1024px): a scroll-pinned horizontal scrub track. The section
 *     is tall (560vh); as the visitor scrolls through it, a sticky 100vh
 *     stage holds still while a 5-panel track translates horizontally in
 *     lockstep with scroll position, then eases to rest on the nearest
 *     panel once scrolling pauses (the "snap into focus" feel).
 *   - Mobile/tablet (<=1024px): a native horizontal swipe/scroll-snap
 *     carousel. No scroll-jacking — touch scroll is the browser's own,
 *     which is what actually feels good on a phone.
 * Both render the same per-step visual markup (.step-visual-*), so the
 * content is defined once in StepsExperience.tsx and just laid out
 * differently by CSS per breakpoint.
 */

export const stepsStyles = `
.lp-page .steps-section {
  position: relative;
  background: var(--surface);
  padding: 100px 0 40px;
}

.lp-page .steps-head {
  max-width: 680px;
  margin: 0 auto 56px;
  text-align: center;
  padding: 0 24px;
}

/* ── Progress rail shared visual (dots + labels) ────────────────────── */
.lp-page .steps-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 0 auto 8px;
}
.lp-page .steps-progress .prog-dot {
  width: 34px;
  height: 5px;
  border-radius: 999px;
  background: var(--border);
  transition: background 0.3s ease, transform 0.3s ease;
}
.lp-page .steps-progress .prog-dot.active { background: var(--sage); transform: scaleX(1.15); }
.lp-page .steps-progress .prog-dot.passed { background: var(--navy-light); }

/* ══════════════════════════ DESKTOP TRACK ══════════════════════════ */
.lp-page .steps-desktop { display: block; }
.lp-page .steps-track-wrapper {
  position: relative;
  height: 560vh;
}
.lp-page .steps-track-sticky {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.lp-page .steps-track {
  display: flex;
  width: 500%;
  will-change: transform;
}
.lp-page .step-panel {
  flex: 0 0 20%;
  width: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 min(6vw, 90px);
}
.lp-page .step-panel-inner {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr);
  gap: 56px;
  align-items: center;
  max-width: 1180px;
  width: 100%;
}
.lp-page .step-panel-text .step-number {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sage-dark);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.lp-page .step-panel-text .step-number .num-badge {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--navy-dark);
  color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px;
}
.lp-page .step-panel-text h3 {
  font-size: clamp(24px, 2.6vw, 34px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--navy-dark);
  margin: 0 0 16px;
  line-height: 1.15;
}
.lp-page .step-panel-text p {
  font-size: 16px;
  line-height: 1.65;
  color: var(--muted);
  max-width: 420px;
}
.lp-page .step-panel-visual {
  position: relative;
  height: min(52vh, 420px);
  background: linear-gradient(155deg, #FAFAF7 0%, var(--bg) 100%);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-soft);
}

/* Continuity thread: a colored bar along the top of the sticky stage that
   fills left-to-right as the visitor moves through the five steps. */
.lp-page .steps-thread {
  position: absolute;
  top: 28px;
  left: 50%;
  transform: translateX(-50%);
  width: min(60%, 640px);
  height: 3px;
  background: var(--border);
  border-radius: 999px;
  z-index: 2;
}
.lp-page .steps-thread-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--sage) 0%, var(--navy) 100%);
  width: 0%;
  will-change: width;
}

/* ══════════════════════════ SHARED STEP VISUALS ══════════════════════════ */

/* Step 1 — orb + flowing transcript */
.lp-page .step-visual-record { width: 100%; height: 100%; position: relative; padding: 20px; }
.lp-page .record-orb-mini {
  position: absolute;
  top: 50%; left: 22%;
  transform: translate(-50%, -50%);
  width: 84px; height: 84px;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, var(--navy-light) 0%, var(--navy) 45%, var(--navy-dark) 100%);
  box-shadow: 0 14px 34px rgba(15, 39, 64, 0.3);
  display: flex; align-items: center; justify-content: center;
  animation: lpOrbBreathe 4.2s ease-in-out infinite;
  z-index: 2;
}
.lp-page .record-orb-mini .rec-dot {
  position: absolute;
  top: -6px; right: -2px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #D9563F;
  border: 2px solid var(--surface);
  animation: lpRecPulse 1.4s ease-in-out infinite;
}
@keyframes lpRecPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

.lp-page .transcript-flow {
  position: absolute;
  inset: 0;
  left: 40%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, black 15%, black 85%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0%, black 15%, black 85%, transparent 100%);
}
.lp-page .transcript-row { display: flex; white-space: nowrap; }
.lp-page .transcript-row-inner {
  display: flex;
  gap: 18px;
  animation: lpTranscriptScroll 22s linear infinite;
}
.lp-page .transcript-row.reverse .transcript-row-inner { animation-direction: reverse; animation-duration: 26s; }
@keyframes lpTranscriptScroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.lp-page .transcript-pill {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 7px 15px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--navy-dark);
  box-shadow: var(--shadow-soft);
  flex-shrink: 0;
}

.lp-page .room-chip-row {
  position: absolute;
  bottom: 14%;
  left: 10%;
  right: 6%;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  z-index: 2;
}
.lp-page .room-chip {
  font-size: 11px;
  font-weight: 700;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--sage-tint);
  color: var(--sage-dark);
}

/* Step 2 — document selection cards */
.lp-page .step-visual-select {
  width: 100%; height: 100%;
  padding: 26px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-content: center;
}
.lp-page .doc-select-card {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}
.lp-page .doc-select-card .sel-icon-row { display: flex; align-items: center; justify-content: space-between; }
.lp-page .doc-select-card .sel-icon {
  width: 30px; height: 30px;
  border-radius: 9px;
  background: var(--bg);
  display: flex; align-items: center; justify-content: center;
  color: var(--navy);
  flex-shrink: 0;
}
.lp-page .doc-select-card .sel-label { font-size: 12.5px; font-weight: 700; color: var(--navy-dark); line-height: 1.3; }
.lp-page .doc-select-card.selected {
  background: var(--navy-dark);
  border-color: var(--navy-dark);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lifted);
}
.lp-page .doc-select-card.selected .sel-icon { background: rgba(255,255,255,0.14); color: white; }
.lp-page .doc-select-card.selected .sel-label { color: white; }
.lp-page .doc-select-card .sel-check {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  flex-shrink: 0;
}
.lp-page .doc-select-card.selected .sel-check {
  background: var(--sage);
  border-color: var(--sage);
  display: flex; align-items: center; justify-content: center;
  color: white;
}

/* Step 3 — follow-up question card */
.lp-page .step-visual-followup { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 24px; }
.lp-page .followup-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  width: 100%;
  max-width: 320px;
  box-shadow: var(--shadow-lifted);
}
.lp-page .followup-card .fu-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sage-dark);
  background: var(--sage-tint);
  padding: 5px 10px;
  border-radius: 999px;
  margin-bottom: 12px;
}
.lp-page .followup-card .fu-question {
  font-size: 14px;
  font-weight: 600;
  color: var(--navy-dark);
  line-height: 1.5;
  margin-bottom: 14px;
}
.lp-page .followup-card .fu-answer-box {
  border: 1.5px solid var(--sage);
  background: var(--sage-tint);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--navy-dark);
  font-weight: 500;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

/* Step 4 — photo slots */
.lp-page .step-visual-photos {
  width: 100%; height: 100%;
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  align-content: center;
}
.lp-page .photo-slot {
  aspect-ratio: 1;
  border-radius: 12px;
  border: 1.5px dashed var(--border);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--muted);
  padding: 6px;
  text-align: center;
}
.lp-page .photo-slot .slot-label { font-size: 10px; font-weight: 700; color: var(--navy-dark); }
.lp-page .photo-slot.filled {
  border-style: solid;
  border-color: var(--sage);
  background: linear-gradient(155deg, #E9F3EE 0%, var(--sage-tint) 100%);
  color: var(--sage-dark);
}

/* Step 5 — payoff transformation */
.lp-page .step-visual-payoff {
  width: 100%; height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
}
.lp-page .payoff-doc {
  width: 100%;
  max-width: 300px;
  background: var(--surface);
  border-radius: 16px;
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: var(--shadow-lifted);
  animation: lpPayoffRise 2.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}
@keyframes lpPayoffRise { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.lp-page .payoff-doc .payoff-head {
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.lp-page .payoff-doc .payoff-head .ph-name { color: white; font-size: 12.5px; font-weight: 700; }
.lp-page .payoff-doc .payoff-head .ph-badge {
  margin-left: auto;
  font-size: 9px;
  font-weight: 700;
  color: white;
  background: rgba(255,255,255,0.16);
  padding: 3px 8px;
  border-radius: 999px;
}
.lp-page .payoff-doc .payoff-body { padding: 16px; }
.lp-page .payoff-doc .payoff-line { height: 7px; border-radius: 3px; background: var(--border); margin-bottom: 8px; }
.lp-page .payoff-doc .payoff-line.short { width: 55%; }
.lp-page .payoff-doc .payoff-line.accent { background: var(--sage); width: 30%; height: 5px; margin-top: 12px; }
.lp-page .payoff-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px;
}
.lp-page .payoff-actions .pa-btn {
  flex: 1;
  text-align: center;
  font-size: 10.5px;
  font-weight: 700;
  padding: 8px 6px;
  border-radius: 8px;
  border: 1.5px solid var(--border);
  color: var(--navy-dark);
}
.lp-page .payoff-actions .pa-btn.solid { background: var(--navy-dark); color: white; border-color: var(--navy-dark); }
.lp-page .payoff-timer {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  color: var(--sage-dark);
  background: var(--sage-tint);
  padding: 5px 12px;
  border-radius: 999px;
}

@media (max-width: 1024px) {
  .lp-page .steps-desktop { display: none; }
}

/* ══════════════════════════ MOBILE / TABLET CAROUSEL ══════════════════════════ */
.lp-page .steps-mobile { display: none; }
@media (max-width: 1024px) {
  .lp-page .steps-mobile { display: block; padding: 0 0 8px; }

  .lp-page .steps-mobile-track {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    gap: 16px;
    padding: 6px 8vw 28px;
    scrollbar-width: none;
  }
  .lp-page .steps-mobile-track::-webkit-scrollbar { display: none; }

  .lp-page .step-card-mobile {
    scroll-snap-align: center;
    flex: 0 0 84%;
    max-width: 420px;
    background: linear-gradient(155deg, #FAFAF7 0%, var(--bg) 100%);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 22px 20px 24px;
    box-shadow: var(--shadow-soft);
  }
  .lp-page .step-card-mobile .step-panel-visual {
    height: 240px;
    margin-top: 16px;
    border-radius: 16px;
  }
  .lp-page .step-card-mobile .step-panel-text p { max-width: none; font-size: 14.5px; }
  .lp-page .step-card-mobile .step-panel-text h3 { font-size: 21px; }

  .lp-page .steps-mobile-hint {
    text-align: center;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-bottom: 4px;
  }
}
@media (max-width: 520px) {
  .lp-page .step-card-mobile { flex-basis: 90%; padding: 18px 16px 20px; }
  .lp-page .step-visual-select { grid-template-columns: 1fr 1fr; gap: 8px; }
  .lp-page .step-visual-photos { grid-template-columns: repeat(3, 1fr); gap: 8px; }
}
`;
