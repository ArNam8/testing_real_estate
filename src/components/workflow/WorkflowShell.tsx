/**
 * WorkflowShell.tsx
 * Persistent wrapper around the four workflow stages. Renders the top bar
 * (address + exit button), the stage content, and the bottom progress bar.
 *
 * Error handling added: the X button now shows a confirmation dialog before
 * exiting during an active session so agents can't accidentally discard a
 * recording mid-walkthrough.
 */

import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { WorkflowStage } from '../../services/supabase';

interface WorkflowShellProps {
  address: string;
  stage: WorkflowStage;
  onExit: () => void;
  children: React.ReactNode;
  /** When true, the top bar and bottom progress bar hide so the document
   *  modal can occupy the entire screen with nothing underneath showing. */
  isModalOpen?: boolean;
}

/** Stages shown in the bottom progress bar, in order. */
const PROGRESS_STAGES: { id: WorkflowStage; label: string }[] = [
  { id: 'walkthrough', label: 'Record' },
  { id: 'outputs',    label: 'Outputs' },
  { id: 'followup',  label: 'Follow-up' },
  { id: 'photos',    label: 'Photos' },
  { id: 'generate',  label: 'Generate' },
];

/**
 * Stages where exiting without a warning could lose real work.
 * On these stages the X button shows a confirmation modal first.
 */
const STAGES_REQUIRING_CONFIRM: WorkflowStage[] = ['walkthrough', 'outputs', 'followup', 'photos'];

// ─── Confirmation modal ───────────────────────────────────────────────────────

/**
 * Small inline modal asking the user to confirm they want to exit.
 * Shown only on stages where data could be lost.
 */
function ExitConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm mx-4 animate-slide-up shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-amber-500" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-base">Exit walkthrough?</p>
            <p className="text-slate-500 text-xs mt-0.5">Your progress will be saved but the recording may be lost.</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="btn-secondary flex-1">
            Keep going
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-5 py-3 rounded-2xl text-sm font-semibold text-white
              flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' }}
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkflowShell({ address, stage, onExit, children, isModalOpen = false }: WorkflowShellProps) {
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const currentIndex = PROGRESS_STAGES.findIndex((s) => s.id === stage);
  const requiresConfirm = STAGES_REQUIRING_CONFIRM.includes(stage);

  /** Handle the X tap — ask for confirmation on sensitive stages. */
  const handleExitTap = () => {
    if (requiresConfirm) {
      setShowExitConfirm(true);
    } else {
      onExit();
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#F5F4F0' }}>

      {/* ── Top bar ── */}
      <div className={`top-bar transition-opacity duration-200 ${isModalOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <div className="top-bar-inner">
          <button
            onClick={handleExitTap}
            className="p-2 -ml-2 rounded-lg text-slate-400 hover:text-slate-600 active:bg-slate-100 transition-colors"
            aria-label="Exit walkthrough"
          >
            <X size={20} />
          </button>
          <div className="text-center min-w-0 flex-1 px-2">
            <p className="text-sm font-semibold text-slate-900 truncate">{address}</p>
          </div>
          {/* Spacer keeps address centred */}
          <div className="w-10" />
        </div>
      </div>

      {/* ── Stage content ── */}
      <div className="mt-topbar page-content pt-4 pb-32 animate-fade-in">
        {children}
      </div>

      {/* ── Bottom progress bar ── */}
      <div className={`progress-bar-bottom transition-opacity duration-200 ${isModalOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <div className="px-5 py-3 max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-0">
            {PROGRESS_STAGES.map((s, i) => {
              const isComplete = i < currentIndex;
              const isCurrent  = i === currentIndex;
              const isLast     = i === PROGRESS_STAGES.length - 1;
              return (
                <div key={s.id} className="flex items-center">
                  {/* Step pip + label */}
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="transition-all duration-500 ease-out flex items-center justify-center"
                      style={{
                        width:  isCurrent ? 28 : 20,
                        height: isCurrent ? 28 : 20,
                        borderRadius: '50%',
                        background: isComplete
                          ? '#1e3a5f'
                          : isCurrent
                          ? 'linear-gradient(135deg, #1e3a5f 0%, #0f2740 100%)'
                          : 'rgba(226,220,210,0.6)',
                        boxShadow: isCurrent ? '0 2px 8px rgba(30,58,95,0.25)' : 'none',
                      }}
                    >
                      {isComplete ? (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <span style={{
                          fontSize: isCurrent ? 11 : 9,
                          fontWeight: 700,
                          color: isCurrent ? 'white' : 'rgba(154,148,136,0.8)',
                          lineHeight: 1,
                        }}>{i + 1}</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 9,
                      fontWeight: isCurrent ? 700 : 500,
                      color: isComplete || isCurrent ? '#1e3a5f' : 'rgba(154,148,136,0.7)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      transition: 'color 0.3s',
                    }}>{s.label}</span>
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div style={{
                      width: 32,
                      height: 1.5,
                      margin: '0 4px',
                      marginBottom: 16,
                      borderRadius: 2,
                      background: isComplete
                        ? '#1e3a5f'
                        : 'rgba(226,220,210,0.6)',
                      transition: 'background 0.5s',
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Exit confirmation modal ── */}
      {showExitConfirm && (
        <ExitConfirmModal
          onConfirm={() => { setShowExitConfirm(false); onExit(); }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </div>
  );
}
