/**
 * FollowUpStage.tsx
 * Sits between recording and document generation. Three sub-phases:
 *
 *   1. 'processing' — Pass 1 (transcription + extraction) is genuinely still
 *      running server-side. Shown as a calm vertical checklist (Transcribing
 *      / Understanding / Checking) — the pattern Perplexity and Linear use
 *      for "real multi-step AI work in progress." Only the current row is
 *      ever animated; rows above sit quietly checked off, rows below wait
 *      quietly. There is NO fixed timeout — we poll for a real signal
 *      (follow_up_questions written, or the background pipeline reporting
 *      failure) and only leave once one of those has really happened.
 *
 *   2. 'choice' — Pass 1 has finished. The agent picks between answering a
 *      few quick clarifying questions (recommended — improves accuracy) or
 *      generating immediately from the recording alone.
 *
 *   3. 'questions' — only reached if the agent chose to answer questions.
 *      Has a Back button to return to 'choice' without losing anything.
 *
 * PROCESSING PSYCHOLOGY (why it's built this way):
 *   - Labor illusion (Buell, Harvard): people trust results more when they
 *     see real work happening, not just a generic spinner — so each row
 *     names the actual thing happening, not vague filler.
 *   - Progress must move forward, never fake-reset: the third row (Checking)
 *     simply stays active for as long as real processing takes — it never
 *     resets or lies about being finished.
 *   - Never add artificial delay: the product's whole value is speed. If
 *     the real result arrives before a row's natural pacing finishes (e.g.
 *     a short/sparse recording), the checklist quickly ticks through the
 *     remaining rows as a fast "catch up" instead of forcing the agent to
 *     sit through a full fake choreography. The real wait is never padded.
 *   - Peak-end rule: once all three rows are genuinely checked, everything
 *     holds calmly for a beat before the card hands off to the choice
 *     screen — the ending of a wait is what gets remembered.
 *   - Calm over dramatic: only one row animates at a time, and only by a
 *     small amount (icon swap, a short ripple-word underneath). Nothing
 *     sweeps across the whole screen — that reads as showy, not confident.
 *
 * Why no fixed poll timeout: generate-followups itself costs zero extra
 * Gemini calls (it deterministically derives questions from the
 * extraction_data Pass 1 already produced) — so the only real wait is Pass 1
 * finishing, which always eventually resolves or fails (the edge function's
 * own retry logic has its own ~60s ceiling).
 *
 * IMPORTANT: answers collected here are forwarded through to the generate
 * edge function so Gemini can use them as confirmed facts in every document.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ArrowRight, ArrowLeft, ChevronRight, Loader2, AlertCircle, CheckCircle2,
  Sparkles, AudioLines, BrainCircuit, ListChecks,
} from 'lucide-react';
import { propertiesService } from '../../services/supabase';
import type { FollowUpQuestion } from '../../services/supabase';

interface FollowUpStageProps {
  propertyId: string;
  onComplete: (answers: Record<string, string>) => void;
  onSkip: () => void;
  /**
   * Status of the background generate-followups call, tracked by App.tsx.
   *  - 'pending': still in flight — keep waiting for the real signal
   *  - 'ready': succeeded — questions should already be in the DB
   *  - 'failed': call already failed — stop waiting and offer fallback
   *    questions instead of continuing to poll for something that will
   *    never arrive
   */
  followUpsStatus: 'pending' | 'ready' | 'failed';
  /** Recording duration in seconds — used only to decide whether to show
   *  a "longer recordings take a little extra time" note during processing. */
  recordingDurationSec: number;
}

/** What the real Pass 1 signal resolved to, once it's known. */
type Resolution = 'skip' | { questions: FollowUpQuestion[]; source: 'ai' | 'fallback' };

// ─── Fallback questions ───────────────────────────────────────────────────────

/**
 * Generic questions used ONLY when the AI call failed entirely.
 * These cover the most universally missing facts in a property walkthrough.
 */
const FALLBACK_QUESTIONS: FollowUpQuestion[] = [
  { id: 'f1', question: 'What is the approximate square footage?',                  category: 'Size' },
  { id: 'f2', question: 'How many bedrooms and bathrooms does the property have?',  category: 'Layout' },
  { id: 'f3', question: 'What year was the property built?',                        category: 'History' },
  { id: 'f4', question: 'What is the overall condition — any known issues?',        category: 'Condition' },
  { id: 'f5', question: 'What heating and cooling systems are installed?',          category: 'Systems' },
  { id: 'f6', question: 'Any recent renovations, upgrades, or appliances included?',category: 'Updates' },
  { id: 'f7', question: 'Is there a garage, parking, or any outdoor space?',       category: 'Features' },
  { id: 'f8', question: 'What is the asking price or target price range?',         category: 'Price' },
];

/** How long to wait between polling attempts. */
const POLL_INTERVAL_MS = 2000;

/** A recording longer than this gets a "takes a little extra time" note. */
const LONG_RECORDING_THRESHOLD_SEC = 5 * 60;

/** Natural pacing for the first two rows, in ms, before the third
 *  (Checking) settles into its indefinite "still working" state. */
const ROW_PACE_MS = [2400, 2700];

/** How fast rows tick off once the real result has already arrived —
 *  always fast, since we're never adding real delay here. */
const CATCH_UP_ROW_MS = 320;

/** Brief hold once all rows are checked, before moving on (peak-end beat). */
const COMPLETION_HOLD_MS = 600;

/** The three checklist rows, each with a navy icon and a small set of
 *  synonym words that ripple in underneath while that row is active. */
const ROWS = [
  { label: 'Transcribing',  Icon: AudioLines,   words: ['listening', 'capturing', 'converting', 'hearing'] },
  { label: 'Understanding', Icon: BrainCircuit, words: ['reading', 'fathoming', 'comprehending', 'grasping'] },
  { label: 'Checking',      Icon: ListChecks,   words: ['reviewing', 'verifying', 'confirming', 'double-checking'] },
] as const;

/** Cycles through a word list, ripple-revealing a new one every `intervalMs`. */
function useCyclingWord(words: readonly string[], resetKey: number, intervalMs = 1500) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(id);
  }, [words, resetKey, intervalMs]);
  return words[index % words.length];
}

/** Renders a word with each letter rippling in with a slight stagger,
 *  rather than the whole word popping or fading in as one flat block. */
function RippleWord({ word }: { word: string }) {
  return (
    <span key={word} className="inline-flex" aria-label={word}>
      {word.split('').map((ch, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block animate-ripple-letter"
          style={{ animationDelay: `${i * 20}ms` }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FollowUpStage({
  propertyId, onComplete, onSkip, followUpsStatus, recordingDurationSec,
}: FollowUpStageProps) {
  /** Top-level sub-phase within this stage. */
  const [phase, setPhase] = useState<'processing' | 'choice' | 'questions'>('processing');
  /** Where the questions shown (if the agent picks "answer questions") came from. */
  const [questionSource, setQuestionSource] = useState<'ai' | 'fallback'>('ai');
  const [questions, setQuestions] = useState<FollowUpQuestion[]>([]);
  const [answers, setAnswers]     = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Number of checklist rows (0–3) currently shown as fully checked. */
  const [rowsDone, setRowsDone] = useState(0);
  /** Which row is the active one right now (-1 once all are done). */
  const activeRowIndex = rowsDone < ROWS.length ? rowsDone : -1;
  const activeWords = activeRowIndex >= 0 ? ROWS[activeRowIndex].words : (['ready'] as const);
  const activeWord = useCyclingWord(activeWords, activeRowIndex);

  const isMountedRef = useRef(true);
  useEffect(() => {
    // BUGFIX (stuck-forever spinner in dev): useRef(true) only seeds its
    // value on the very first render of a hook instance. React 18
    // StrictMode deliberately mounts every component, unmounts it, then
    // mounts it again to surface exactly this class of bug. Explicitly
    // resetting it to true on every mount keeps the flag correct regardless
    // of how many times StrictMode (or any future remount) runs this.
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  /** Scroll to the top of the page on every phase change, so the agent
   *  always lands seeing the top of the new screen (buttons included)
   *  rather than being stuck scrolled down from the previous screen. */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase]);

  /** Set once the real Pass 1 signal is known. Read synchronously inside
   *  timer callbacks so natural pacing stops the instant real data arrives. */
  const resolutionRef = useRef<Resolution | null>(null);
  /** Mirrors resolutionRef in state so the completion effect can react to it. */
  const [resolution, setResolution] = useState<Resolution | null>(null);

  const followUpsStatusRef = useRef(followUpsStatus);
  useEffect(() => {
    followUpsStatusRef.current = followUpsStatus;
  }, [followUpsStatus]);

  /** Stable ref to onSkip so effects can call it without depending on the
   *  prop's identity — App.tsx passes a new arrow function on every render,
   *  which would otherwise cause the completion effect below to re-fire. */
  const onSkipRef = useRef(onSkip);
  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  // ── Natural forward pacing for the first two rows ─────────────────────────
  useEffect(() => {
    if (followUpsStatusRef.current === 'failed') return; // handled below, skip pacing entirely

    const timers = ROW_PACE_MS.map((_, i) =>
      setTimeout(() => {
        if (!isMountedRef.current || resolutionRef.current) return;
        setRowsDone((d) => Math.max(d, i + 1));
      }, ROW_PACE_MS.slice(0, i + 1).reduce((a, b) => a + b, 0))
    );
    // Each timer fires at the cumulative sum of pacing delays up to and
    // including its own index — e.g. row 0 checks at ROW_PACE_MS[0], row 1
    // checks at ROW_PACE_MS[0] + ROW_PACE_MS[1].
    return () => timers.forEach(clearTimeout);
  }, []);

  // ── Wait for the real Pass 1 signal (no fixed timeout) ────────────────────
  useEffect(() => {
    if (followUpsStatusRef.current === 'failed') {
      resolutionRef.current = { questions: FALLBACK_QUESTIONS, source: 'fallback' };
      setResolution(resolutionRef.current);
      return;
    }

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled || !isMountedRef.current) return;

      try {
        const prop = await propertiesService.getById(propertyId);
        if (cancelled || !isMountedRef.current) return;

        const aiQuestions = prop.follow_up_questions;

        if (Array.isArray(aiQuestions) && aiQuestions.length > 0) {
          resolutionRef.current = { questions: aiQuestions, source: 'ai' };
          setResolution(resolutionRef.current);
          return;
        }

        if (
          Array.isArray(aiQuestions) &&
          aiQuestions.length === 0 &&
          followUpsStatusRef.current === 'ready'
        ) {
          // Thorough walkthrough, nothing left to clarify.
          resolutionRef.current = 'skip';
          setResolution('skip');
          return;
        }

        if (followUpsStatusRef.current === 'failed') {
          resolutionRef.current = { questions: FALLBACK_QUESTIONS, source: 'fallback' };
          setResolution(resolutionRef.current);
          return;
        }

        // Still genuinely in progress — no ceiling, just check again shortly.
        timerId = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        timerId = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [propertyId]);

  // ── Once resolved, tick through any remaining rows, hold, then advance ───
  useEffect(() => {
    if (!resolution) return;

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      setRowsDone((current) => {
        if (current >= ROWS.length) return current;
        const next = current + 1;
        if (next >= ROWS.length) {
          // All rows checked — hold for a beat (peak-end), then actually
          // advance to the choice screen / skip straight on.
          setTimeout(() => {
            if (cancelled || !isMountedRef.current) return;
            if (resolution === 'skip') {
              onSkipRef.current();
            } else {
              setQuestions(resolution.questions);
              setQuestionSource(resolution.source);
              setPhase('choice');
            }
          }, COMPLETION_HOLD_MS);
        } else {
          setTimeout(tick, CATCH_UP_ROW_MS);
        }
        return next;
      });
    };
    tick();

    return () => { cancelled = true; };
  }, [resolution]);

  /**
   * Save answers to the property record and advance to generation.
   * Non-fatal if the DB save fails — the in-memory answers still reach Gemini.
   */
  const handleContinue = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    const filledAnswers = Object.fromEntries(
      Object.entries(answers).filter(([, v]) => v?.trim())
    );

    try {
      await propertiesService.update(propertyId, {
        follow_up_answers: filledAnswers,
        workflow_stage: 'generate',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save answers.';
      setSaveError(`Answers not saved to server (${msg}) — they'll still be used for generation.`);
      await new Promise((r) => setTimeout(r, 1200));
    } finally {
      setSaving(false);
      onComplete(filledAnswers);
    }
  }, [propertyId, answers, onComplete]);

  const answeredCount   = Object.values(answers).filter((v) => v?.trim()).length;
  const progressPercent = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
  const isLongRecording = recordingDurationSec > LONG_RECORDING_THRESHOLD_SEC;

  // ── Phase: processing — centered vertical stepper with connecting line ───
  if (phase === 'processing') {
    const ROW_HEIGHT = 68;          // px — fixed so the connecting line's math stays exact
    const trackHeight = ROW_HEIGHT * (ROWS.length - 1); // distance between first and last icon centers
    const fillHeight = (Math.min(rowsDone, ROWS.length - 1) / (ROWS.length - 1)) * trackHeight;

    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-6">
        <div className="card w-full max-w-md mx-auto px-8 py-9 sm:py-10">

          <div className="text-center mb-8">
            <h2 className="text-lg font-bold" style={{ color: '#1a2e45' }}>
              Processing Your Walkthrough
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Turning your recording into structured property data
            </p>
          </div>

          <div className="flex items-center justify-center">
          <div className="relative" style={{ width: 'fit-content' }}>

            {/* Background track — gray, spans between the first and last icon centers */}
            <div
              className="absolute w-0.5 rounded-full"
              style={{
                left: 27, top: ROW_HEIGHT / 2, height: trackHeight,
                background: 'rgba(148,163,184,0.3)',
              }}
            />
            {/* Filled progress — navy, grows smoothly as rows complete */}
            <div
              className="absolute w-0.5 rounded-full transition-all ease-out"
              style={{
                left: 27, top: ROW_HEIGHT / 2, height: fillHeight,
                background: 'linear-gradient(180deg, #1e3a5f 0%, #0f2740 100%)',
                transitionDuration: '500ms',
              }}
            />

            {ROWS.map((row, i) => {
              const isDone   = i < rowsDone;
              const isActive = i === activeRowIndex;
              const { Icon } = row;
              return (
                <div
                  key={row.label}
                  className="relative flex items-center gap-3.5"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="relative w-14 h-14 flex items-center justify-center flex-shrink-0">
                    <div
                      className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300"
                      style={
                        isDone || isActive
                          ? { background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2740 100%)' }
                          : { background: '#f1f5f9' }
                      }
                    >
                      {isActive && (
                        <span
                          className="absolute inset-0 rounded-xl animate-pulse-slow"
                          style={{ boxShadow: '0 0 0 4px rgba(30,58,95,0.14)' }}
                        />
                      )}
                      {isDone
                        ? <CheckCircle2 size={16} className="text-white animate-check-pop" />
                        : <Icon size={16} className={isActive ? 'text-white' : 'text-slate-300'} strokeWidth={2} />
                      }
                    </div>
                  </div>

                  <div className="relative text-left">
                    <span
                      className="text-sm font-semibold transition-colors duration-300"
                      style={{ color: isDone || isActive ? '#1a2e45' : '#94a3b8' }}
                    >
                      {row.label}
                    </span>
                    {isActive && (
                      <p className="absolute top-full left-0 pt-0.5 text-xs text-slate-400 italic whitespace-nowrap animate-fade-in">
                        <RippleWord word={activeWord} />…
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>

        <p className="text-slate-400 text-xs text-center mt-5">
          This finishes on its own — no need to wait around.
        </p>
        {isLongRecording && (
          <p className="text-slate-400 text-xs text-center mt-1.5 italic">
            Longer recordings can take a little extra time.
          </p>
        )}

        <style>{`
          @keyframes check-pop {
            0%   { transform: scale(0.4); opacity: 0; }
            100% { transform: scale(1);   opacity: 1; }
          }
          @keyframes ripple-letter {
            from { transform: translateY(3px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          .animate-check-pop {
            animation: check-pop 280ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
          }
          .animate-ripple-letter {
            animation: ripple-letter 320ms cubic-bezier(0.4, 0, 0.2, 1) both;
          }
        `}</style>
      </div>
    );
  }

  // ── Phase: choice ──────────────────────────────────────────────────────────
  if (phase === 'choice') {
    return (
      <div className="animate-fade-in max-w-md mx-auto">
        <div className="mb-7 text-center animate-slide-up">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2740 100%)' }}
          >
            <CheckCircle2 size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-1.5" style={{ color: '#1a2e45' }}>
            Your walkthrough is understood
          </h1>
          <p className="text-slate-500 text-sm max-w-xs mx-auto leading-relaxed">
            Answer a few quick questions to sharpen accuracy, or generate your documents right now.
          </p>
        </div>

        {questionSource === 'fallback' && (
          <div className="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 animate-slide-up">
            <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-amber-700 text-xs leading-relaxed">
              AI couldn't tailor questions to your recording this time — standard questions are ready instead if you'd like to use them.
            </p>
          </div>
        )}

        {/* Primary, pushed option */}
        <div
          onClick={() => setPhase('questions')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') setPhase('questions'); }}
          className="card-interactive p-5 sm:p-4 mb-3 animate-slide-up"
          style={{
            borderColor: 'rgba(30,58,95,0.35)',
            background: 'linear-gradient(135deg, rgba(30,58,95,0.05) 0%, rgba(15,39,64,0.03) 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2740 100%)' }}
            >
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm sm:text-sm text-slate-800">Answer a few quick questions</p>
                <span
                  className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(30,58,95,0.12)', color: '#1e3a5f' }}
                >
                  Recommended
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {questions.length} question{questions.length === 1 ? '' : 's'} — improves document accuracy
              </p>
            </div>
            <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
          </div>
        </div>

        {/* Secondary, quieter option */}
        <div
          onClick={() => onSkip()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onSkip(); }}
          className="card-interactive p-5 sm:p-4 animate-slide-up"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-100">
              <ArrowRight size={18} className="text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-slate-700">Generate now</p>
              <p className="text-xs text-slate-400 mt-0.5">Use only what's in the recording</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: questions ────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">

      {/* Back to choice */}
      <button
        onClick={() => setPhase('choice')}
        className="btn-ghost !px-0 !justify-start mb-3 text-slate-400"
      >
        <ArrowLeft size={15} /> Back
      </button>

      {/* Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold mb-1" style={{ color: '#1a2e45' }}>A few quick questions</h1>
        <p className="text-slate-500 text-sm">
          Fills gaps in your recording — so documents are accurate, not guessed.
        </p>
      </div>

      {/* Source indicator */}
      <div className="flex items-center gap-2 mb-5">
        {questionSource === 'ai' ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <Sparkles size={11} /> AI questions — based on your recording
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle size={11} /> Standard questions — AI couldn't tailor these this time
          </span>
        )}
      </div>

      {/* Save error */}
      {saveError && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-amber-700 text-xs leading-relaxed">{saveError}</p>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1.5 rounded-full mb-1 overflow-hidden" style={{ background: 'rgba(226,220,210,0.6)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${progressPercent}%`, background: 'linear-gradient(90deg, #1e3a5f 0%, #0f2740 100%)' }}
        />
      </div>
      <p className="text-xs text-slate-400 mb-6">
        {answeredCount} of {questions.length} answered
        {answeredCount === questions.length && questions.length > 0 && (
          <span className="font-semibold ml-2" style={{ color: '#1e3a5f' }}>— all done!</span>
        )}
      </p>

      {/* Question cards */}
      <div className="space-y-3 mb-8">
        {questions.map((q, i) => {
          const answered = !!answers[q.id]?.trim();
          return (
            <div
              key={q.id}
              className="card p-4 transition-all duration-200 animate-slide-up"
              style={{
                animationDelay: `${i * 40}ms`,
                ...(answered ? { borderColor: 'rgba(30,58,95,0.35)', background: 'rgba(30,58,95,0.05)' } : {}),
              }}
            >
              <div className="flex items-start gap-3 mb-2.5">
                {/* Number / check badge */}
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all duration-200"
                  style={
                    answered
                      ? { background: '#1e3a5f', color: 'white' }
                      : { background: '#f1f5f9', color: '#94a3b8' }
                  }
                >
                  {answered ? <CheckCircle2 size={13} /> : i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-slate-800 leading-snug">{q.question}</p>
                  <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {q.category}
                  </span>
                </div>
              </div>
              <input
                type="text"
                value={answers[q.id] ?? ''}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                placeholder="Type your answer…"
                className="input-field text-sm"
                autoComplete="off"
              />
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <button onClick={handleContinue} disabled={saving} className="btn-primary w-full">
        {saving
          ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
          : <><ArrowRight size={16} /> Generate Documents</>
        }
      </button>
      <button
        onClick={() => onSkip()}
        className="btn-ghost w-full mt-2 text-slate-400"
      >
        Skip remaining — generate now
      </button>

    </div>
  );
}
