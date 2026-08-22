/**
 * AuthPage.tsx
 *
 * Exports AuthModal — slides up as a bottom-sheet over the landing page.
 * Called when user taps "Sign in" or "Get started" on the landing page.
 *
 * Props:
 *   initialMode — 'signin' | 'signup', sets the initial tab
 *   onClose     — dismiss the modal (tap backdrop or X)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, Eye, EyeOff, X } from 'lucide-react';
import { supabase } from '../../services/supabase';

type Mode = 'signin' | 'signup';

// ─── Shared form logic ────────────────────────────────────────────────────────

function useAuthForm(initialMode: Mode) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Mirrors `loading` but updates synchronously (ref writes aren't batched
   * the way state updates are), so a second tap landing before React has
   * re-rendered the disabled button is still blocked. This is what actually
   * stops the double-submit -> Supabase 429 issue: relying on `loading`
   * state alone leaves a brief window on fast double-taps where the button
   * hasn't visually/functionally disabled yet.
   */
  const submittingRef = useRef(false);

  // Sync if parent changes initialMode after mount
  useEffect(() => { setMode(initialMode); setError(''); }, [initialMode]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Hard guard against double-submission (double-click, double-tap,
    // or an Enter keypress racing a click). Bail out silently — the
    // first submission is already in flight.
    if (submittingRef.current) return;

    setError('');
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    submittingRef.current = true;
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(
        msg.includes('429') || msg.toLowerCase().includes('too many requests') ?
          'Too many attempts — please wait a moment and try again' :
        msg.includes('Invalid login')       ? 'Invalid email or password' :
        msg.includes('already registered')  ? 'An account with this email already exists' :
        msg.includes('Email not confirmed') ? 'Please check your email to confirm your account' :
        msg
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }, [mode, email, password]);

  return { mode, setMode, email, setEmail, password, setPassword, showPassword, setShowPassword, error, setError, loading, handleSubmit };
}

// ─── Auth form body ───────────────────────────────────────────────────────────

interface AuthFormProps {
  form: ReturnType<typeof useAuthForm>;
}

function AuthFormBody({ form }: AuthFormProps) {
  const { mode, setMode, email, setEmail, password, setPassword, showPassword, setShowPassword, error, setError, loading, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="auth-email" className="label">Email</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field"
          placeholder="you@company.com"
          autoComplete="email"
          autoFocus
          disabled={loading}
        />
      </div>
      <div>
        <label htmlFor="auth-password" className="label">Password</label>
        <div className="relative">
          <input
            id="auth-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field pr-12"
            placeholder="••••••••"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email.trim() || !password.trim()}
        aria-busy={loading}
        className="btn-primary w-full mt-2"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
          </span>
        ) : (
          mode === 'signin' ? 'Sign In' : 'Create Account'
        )}
      </button>

      <p className="text-center text-slate-500 text-sm pt-1">
        {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
          className="font-semibold transition-colors"
          style={{ color: '#1e3a5f' }}
        >
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </form>
  );
}

// ─── AuthModal — bottom sheet over landing page ───────────────────────────────

interface AuthModalProps {
  /** Which mode to open with — controlled by which button the user tapped. */
  initialMode: Mode;
  onClose: () => void;
}

/**
 * Bottom-sheet modal that slides up over the landing page.
 * Tapping the backdrop dismisses it.
 */
export function AuthModal({ initialMode, onClose }: AuthModalProps) {
  const form = useAuthForm(initialMode);

  // Prevent scroll on body while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative bg-white w-full max-w-sm mx-4 rounded-t-3xl sm:rounded-3xl p-6 pb-8 animate-slide-up shadow-2xl"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Drag handle (mobile) */}
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-5 sm:hidden" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2740 100%)' }}
          >
            <Mic size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm">Walkthrough AI</div>
            <div className="text-xs text-slate-400">
              {form.mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </div>
          </div>
        </div>

        <AuthFormBody form={form} />
      </div>
    </div>
  );
}


