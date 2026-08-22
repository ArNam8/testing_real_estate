/**
 * hero.ts
 * Hero section: headline, subhead, CTAs, and the floating visual
 * composition (voice orb + branded document card fragments + transcript
 * snippets) that replaces the previous phone mockup.
 */

export const heroStyles = `
.lp-page .hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 140px 24px 80px;
  background:
    radial-gradient(ellipse 60% 45% at 78% 18%, rgba(111, 175, 154, 0.14) 0%, transparent 65%),
    radial-gradient(ellipse 55% 45% at 15% 75%, rgba(30, 58, 95, 0.07) 0%, transparent 65%),
    linear-gradient(160deg, var(--bg) 0%, #F2EFE7 45%, var(--bg) 100%);
}

.lp-page .hero-inner {
  position: relative;
  z-index: 2;
  max-width: 1180px;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: center;
}

.lp-page .hero-copy { max-width: 560px; }

.lp-page .hero h1 {
  font-size: clamp(38px, 5vw, 60px);
  line-height: 1.06;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--navy-dark);
  margin: 20px 0 20px;
}
.lp-page .hero h1 .accent { color: var(--sage-dark); }

.lp-page .hero-sub {
  font-size: clamp(16px, 1.6vw, 19px);
  line-height: 1.6;
  color: var(--muted);
  max-width: 480px;
  margin-bottom: 32px;
}

.lp-page .hero-cta-group {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 28px;
}
.lp-page .hero-cta-note {
  font-size: 13px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.lp-page .hero-trust-strip {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}
.lp-page .hero-trust-strip span { display: flex; align-items: center; gap: 6px; }

/* ── Visual composition ─────────────────────────────────────────────── */
.lp-page .hero-visual {
  position: relative;
  height: clamp(380px, 42vw, 520px);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Exactly one of these two compositions is shown per breakpoint — see the
   max-width: 900px block below, which flips both. */
.lp-page .hero-visual-mobile { display: none; }

.lp-page .hero-orb-wrap {
  position: relative;
  width: clamp(150px, 16vw, 200px);
  height: clamp(150px, 16vw, 200px);
  z-index: 3;
}
.lp-page .hero-orb {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, var(--navy-light) 0%, var(--navy) 45%, var(--navy-dark) 100%);
  box-shadow: 0 20px 60px rgba(15, 39, 64, 0.35), inset 0 -10px 24px rgba(0,0,0,0.2), inset 0 8px 20px rgba(255,255,255,0.12);
  animation: lpOrbBreathe 4.2s ease-in-out infinite;
}
@keyframes lpOrbBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }

.lp-page .hero-orb-ring {
  position: absolute;
  inset: -18px;
  border-radius: 50%;
  border: 1.5px solid rgba(30, 58, 95, 0.22);
  animation: lpRingPulse 2.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}
.lp-page .hero-orb-ring.ring-2 { animation-delay: 0.7s; inset: -18px; }
.lp-page .hero-orb-ring.ring-3 { animation-delay: 1.4s; inset: -18px; }
@keyframes lpRingPulse {
  0% { transform: scale(0.82); opacity: 0.9; }
  100% { transform: scale(1.5); opacity: 0; }
}

.lp-page .hero-orb-mic {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  z-index: 2;
}
.lp-page .hero-orb-waves {
  position: absolute;
  bottom: 22%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 22px;
  z-index: 2;
}
.lp-page .hero-orb-waves .bar {
  width: 3px;
  border-radius: 2px;
  background: rgba(255,255,255,0.75);
  animation: lpHeroWave 1.1s ease-in-out infinite;
}
@keyframes lpHeroWave { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }

/* Floating document fragments */
.lp-page .hero-doc-card {
  position: absolute;
  width: clamp(148px, 15vw, 188px);
  background: var(--surface);
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lifted);
  overflow: hidden;
  animation: lpFloatCard 6s ease-in-out infinite;
}
.lp-page .hero-doc-card .doc-card-head {
  padding: 9px 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: white;
  font-size: 10.5px;
  font-weight: 700;
}
.lp-page .hero-doc-card .doc-card-body { padding: 12px; }
.lp-page .hero-doc-card .doc-line { height: 6px; border-radius: 3px; background: var(--border); margin-bottom: 6px; }
.lp-page .hero-doc-card .doc-line:last-child { margin-bottom: 0; width: 60%; }
.lp-page .hero-doc-card .doc-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 9.5px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--sage-tint);
  color: var(--sage-dark);
}

.lp-page .hero-doc-card.card-a { top: 2%; left: 2%; animation-delay: 0s; }
.lp-page .hero-doc-card.card-b { bottom: 6%; left: -2%; animation-delay: 1.4s; width: clamp(130px, 13vw, 164px); }
.lp-page .hero-doc-card.card-c { top: 8%; right: -2%; animation-delay: 0.7s; }
.lp-page .hero-doc-card.card-d { bottom: 0%; right: 4%; animation-delay: 2.1s; width: clamp(120px, 12vw, 150px); }

@keyframes lpFloatCard {
  0%, 100% { transform: translateY(0) rotate(var(--rot, -4deg)); }
  50% { transform: translateY(-14px) rotate(var(--rot, -4deg)); }
}

/* Floating transcript snippet pills */
.lp-page .hero-snippet {
  position: absolute;
  background: rgba(255,255,255,0.92);
  border: 1px solid var(--border);
  backdrop-filter: blur(6px);
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--navy-dark);
  box-shadow: var(--shadow-soft);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  opacity: 0;
  animation: lpSnippetFade 5.5s ease-in-out infinite;
}
.lp-page .hero-snippet.snip-a { top: 20%; left: 44%; animation-delay: 0.4s; }
.lp-page .hero-snippet.snip-b { bottom: 26%; right: 20%; animation-delay: 2.6s; }
.lp-page .hero-snippet .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sage); flex-shrink: 0; }

@keyframes lpSnippetFade {
  0%, 100% { opacity: 0; transform: translateY(6px) scale(0.96); }
  15%, 55% { opacity: 1; transform: translateY(0) scale(1); }
  70% { opacity: 0; transform: translateY(-6px) scale(0.98); }
}

.lp-page .hero-scroll-hint {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  z-index: 2;
}
.lp-page .hero-scroll-hint .chev { animation: lpChevBounce 1.8s ease-in-out infinite; }
@keyframes lpChevBounce { 0%, 100% { transform: translateY(0); opacity: 0.5; } 50% { transform: translateY(5px); opacity: 1; } }

@media (max-width: 900px) {
  .lp-page .hero { padding: 116px 20px 56px; text-align: center; }
  .lp-page .hero-inner { grid-template-columns: 1fr; gap: 44px; }
  .lp-page .hero-copy { max-width: 100%; margin: 0 auto; }
  .lp-page .hero-sub { margin-left: auto; margin-right: auto; }
  .lp-page .hero-cta-group { justify-content: center; }
  .lp-page .hero-trust-strip { justify-content: center; }

  /* Mobile hero visual: intentional composition, not a shrunk desktop
     version — orb centered with two document cards resting beside it in
     a contained flex row, no absolute overflow-prone positioning. */
  .lp-page .hero-visual { display: none; }
  .lp-page .hero-visual-mobile {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 10px 0 4px;
  }
  .lp-page .hero-visual-mobile .hero-orb-wrap { width: 108px; height: 108px; flex-shrink: 0; }
  .lp-page .hero-visual-mobile .hero-doc-card { position: static; width: 108px; animation: lpFloatCardMobile 5.5s ease-in-out infinite; }
  .lp-page .hero-visual-mobile .hero-doc-card.card-b { display: none; }
  .lp-page .hero-visual-mobile .hero-doc-card.card-d { display: none; }
  .lp-page .hero-visual-mobile .hero-snippet { display: none; }
  @keyframes lpFloatCardMobile { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
}
@media (max-width: 380px) {
  .lp-page .hero h1 { font-size: 32px; }
  .lp-page .btn-primary-lg { width: 100%; justify-content: center; }
  .lp-page .hero-cta-group { width: 100%; }
}
`;
