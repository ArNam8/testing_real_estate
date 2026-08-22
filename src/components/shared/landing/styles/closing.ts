/**
 * closing.ts
 * Trust section, "Ask your AI" section, and the cinematic footer.
 */

export const closingStyles = `
/* ── Trust section ──────────────────────────────────────────────────── */
.lp-page .trust-section {
  padding: 96px 24px;
  background: linear-gradient(180deg, #EFEBE0 0%, var(--bg) 100%);
}
.lp-page .trust-grid {
  max-width: 920px;
  margin: 52px auto 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.lp-page .trust-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 26px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
  box-shadow: var(--shadow-soft);
}
.lp-page .trust-card .trust-icon {
  width: 42px; height: 42px;
  border-radius: 12px;
  background: var(--sage-tint);
  color: var(--sage-dark);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.lp-page .trust-card h3 { font-size: 15.5px; font-weight: 700; color: var(--navy-dark); margin: 0 0 6px; }
.lp-page .trust-card p { font-size: 13.5px; line-height: 1.55; color: var(--muted); margin: 0; }

@media (max-width: 720px) {
  .lp-page .trust-grid { grid-template-columns: 1fr; }
}

/* ── Ask AI section ──────────────────────────────────────────────────── */
.lp-page .ask-ai-section {
  padding: 100px 24px;
  background: var(--surface);
  text-align: center;
}
.lp-page .ask-ai-providers {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  margin: 44px 0 22px;
  flex-wrap: wrap;
}
.lp-page .ask-ai-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
}
.lp-page .ask-ai-glyph {
  width: 62px; height: 62px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1.5px solid var(--border);
  box-shadow: var(--shadow-soft);
  position: relative;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.lp-page .ask-ai-glyph::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 1.5px solid var(--glow-color, var(--sage));
  opacity: 0.5;
  animation: lpAskPulse 2.6s ease-in-out infinite;
}
.lp-page .ask-ai-btn:nth-child(2) .ask-ai-glyph::before { animation-delay: 0.5s; }
.lp-page .ask-ai-btn:nth-child(3) .ask-ai-glyph::before { animation-delay: 1s; }
@keyframes lpAskPulse {
  0% { transform: scale(0.94); opacity: 0.55; }
  70%, 100% { transform: scale(1.22); opacity: 0; }
}
.lp-page .ask-ai-btn:hover .ask-ai-glyph { transform: translateY(-4px); box-shadow: var(--shadow-lifted); }
.lp-page .ask-ai-name { font-size: 12.5px; font-weight: 600; color: var(--muted); }

.lp-page .ask-ai-fallback {
  max-width: 480px;
  margin: 0 auto;
  font-size: 12.5px;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}
.lp-page .ask-ai-fallback button {
  background: none;
  border: none;
  color: var(--navy);
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font-size: 12.5px;
}

@media (max-width: 480px) {
  .lp-page .ask-ai-providers { gap: 18px; }
  .lp-page .ask-ai-glyph { width: 54px; height: 54px; }
}

/* ── Footer ──────────────────────────────────────────────────────────── */
.lp-page .lp-footer {
  position: relative;
  overflow: hidden;
  background: radial-gradient(ellipse 90% 70% at 50% 0%, #2A4A6E 0%, var(--navy-dark) 55%, #081824 100%);
  padding: 120px 24px 40px;
  color: rgba(255,255,255,0.72);
}
.lp-page .lp-footer::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 30% 20%, rgba(111, 175, 154, 0.22) 0%, transparent 45%),
    radial-gradient(circle at 75% 60%, rgba(76, 110, 147, 0.35) 0%, transparent 50%);
  filter: blur(40px);
  opacity: 0.9;
}
.lp-page .footer-phone-stage {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  margin-bottom: 56px;
}
.lp-page .footer-phone {
  width: 200px;
  height: 260px;
  border-radius: 30px 30px 0 0;
  background: linear-gradient(160deg, #12233A 0%, #0A1826 100%);
  border: 1px solid rgba(255,255,255,0.14);
  border-bottom: none;
  box-shadow: 0 -20px 60px rgba(0,0,0,0.35), 0 -4px 16px rgba(111, 175, 154, 0.12);
  padding: 18px 14px 0;
  position: relative;
  animation: lpPhoneRise 5s ease-in-out infinite;
}
@keyframes lpPhoneRise { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.lp-page .footer-phone .fp-notch {
  width: 46px; height: 5px;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  margin: 0 auto 14px;
}
.lp-page .footer-phone .fp-logo {
  width: 34px; height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--sage) 0%, var(--sage-dark) 100%);
  display: flex; align-items: center; justify-content: center;
  color: white; font-weight: 800; font-size: 14px;
  margin: 0 auto 10px;
}
.lp-page .footer-phone .fp-title { text-align: center; color: white; font-size: 11.5px; font-weight: 700; margin-bottom: 14px; }
.lp-page .footer-phone .fp-line { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.12); margin-bottom: 7px; }
.lp-page .footer-phone .fp-line.short { width: 60%; margin: 0 auto; }
.lp-page .footer-phone .fp-glow {
  position: absolute;
  bottom: -30px; left: 50%;
  transform: translateX(-50%);
  width: 140%; height: 60px;
  background: radial-gradient(ellipse, rgba(111, 175, 154, 0.35) 0%, transparent 70%);
  pointer-events: none;
}

.lp-page .footer-content {
  position: relative;
  z-index: 1;
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 40px;
  padding-bottom: 44px;
  border-bottom: 1px solid rgba(255,255,255,0.12);
}
.lp-page .footer-brand-col .navbar-brand { color: white; margin-bottom: 12px; }
.lp-page .footer-brand-col p { font-size: 13.5px; line-height: 1.6; color: rgba(255,255,255,0.55); max-width: 280px; }
.lp-page .footer-col h4 { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.9); margin-bottom: 14px; }
.lp-page .footer-col ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.lp-page .footer-col a { font-size: 13.5px; color: rgba(255,255,255,0.6); text-decoration: none; }
.lp-page .footer-col a:hover { color: white; }

.lp-page .footer-bottom {
  position: relative;
  z-index: 1;
  max-width: 1100px;
  margin: 0 auto;
  padding-top: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12.5px;
  color: rgba(255,255,255,0.45);
}

@media (max-width: 760px) {
  .lp-page .lp-footer { padding: 90px 20px 32px; }
  .lp-page .footer-content { grid-template-columns: 1fr; gap: 30px; text-align: center; }
  .lp-page .footer-brand-col .navbar-brand { justify-content: center; }
  .lp-page .footer-brand-col p { margin: 0 auto; }
  .lp-page .footer-col ul { align-items: center; }
  .lp-page .footer-bottom { justify-content: center; text-align: center; }
}
`;
