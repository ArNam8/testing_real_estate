/**
 * index.ts (styles)
 * Concatenates every CSS chunk into one string, injected once via a single
 * <style> tag by LandingPage.tsx. Split into files by section purely for
 * editability — the browser sees one stylesheet.
 */

import { baseStyles } from './base';
import { heroStyles } from './hero';
import { stepsStyles } from './steps';
import { showcaseStyles } from './showcase';
import { closingStyles } from './closing';

export const landingStyles = [
  baseStyles,
  heroStyles,
  stepsStyles,
  showcaseStyles,
  closingStyles,
].join('\n');
