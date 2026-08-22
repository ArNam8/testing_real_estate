/**
 * Navbar.tsx
 * Fixed top navigation. Background fades in a blurred surface once the
 * page scrolls past a small threshold (see useNavbarScrollState).
 */

import { useRef } from 'react';
import { useNavbarScrollState } from './hooks';

interface NavbarProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

export function Navbar({ onSignIn, onSignUp }: NavbarProps) {
  const navRef = useRef<HTMLElement>(null);
  useNavbarScrollState(navRef);

  return (
    <nav className="navbar" ref={navRef}>
      <a href="#top" className="navbar-brand">
        <span className="navbar-logo">W</span>
        <span>Walkthrough AI</span>
      </a>
      <ul className="navbar-links">
        <li><a href="#steps">How it works</a></li>
        <li><a href="#documents">Documents</a></li>
        <li><a href="#trust">Why trust it</a></li>
      </ul>
      <div className="navbar-actions">
        <button type="button" className="navbar-login" onClick={onSignIn}>Log in</button>
        <button type="button" className="btn-primary" onClick={onSignUp}>Sign up</button>
      </div>
    </nav>
  );
}
