/**
 * Footer.tsx
 * Cinematic closing footer — a blurred background with a phone emerging
 * from it, showing the Walkthrough AI logo, followed by standard footer
 * navigation and copyright.
 */

export function Footer({ onSignUp }: { onSignUp: () => void }) {
  const year = new Date().getFullYear();

  return (
    <footer className="lp-footer">
      <div className="footer-phone-stage">
        <div className="footer-phone">
          <div className="fp-notch" />
          <div className="fp-logo">W</div>
          <div className="fp-title">Walkthrough AI</div>
          <div className="fp-line" />
          <div className="fp-line" />
          <div className="fp-line short" />
          <div className="fp-glow" />
        </div>
      </div>

      <div className="footer-content">
        <div className="footer-brand-col">
          <a href="#top" className="navbar-brand">
            <span className="navbar-logo">W</span>
            <span>Walkthrough AI</span>
          </a>
          <p>Turn a spoken property walkthrough into polished, branded real estate documents — no typing required.</p>
        </div>
        <div className="footer-col">
          <h4>Product</h4>
          <ul>
            <li><a href="#steps">How it works</a></li>
            <li><a href="#documents">Documents</a></li>
            <li><a href="#trust">Why trust it</a></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Get started</h4>
          <ul>
            <li><button type="button" onClick={onSignUp} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>Sign up</button></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© {year} Walkthrough AI. All rights reserved.</span>
      </div>
    </footer>
  );
}
