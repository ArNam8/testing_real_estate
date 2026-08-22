/**
 * OnboardingFlow.tsx
 * First-time user onboarding — shown once, stored in localStorage.
 *
 * Three steps:
 *   1. What the app does (30-second pitch, zero jargon)
 *   2. How to record (the critical "say the room name" instruction)
 *   3. Ready — one tap to start
 *
 * Design rules:
 *   - Matches the app's existing colour scheme and CSS classes exactly
 *   - No tutorial feel — reads like a natural welcome, not a manual
 *   - Step dots at the bottom, swipe-style forward/back navigation
 *   - Dismissed state stored in localStorage under 'wt_onboarded'
 */

import { useState, useCallback } from 'react';
import { Mic, FileText, ArrowRight, ChevronLeft } from 'lucide-react';

// ─── localStorage key ─────────────────────────────────────────────────────────

const ONBOARDING_KEY = 'wt_onboarded';

/** Returns true if this user has already completed onboarding. */
export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false; // localStorage unavailable (private mode etc.) — show it anyway
  }
}

/** Mark onboarding as complete so it never shows again. */
function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // Non-fatal — worst case they see it again next visit
  }
}

// ─── Step definitions ─────────────────────────────────────────────────────────

interface Step {
  illustration: React.ReactNode;
  title: string;
  body: string;
  /** Optional smaller sub-note shown beneath the body text. */
  note?: string;
}

/**
 * The three onboarding steps. Kept deliberately short — agents are busy
 * and won't read a wall of text.
 */
const STEPS: Step[] = [
  {
    illustration: (
      <div className="relative">
        {/* Outer pulse rings */}
        <div
          className="absolute inset-0 rounded-full animate-pulse-ring"
          style={{ background: 'rgba(30, 58, 95, 0.08)' }}
        />
        <div
          className="absolute inset-0 rounded-full animate-pulse-ring"
          style={{ background: 'rgba(30, 58, 95, 0.05)', animationDelay: '0.7s' }}
        />
        {/* Main circle */}
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center relative"
          style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2740 100%)',
            boxShadow: '0 8px 32px rgba(30, 58, 95, 0.25)',
          }}
        >
          <Mic size={44} className="text-white" />
        </div>
      </div>
    ),
    title: 'Walk. Talk. Done.',
    body: 'Record yourself walking through a property. Walkthrough AI turns your audio into professional documents — listing descriptions, inspection notes, client summaries — in about 30 seconds.',
    note: 'No typing. No templates. Just talk.',
  },
  {
    illustration: (
      <div className="relative flex flex-col items-center gap-3">
        {/* Room sequence illustration */}
        {[
          { label: 'Kitchen', delay: '0s', opacity: 1 },
          { label: 'Living Room', delay: '0.15s', opacity: 0.7 },
          { label: 'Master Bedroom', delay: '0.3s', opacity: 0.45 },
        ].map(({ label, delay, opacity }) => (
          <div
            key={label}
            className="px-5 py-2.5 rounded-xl border text-sm font-semibold animate-fade-in"
            style={{
              animationDelay: delay,
              opacity,
              background: opacity === 1 ? '#1e3a5f' : 'white',
              color: opacity === 1 ? 'white' : '#1e3a5f',
              borderColor: '#1e3a5f',
              boxShadow: opacity === 1 ? '0 4px 14px rgba(30,58,95,0.25)' : 'none',
              width: '200px',
              textAlign: 'center',
            }}
          >
            {label}
          </div>
        ))}
        {/* Microphone icon below */}
        <div
          className="mt-1 w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: '#e8eef5' }}
        >
          <Mic size={18} style={{ color: '#1e3a5f' }} />
        </div>
      </div>
    ),
    title: 'Say the room name first',
    body: 'As you step into each room, just say its name out loud — "Kitchen", "Living Room", "Master Bedroom" — then describe what you see naturally.',
    note: 'This is the one thing that makes the AI dramatically more accurate. That\'s it.',
  },
  {
    illustration: (
      <div className="relative flex items-center justify-center">
        {/* Document stack illustration */}
        <div className="relative w-28 h-28">
          {/* Back document */}
          <div
            className="absolute rounded-2xl border"
            style={{
              width: 80, height: 100,
              top: 14, left: 30,
              background: '#f1f5f9',
              borderColor: '#e2e8f0',
              transform: 'rotate(6deg)',
            }}
          />
          {/* Middle document */}
          <div
            className="absolute rounded-2xl border"
            style={{
              width: 80, height: 100,
              top: 8, left: 22,
              background: '#f8fafc',
              borderColor: '#e2e8f0',
              transform: 'rotate(-3deg)',
            }}
          />
          {/* Front document */}
          <div
            className="absolute rounded-2xl border flex flex-col justify-center items-center gap-2"
            style={{
              width: 80, height: 100,
              top: 14, left: 24,
              background: 'white',
              borderColor: '#cbd5e1',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
          >
            <FileText size={20} style={{ color: '#1e3a5f' }} />
            <div className="space-y-1.5 w-10">
              <div className="h-1 rounded-full bg-slate-200" />
              <div className="h-1 rounded-full bg-slate-200 w-3/4" />
              <div className="h-1 rounded-full bg-slate-200" />
            </div>
          </div>
          {/* Checkmark badge */}
          <div
            className="absolute w-7 h-7 rounded-full flex items-center justify-center"
            style={{
              background: '#0f766e',
              bottom: 10, right: 6,
              boxShadow: '0 2px 8px rgba(15,118,110,0.35)',
            }}
          >
            <span className="text-white text-xs font-bold">✓</span>
          </div>
        </div>
      </div>
    ),
    title: 'Your documents, instantly',
    body: 'After your walkthrough, choose which documents you need. The AI reads your recording and generates everything — ready to copy, share, or use directly.',
    note: 'First 3 walkthroughs are free. No credit card needed.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingFlowProps {
  /** Called when the user taps "Get started" on the final step. */
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [exiting, setExiting] = useState(false);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const step = STEPS[stepIndex];

  /** Advance to the next step, or complete onboarding on the last step. */
  const handleNext = useCallback(() => {
    if (isLast) {
      markOnboardingComplete();
      setExiting(true);
      // Small delay so the exit animation plays before unmounting
      setTimeout(onComplete, 280);
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [isLast, onComplete]);

  const handleBack = useCallback(() => {
    if (!isFirst) setStepIndex((i) => i - 1);
  }, [isFirst]);

  return (
    /*
     * Full-screen overlay. Uses the same light background as the app
     * so it feels continuous, not like a modal popup.
     */
    <div
      className={`fixed inset-0 z-50 flex flex-col ${exiting ? 'animate-scale-out' : 'animate-fade-in'}`}
      style={{ background: '#f8fafb' }}
    >
      {/* Skip button — top right, always visible */}
      <div className="flex justify-end px-5 pt-5 pb-2">
        <button
          onClick={() => {
            markOnboardingComplete();
            onComplete();
          }}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors px-3 py-1.5"
        >
          Skip
        </button>
      </div>

      {/* Step content — centred, takes most of the vertical space */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-4">

        {/* Illustration area */}
        <div
          key={`illustration-${stepIndex}`}
          className="flex items-center justify-center mb-10 h-36 animate-scale-in"
        >
          {step.illustration}
        </div>

        {/* Text */}
        <div
          key={`text-${stepIndex}`}
          className="text-center animate-fade-in max-w-xs"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-3 leading-tight">
            {step.title}
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-3">
            {step.body}
          </p>
          {step.note && (
            <p className="text-xs font-semibold text-slate-400">
              {step.note}
            </p>
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="px-6 pb-10 flex flex-col items-center gap-5">

        {/* Step dots */}
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStepIndex(i)}
              className="transition-all duration-300 rounded-full"
              style={{
                width: i === stepIndex ? 20 : 6,
                height: 6,
                background: i === stepIndex ? '#1e3a5f' : '#cbd5e1',
              }}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Primary CTA */}
        <button
          onClick={handleNext}
          className="btn-primary w-full max-w-xs justify-center"
          style={{ paddingTop: '14px', paddingBottom: '14px' }}
        >
          {isLast ? (
            <>
              <Mic size={18} /> Get started
            </>
          ) : (
            <>
              Next <ArrowRight size={16} />
            </>
          )}
        </button>

        {/* Back button — hidden on step 1 */}
        {!isFirst && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}
      </div>
    </div>
  );
}
