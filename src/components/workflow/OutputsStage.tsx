/**
 * OutputsStage.tsx
 * Lets the user choose which documents to generate from their walkthrough.
 * Defaults to listing_pack + client_summary. Requires at least one selection.
 *
 * Error handling: if the DB update fails, the workflow still advances —
 * the selection is not lost, it just wasn't persisted. A visible error
 * banner informs the user so they're not confused.
 */

import { useState, useCallback } from 'react';
import {
  ChevronLeft, CheckCircle2, ArrowRight,
  FileText, ClipboardList, Users, DollarSign,
  ListChecks, ShieldAlert, AlertCircle,
} from 'lucide-react';
import { propertiesService, OUTPUT_DEFINITIONS, DEFAULT_OUTPUTS } from '../../services/supabase';
import type { OutputType } from '../../services/supabase';

interface OutputsStageProps {
  propertyId: string;
  initialSelected: OutputType[];
  onComplete: (outputs: OutputType[]) => void;
  onBack: () => void;
  /**
   * Status of the background generate pipeline (Pass 1 extraction + first
   * Pass 2 draft + generate-followups trigger), tracked by App.tsx since
   * the moment recording finished.
   *  - 'pending': still running — show an honest "still analysing" note
   *    so the wait on FollowUpStage doesn't feel unexpected
   *  - 'ready' / 'failed': already resolved, nothing to mention here
   */
  followUpsStatus?: 'pending' | 'ready' | 'failed';
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Icon component for each output type. */
const OUTPUT_ICONS: Record<OutputType, typeof FileText> = {
  listing_pack:         FileText,
  inspection_notes:     ClipboardList,
  client_summary:       Users,
  offer_summary:        DollarSign,
  transaction_timeline: ListChecks,
  disclosure_prep:      ShieldAlert,
};

/** Display order for output type cards. */
const OUTPUT_ORDER: OutputType[] = [
  'listing_pack',
  'inspection_notes',
  'client_summary',
  'offer_summary',
  'transaction_timeline',
  'disclosure_prep',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function OutputsStage({ propertyId, initialSelected, onComplete, onBack, followUpsStatus }: OutputsStageProps) {
  const [selected, setSelected] = useState<Set<OutputType>>(new Set(initialSelected));
  const [saving, setSaving] = useState(false);
  /** Non-null when the DB update fails — shown as a warning banner. */
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Toggle a single output type on or off. */
  const toggle = useCallback((id: OutputType) => {
    setSaveError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /**
   * Persist the selection and advance to the follow-up stage.
   * If the DB update fails we still advance — the selection is held in
   * memory and passed through to GenerateStage via App.tsx session state.
   * The user sees a warning so they know the save didn't persist.
   */
  const handleContinue = useCallback(async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await propertiesService.update(propertyId, {
        selected_outputs: Array.from(selected),
        workflow_stage: 'followup',
      });
    } catch (err) {
      // Non-fatal — show a warning but still advance
      const msg = err instanceof Error ? err.message : 'Could not save selection.';
      setSaveError(`Selection saved locally but not to the server (${msg}). You can still continue.`);
    } finally {
      setSaving(false);
      onComplete(Array.from(selected));
    }
  }, [selected, propertyId, onComplete]);

  return (
    <div className="animate-fade-in">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: '#1a2e45' }}>Choose your documents</h1>
        <p className="text-sm" style={{ color: '#7a8899' }}>Select what you need — you can always download them later</p>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-amber-700 text-xs leading-relaxed">{saveError}</p>
        </div>
      )}

      {/* Output type cards */}
      <div className="space-y-2 mb-6">
        {OUTPUT_ORDER.map((id) => {
          const Icon      = OUTPUT_ICONS[id];
          const def       = OUTPUT_DEFINITIONS[id];
          const isSelected = selected.has(id);
          const isDefault  = DEFAULT_OUTPUTS.includes(id);

          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className="w-full text-left transition-all duration-200 rounded-2xl flex items-center gap-3"
              style={isSelected ? {
                background: '#1e3a5f',
                boxShadow: '0 4px 16px rgba(15,39,64,0.22)',
                padding: '14px 16px',
                border: 'none',
              } : {
                background: 'white',
                border: '1.5px solid rgba(226,220,210,0.9)',
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(30,20,10,0.05)',
              }}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} ${def.label}`}
            >
              {/* Icon container */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                style={isSelected ? { background: 'rgba(255,255,255,0.15)' } : { background: 'rgba(226,220,210,0.45)' }}
              >
                <Icon size={18} style={{ color: isSelected ? 'white' : '#9a9488' }} />
              </div>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm" style={{ color: isSelected ? 'white' : '#1a2e45' }}>
                    {def.label}
                  </p>
                  {isDefault && !isSelected && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(226,220,210,0.6)', color: '#9a9488' }}>
                      DEFAULT
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: isSelected ? 'rgba(255,255,255,0.6)' : '#9a9488' }}>
                  {def.description}
                </p>
              </div>

              {/* Selected = filled checkmark, unselected = empty circle */}
              {isSelected
                ? <CheckCircle2 size={20} className="flex-shrink-0" style={{ color: 'rgba(255,255,255,0.9)' }} />
                : <div className="w-5 h-5 rounded-full border-2 flex-shrink-0" style={{ borderColor: 'rgba(200,195,185,0.8)' }} />
              }
            </button>
          );
        })}
      </div>

      {/* Validation hint */}
      {selected.size === 0 && (
        <p className="text-amber-600 text-xs text-center mb-4">
          Select at least one output to continue
        </p>
      )}

      {/* Pipeline-still-running note — sets expectations for the next
          screen without blocking Continue. Purely informational; the
          user can proceed immediately either way. */}
      {followUpsStatus === 'pending' && (
        <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
          <AlertCircle size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-slate-500 text-xs leading-relaxed">
            Still analysing your walkthrough — the next screen may take a little while to prepare your questions.
          </p>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={selected.size === 0 || saving}
        className="btn-primary w-full"
      >
        {saving ? 'Saving…' : <>Continue <ArrowRight size={16} /></>}
      </button>
      <button onClick={onBack} className="btn-ghost w-full mt-2">
        <ChevronLeft size={16} /> Back
      </button>
    </div>
  );
}
