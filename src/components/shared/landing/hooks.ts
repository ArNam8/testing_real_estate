/**
 * hooks.ts
 * Small shared scroll-driven behaviors used across the landing page.
 */

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Fades/slides in any descendant of `containerRef` carrying the `.reveal`
 * class as it scrolls into view, then stops observing it (one-shot).
 * Uses IntersectionObserver rather than a scroll listener so it's cheap
 * even with many elements, and gracefully does nothing if the browser
 * doesn't support it (elements just stay visible via the CSS default).
 */
export function useScrollReveal(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;

    const targets = container.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [containerRef]);
}

/** Toggles a `.scrolled` class on the navbar once the page scrolls past a small threshold. */
export function useNavbarScrollState(navRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    function update() {
      if (!nav) return;
      if (window.scrollY > 40) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, [navRef]);
}

/** True while the viewport is at or below `maxWidth`, kept in sync on resize. */
export function useIsNarrowViewport(maxWidth: number): RefObject<boolean> {
  const isNarrow = useRef(typeof window !== 'undefined' ? window.innerWidth <= maxWidth : false);

  useEffect(() => {
    function update() {
      isNarrow.current = window.innerWidth <= maxWidth;
    }
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, [maxWidth]);

  return isNarrow;
}
