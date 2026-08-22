/**
 * LoadingSpinner.tsx
 * Shared loading UI components used across the app.
 *
 * PageLoader — full-screen spinner shown while the auth session is resolving
 *              on first load (matches the app's light theme background).
 *
 * InlineSpinner — small inline spinner for use inside buttons or cards.
 */

/** Full-screen loading state shown while auth initialises. */
export function PageLoader() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#f8fafb' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading…</p>
      </div>
    </div>
  );
}

/** Small inline spinner for use within buttons, cards, or list items. */
export function InlineSpinner({ size = 16 }: { size?: number }) {
  return (
    <div
      className="rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin flex-shrink-0"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
