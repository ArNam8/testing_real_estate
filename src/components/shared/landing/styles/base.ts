/**
 * base.ts
 * Design tokens, resets, keyframe utilities, and navbar styles.
 * Scoped under .lp-page so nothing here collides with the rest of the app's
 * global styles (src/index.css) — several class/keyframe names would
 * otherwise clash silently.
 *
 * Color tokens are intentionally set to match the REAL app design system
 * (App-UI navy #1E3A5F -> #0F2740 gradient, sage accent #6FAF9A, off-white
 * background #F5F4F0) rather than the previous landing page's own
 * #17345B/#5F7FA9 pair, which had drifted from the product and is why the
 * old page didn't feel like it belonged to the app.
 */

export const baseStyles = `
.lp-page {
  --navy: #1E3A5F;
  --navy-dark: #0F2740;
  --navy-light: #4C6E93;
  --sage: #6FAF9A;
  --sage-dark: #56917E;
  --sage-tint: #E3F0EB;
  --bg: #F5F4F0;
  --surface: #FFFFFF;
  --fg: #21201C;
  --muted: #726C61;
  --border: #E4E0D6;
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --shadow-soft: 0 1px 2px rgba(15, 39, 64, 0.04), 0 8px 24px rgba(15, 39, 64, 0.06);
  --shadow-lifted: 0 12px 32px rgba(15, 39, 64, 0.14), 0 4px 10px rgba(15, 39, 64, 0.08);
  --radius-lg: 28px;
  --radius-md: 18px;
  --radius-sm: 12px;

  font-family: var(--font);
  color: var(--fg);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
}

.lp-page, .lp-page * { box-sizing: border-box; }
.lp-page a { color: inherit; }
.lp-page button { font-family: var(--font); }
.lp-page img { max-width: 100%; display: block; }

.lp-page .reveal {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}
.lp-page .reveal.revealed { opacity: 1; transform: translateY(0); }
.lp-page .reveal-delay-1 { transition-delay: 0.08s; }
.lp-page .reveal-delay-2 { transition-delay: 0.16s; }
.lp-page .reveal-delay-3 { transition-delay: 0.24s; }

@media (prefers-reduced-motion: reduce) {
  .lp-page .reveal { transition-duration: 0.01ms !important; }
  .lp-page * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}

.lp-page .lp-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sage-dark);
  background: var(--sage-tint);
  padding: 7px 16px;
  border-radius: 999px;
}

.lp-page .lp-section-head {
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
}
.lp-page .lp-section-head h2 {
  font-size: clamp(30px, 4.4vw, 48px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 18px 0 14px;
  color: var(--navy-dark);
}
.lp-page .lp-section-head p {
  font-size: clamp(15px, 1.6vw, 18px);
  line-height: 1.6;
  color: var(--muted);
}

.lp-page .btn-primary {
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
  color: white;
  border: none;
  border-radius: 12px;
  padding: 14px 26px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.lp-page .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(15, 39, 64, 0.28); }
.lp-page .btn-primary:active { transform: translateY(0); }

.lp-page .btn-primary-lg {
  padding: 17px 34px;
  font-size: 16px;
  border-radius: 14px;
  position: relative;
  overflow: hidden;
}
.lp-page .btn-primary-lg::after {
  content: '';
  position: absolute;
  top: 0; left: -120%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  animation: lpShimmer 4.5s ease-in-out infinite;
}
@keyframes lpShimmer { 0%, 65%, 100% { left: -120%; } 82% { left: 130%; } }

.lp-page .btn-secondary {
  background: var(--surface);
  color: var(--navy-dark);
  border: 1.5px solid var(--border);
  border-radius: 12px;
  padding: 13px 24px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.lp-page .btn-secondary:hover { border-color: var(--navy-light); transform: translateY(-1px); }

/* ── Navbar ─────────────────────────────────────────────────────────── */
.lp-page .navbar {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 32px;
  transition: background 0.25s ease, box-shadow 0.25s ease, padding 0.25s ease;
}
.lp-page .navbar.scrolled {
  background: rgba(245, 244, 240, 0.85);
  backdrop-filter: blur(14px) saturate(1.4);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  box-shadow: 0 1px 0 var(--border), 0 12px 28px rgba(15, 39, 64, 0.06);
  padding: 12px 32px;
}
.lp-page .navbar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 15px;
  text-decoration: none;
  color: var(--navy-dark);
}
.lp-page .navbar-logo {
  width: 32px; height: 32px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
  display: flex; align-items: center; justify-content: center;
  color: white; font-size: 13px; font-weight: 800;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(15, 39, 64, 0.25);
}
.lp-page .navbar-links {
  display: flex;
  align-items: center;
  gap: 30px;
  list-style: none;
  margin: 0; padding: 0;
}
.lp-page .navbar-links a {
  font-size: 14px;
  font-weight: 500;
  color: var(--fg);
  text-decoration: none;
  transition: color 0.15s ease;
}
.lp-page .navbar-links a:hover { color: var(--navy); }
.lp-page .navbar-actions { display: flex; align-items: center; gap: 14px; }
.lp-page .navbar-login {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
  text-decoration: none;
}
.lp-page .navbar-login:hover { color: var(--navy); }

@media (max-width: 900px) {
  .lp-page .navbar-links { display: none; }
  .lp-page .navbar { padding: 14px 18px; }
  .lp-page .navbar.scrolled { padding: 11px 18px; }
}
@media (max-width: 420px) {
  .lp-page .navbar-login { display: none; }
  .lp-page .navbar-brand span { font-size: 13px; }
}
`;
