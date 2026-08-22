/**
 * showcase.ts
 * Branding section (plain extraction vs. branded finished document) and
 * the Documents We Offer section (overlapping document preview cards).
 */

export const showcaseStyles = `
/* ── Branding section ───────────────────────────────────────────────── */
.lp-page .branding-section {
  padding: 100px 24px;
  background: linear-gradient(180deg, var(--bg) 0%, #EFEBE0 100%);
}
.lp-page .branding-compare {
  max-width: 980px;
  margin: 56px auto 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  align-items: stretch;
}
.lp-page .compare-card {
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.lp-page .compare-card .compare-label {
  padding: 12px 20px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.lp-page .compare-card.plain { background: #EDEBE4; }
.lp-page .compare-card.plain .compare-label { color: var(--muted); background: #E3E0D6; }
.lp-page .compare-card.plain .compare-body { padding: 22px 24px; }
.lp-page .compare-card.plain .plain-line { height: 8px; border-radius: 2px; background: #D6D2C6; margin-bottom: 10px; }
.lp-page .compare-card.plain .plain-line:nth-child(3) { width: 70%; }
.lp-page .compare-card.plain .plain-line:nth-child(5) { width: 85%; }

.lp-page .compare-card.branded { background: var(--surface); box-shadow: var(--shadow-lifted); }
.lp-page .compare-card.branded .compare-label { color: white; background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%); }
.lp-page .compare-card.branded .compare-body { padding: 22px 24px; }
.lp-page .compare-card.branded .branded-heading {
  font-size: 16px;
  font-weight: 700;
  color: var(--navy-dark);
  margin-bottom: 4px;
}
.lp-page .compare-card.branded .branded-sub {
  font-size: 12px;
  color: var(--sage-dark);
  font-weight: 600;
  margin-bottom: 16px;
}
.lp-page .compare-card.branded .branded-line { height: 8px; border-radius: 2px; background: var(--border); margin-bottom: 10px; }
.lp-page .compare-card.branded .branded-line:nth-child(4) { width: 70%; }
.lp-page .compare-card.branded .branded-chip-row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.lp-page .compare-card.branded .branded-chip {
  font-size: 10.5px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
}
.lp-page .compare-card.branded .branded-chip.good { background: var(--sage-tint); color: var(--sage-dark); }
.lp-page .compare-card.branded .branded-chip.warn { background: #FBEEE6; color: #B5602F; }

.lp-page .compare-arrow {
  display: none;
}

.lp-page .brand-palette-strip {
  max-width: 980px;
  margin: 32px auto 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
.lp-page .brand-palette-strip .palette-dot {
  width: 26px; height: 26px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--border);
}
.lp-page .brand-palette-strip .palette-note {
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
  margin-left: 6px;
}

@media (max-width: 820px) {
  .lp-page .branding-compare { grid-template-columns: 1fr; gap: 18px; }
}

/* ── Documents showcase ─────────────────────────────────────────────── */
.lp-page .documents-section {
  padding: 100px 24px 120px;
  background: var(--surface);
  overflow: hidden;
}
.lp-page .documents-fan {
  position: relative;
  max-width: 920px;
  margin: 64px auto 0;
  height: 340px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lp-page .doc-fan-card {
  position: absolute;
  width: 220px;
  background: var(--surface);
  border-radius: 16px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lifted);
  padding: 18px;
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s ease, z-index 0s;
  cursor: default;
}
.lp-page .doc-fan-card .fan-icon {
  width: 34px; height: 34px;
  border-radius: 10px;
  background: var(--bg);
  display: flex; align-items: center; justify-content: center;
  color: var(--navy);
  margin-bottom: 12px;
}
.lp-page .doc-fan-card .fan-label { font-size: 13.5px; font-weight: 700; color: var(--navy-dark); margin-bottom: 6px; line-height: 1.3; }
.lp-page .doc-fan-card .fan-desc { font-size: 11.5px; color: var(--muted); line-height: 1.45; }
.lp-page .doc-fan-card:hover {
  transform: var(--fan-hover-transform, translateY(-14px)) scale(1.04) !important;
  box-shadow: 0 22px 44px rgba(15, 39, 64, 0.2);
  z-index: 20 !important;
}

@media (max-width: 900px) {
  .lp-page .documents-fan { display: none; }
  .lp-page .documents-grid {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    max-width: 640px;
    margin: 48px auto 0;
  }
  .lp-page .documents-grid .doc-fan-card {
    position: static;
    width: 100%;
    transform: none !important;
  }
  .lp-page .documents-grid .doc-fan-card:hover { transform: translateY(-3px) !important; }
}
@media (min-width: 901px) {
  .lp-page .documents-grid { display: none; }
}
@media (max-width: 480px) {
  .lp-page .documents-grid { grid-template-columns: 1fr; }
}
`;
