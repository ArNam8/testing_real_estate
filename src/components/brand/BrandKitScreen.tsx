/**
 * BrandKitScreen.tsx
 * Full screen for creating/editing a user's Brand Kit: a brand name plus a
 * primary and secondary color, chosen from a fixed 30-color palette (no
 * logo yet — deliberately out of scope for this pass).
 *
 * Reached two ways:
 *   1. Once, automatically, right after onboarding (`isFirstRun` prop) —
 *      shows a prominent "Skip for now" option since the default look is a
 *      completely legitimate choice.
 *   2. Any time afterward from the HomeScreen "Brand Kit" card, to create
 *      one for the first time or edit an existing one.
 *
 * Unsaved changes: if you edit anything and then tap the back arrow
 * without saving, a confirmation sheet asks whether to discard those
 * changes or keep editing — mirrors the existing "Exit walkthrough?"
 * pattern in WorkflowShell.tsx for visual consistency.
 *
 * These colors are then used to style every generated document (see
 * supabase/functions/_shared/docBuilder.ts) and the in-app document
 * viewer (see DocViewer.tsx) in place of Walkthrough AI's own navy/sage.
 */

import { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, Check, Loader2, AlertCircle, Sparkles, RotateCcw, AlertTriangle } from 'lucide-react';
import { BRAND_PALETTE, DEFAULT_PRIMARY_KEY, DEFAULT_SECONDARY_KEY } from '../../utils/brandPalette';
import { brandKitService } from '../../services/supabase';
import type { BrandKit } from '../../services/supabase';

interface BrandKitScreenProps {
  userId: string;
  /** The user's existing Brand Kit, or null if they don't have one yet. */
  existingKit: BrandKit | null;
  /** True when shown automatically right after onboarding — changes copy/CTA. */
  isFirstRun?: boolean;
  /** Called after a successful save, with the new/updated Brand Kit. */
  onSaved: (kit: BrandKit) => void;
  /** Called when the user backs out without saving (or skips, on first run). */
  onBack: () => void;
}

const DEFAULT_BRAND_NAME = 'Walkthrough AI';

// ─── Swatch grid ──────────────────────────────────────────────────────────────

interface SwatchGridProps {
  selectedKey: string;
  onSelect: (key: string) => void;
  /** The other role's currently selected key — dimmed slightly so two
   *  identical swatches never look ambiguous about which role they're in. */
  disabledKey?: string;
}

function SwatchGrid({ selectedKey, onSelect, disabledKey }: SwatchGridProps) {
  return (
    <div className="grid grid-cols-6 gap-2.5">
      {BRAND_PALETTE.map((color) => {
        const isSelected = color.key === selectedKey;
        const isTakenByOther = color.key === disabledKey;
        return (
          <button
            key={color.key}
            type="button"
            onClick={() => onSelect(color.key)}
            aria-label={color.name}
            title={color.name}
            className="relative aspect-square rounded-xl transition-all duration-150 active:scale-90"
            style={{
              background: `#${color.hex}`,
              boxShadow: isSelected
                ? `0 0 0 2px white, 0 0 0 4px #${color.hex}, 0 4px 10px rgba(0,0,0,0.18)`
                : '0 1px 3px rgba(0,0,0,0.12)',
              opacity: isTakenByOther ? 0.55 : 1,
            }}
          >
            {isSelected && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Check size={16} className="text-white drop-shadow" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Live preview ─────────────────────────────────────────────────────────────

function BrandPreview({ brandName, primaryHex, secondaryHex }: {
  brandName: string;
  primaryHex: string;
  secondaryHex: string;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <div
        className="px-5 py-4"
        style={{ background: `#${primaryHex}`, borderBottom: `3px solid #${secondaryHex}` }}
      >
        <p className="text-white font-bold text-sm tracking-wide">PROPERTY LISTING PACK</p>
        <p className="text-xs mt-0.5" style={{ color: `#${secondaryHex}` }}>123 Maple Street</p>
      </div>
      <div className="bg-white px-5 py-4 space-y-2">
        <div className="h-2 rounded-full bg-slate-100 w-full" />
        <div className="h-2 rounded-full bg-slate-100 w-4/5" />
        <div className="flex items-center gap-2 pt-1">
          <span
            className="text-[10px] font-bold px-2 py-1 rounded-md tracking-wide"
            style={{ background: `#${secondaryHex}22`, color: `#${secondaryHex}` }}
          >
            GOOD
          </span>
          <span className="text-[11px] text-slate-400">Condition</span>
        </div>
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{brandName || 'Your Brand'}</span>
          <span className="text-[11px] text-slate-300">Page 1</span>
        </div>
      </div>
    </div>
  );
}

// ─── Discard-changes confirmation ───────────────────────────────────────────────
// Same visual language as WorkflowShell's "Exit walkthrough?" modal, so
// leave-without-saving confirmations feel consistent across the app.

function DiscardChangesModal({ onDiscard, onKeepEditing }: { onDiscard: () => void; onKeepEditing: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onKeepEditing} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm mx-4 animate-slide-up shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-amber-500" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-base">Discard changes?</p>
            <p className="text-slate-500 text-xs mt-0.5">Your brand name and colors haven't been saved yet.</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onKeepEditing} className="btn-secondary flex-1">
            Keep editing
          </button>
          <button
            onClick={onDiscard}
            className="flex-1 px-5 py-3 rounded-2xl text-sm font-semibold text-white
              flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' }}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function BrandKitScreen({ userId, existingKit, isFirstRun, onSaved, onBack }: BrandKitScreenProps) {
  // Baseline = what's actually saved right now (or the app's own defaults if
  // there's no Brand Kit yet). Used both to detect unsaved changes and as
  // the target for "Reset to default".
  const baseline = useMemo(() => ({
    brandName: existingKit?.brand_name ?? '',
    primaryKey: existingKit?.primary_color_key ?? DEFAULT_PRIMARY_KEY,
    secondaryKey: existingKit?.secondary_color_key ?? DEFAULT_SECONDARY_KEY,
  }), [existingKit]);

  const [brandName, setBrandName] = useState(baseline.brandName);
  const [primaryKey, setPrimaryKey] = useState(baseline.primaryKey);
  const [secondaryKey, setSecondaryKey] = useState(baseline.secondaryKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const isDirty =
    brandName !== baseline.brandName ||
    primaryKey !== baseline.primaryKey ||
    secondaryKey !== baseline.secondaryKey;

  const isAtDefault =
    brandName.trim() === '' &&
    primaryKey === DEFAULT_PRIMARY_KEY &&
    secondaryKey === DEFAULT_SECONDARY_KEY;

  const primaryHex = BRAND_PALETTE.find((c) => c.key === primaryKey)?.hex ?? '1E3A5F';
  const secondaryHex = BRAND_PALETTE.find((c) => c.key === secondaryKey)?.hex ?? '6FAF9A';

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const trimmedName = brandName.trim() || DEFAULT_BRAND_NAME;
      const kit = await brandKitService.save(userId, trimmedName, primaryKey, secondaryKey);
      onSaved(kit);
    } catch (err) {
      // Clear, human-readable error — never a silent failure or endless spinner.
      setError(err instanceof Error ? err.message : 'Something went wrong saving your Brand Kit. Please try again.');
      setSaving(false);
    }
  }, [userId, brandName, primaryKey, secondaryKey, onSaved]);

  /** Reset the form fields back to Walkthrough AI's own defaults — this is
   *  local only until "Save Brand Kit" is tapped, consistent with every
   *  other change on this screen. */
  const handleResetToDefault = useCallback(() => {
    setBrandName('');
    setPrimaryKey(DEFAULT_PRIMARY_KEY);
    setSecondaryKey(DEFAULT_SECONDARY_KEY);
    setError(null);
  }, []);

  /** Back arrow tapped — warn about unsaved changes rather than silently
   *  discarding them. */
  const handleBackPress = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onBack();
    }
  }, [isDirty, onBack]);

  return (
    <div className="min-h-screen" style={{ background: '#f8fafb' }}>
      {/* ── Top bar ── */}
      <div className="top-bar">
        <div className="top-bar-inner">
          <button
            onClick={handleBackPress}
            className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-700 active:bg-slate-100 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-base font-semibold text-slate-900 flex-1">Brand Kit</h1>
        </div>
      </div>

      <div className="mt-topbar page-content pt-6 pb-12">

        {isFirstRun && (
          <div className="flex items-center gap-2 mb-5 animate-fade-in">
            <Sparkles size={16} style={{ color: '#1e3a5f' }} />
            <p className="text-sm text-slate-500">
              Make every generated document feel like <span className="font-semibold text-slate-700">yours</span>.
            </p>
          </div>
        )}

        {/* Brand name */}
        <div className="mb-7">
          <label className="label" htmlFor="brand-name">Brand name</label>
          <input
            id="brand-name"
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="e.g. Smith Realty"
            maxLength={60}
            className="input-field"
          />
          <p className="text-xs text-slate-400 mt-2">
            Shown at the bottom of every generated document, in place of "Walkthrough AI".
          </p>
        </div>

        {/* Live preview */}
        <div className="mb-8">
          <p className="label">Preview</p>
          <BrandPreview brandName={brandName} primaryHex={primaryHex} secondaryHex={secondaryHex} />
        </div>

        {/* Primary color */}
        <div className="mb-7">
          <p className="label">Primary color</p>
          <SwatchGrid selectedKey={primaryKey} onSelect={setPrimaryKey} disabledKey={secondaryKey} />
        </div>

        {/* Secondary color */}
        <div className="mb-6">
          <p className="label">Secondary color</p>
          <SwatchGrid selectedKey={secondaryKey} onSelect={setSecondaryKey} disabledKey={primaryKey} />
        </div>

        {/* Reset to default — only shown once there's something to reset */}
        {!isAtDefault && (
          <button
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 text-sm font-medium mb-8 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RotateCcw size={14} />
            Reset to default
          </button>
        )}

        {/* Error message — clear and human-readable, never a silent failure */}
        {error && (
          <div className="flex items-start gap-2 mb-5 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fade-in">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full justify-center"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Saving...
              </>
            ) : (
              'Save Brand Kit'
            )}
          </button>

          {isFirstRun && (
            <button
              onClick={onBack}
              disabled={saving}
              className="btn-ghost w-full"
            >
              Skip for now, use default
            </button>
          )}
        </div>
      </div>

      {showDiscardConfirm && (
        <DiscardChangesModal
          onKeepEditing={() => setShowDiscardConfirm(false)}
          onDiscard={() => {
            setShowDiscardConfirm(false);
            onBack();
          }}
        />
      )}
    </div>
  );
}
