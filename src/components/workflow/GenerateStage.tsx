/**
 * GenerateStage.tsx
 * Triggers Pass 2 (document generation) and displays generated documents.
 *
 * Handles three response shapes from the edge function:
 *   1. Success      — generated documents ready to display in a file-browser layout
 *   2. sparse_audio — recording was thin; shows a manual fill-in form,
 *                     then re-runs generation with the user's extra data
 *   3. Error        — clear message with retry / re-record options
 *
 * Loading UX:
 *   - Rotating, friendly status messages (purely cosmetic) so the wait
 *     doesn't feel like a frozen spinner.
 *   - If the edge function is silently retrying a Gemini rate limit, the
 *     property's pipeline_status flips to 'retrying_extraction' /
 *     'retrying_generation' — this stage polls that field and shows a
 *     "Retrying..." message instead of the generic rotating messages.
 *
 * Pipeline reuse:
 *   - If a first-draft result from the background pipeline call (fired
 *     right after upload) is available, has no save warning/sparse flag,
 *     and the user didn't change outputs or answer follow-ups, it's shown
 *     immediately without a second Gemini call.
 *
 * Success layout:
 *   - File-browser style: each document is a card in a vertical list.
 *   - Clicking "Open" expands the document inline (accordion, one at a time).
 *   - "Download .docx" saves the individual document as a Word file.
 *   - "Download all" saves every document as a separate .docx Word file.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  CheckCircle2, AlertCircle, RefreshCw,
  ChevronLeft, ClipboardList, AlertTriangle, ShieldCheck,
  Download, Maximize2, Lock,
} from 'lucide-react';
import { propertiesService, OUTPUT_DEFINITIONS, DEFAULT_OUTPUTS, getDocumentSignedUrl } from '../../services/supabase';
import type { Property, OutputType, GeneratedContent, PipelineStatus } from '../../services/supabase';
import { DocViewer } from './DocViewer';
import { PropertyDatabase } from './PropertyDatabase';
import JSZip from 'jszip';

interface GenerateStageProps {
  propertyId: string;
  audioPath: string;
  /** Testing-only text walkthrough retained for a resumed Pass 1 call. */
  walkthroughText?: string | null;
  selectedOutputs: OutputType[];
  /**
   * Answers from FollowUpStage, passed in-memory so we don't need an extra
   * DB fetch. Forwarded to the edge function as confirmed facts for Pass 2.
   */
  followUpAnswers: Record<string, string>;
  /**
   * First-draft result from the background pipeline call fired right after
   * upload (Pass 1 + a default-output Pass 2), if it completed in time.
   * Reused as-is when nothing the user did since then would change the
   * output (same outputs, no follow-up answers, not sparse/errored).
   */
  pipelineResult: (GeneratedContent & Record<string, unknown>) | null;
  /**
   * True when this component is opened from handleViewProperty (i.e. the
   * user is reopening a previously completed property from the home screen).
   *
   * When true, Case 2's DB-load short-circuit fires regardless of whether
   * followUpAnswers is non-empty — because for a reopened property, the
   * follow-up answers in session state reflect what was recorded during the
   * original workflow run, not answers being contributed right now. This
   * prevents Case 3's runAnalysis() from firing against audio that has
   * already been deleted from storage.
   *
   * If Case 2 is reached with isReopening=true but the property is somehow
   * not 'completed', the component fails gracefully with an error state
   * rather than attempting runAnalysis() (which would fail: no audio).
   */
  isReopening?: boolean;
  onComplete: () => void;
  /** Opens the agent-owned Home Launch Plan after documents are available. */
  onOpenLaunchPlan?: (propertyId: string) => void;
  onRetry: () => void;
  /** Called with true when a document modal opens, false when it closes.
   *  Lets the parent (App) hide WorkflowShell bars so modal is top layer. */
  onModalChange?: (open: boolean) => void;
}

/** Shape of the sparse_audio response from the edge function. */
interface SparseAudioPayload {
  sparse_audio: true;
  captured_rooms: string[];
  captured_details: string;
  missing_fields: string[];
  message: string;
}

// ─── Rotating status messages ─────────────────────────────────────────────────

/**
 * Friendly, purely-cosmetic loading messages. Rotated every few seconds so
 * the wait (20-40s for Pass 2, longer if a rate-limit retry kicks in)
 * doesn't feel like a frozen spinner.
 */
const LOADING_MESSAGES = [
  'Pondering the details…',
  'Checking your notes…',
  'Organising the room-by-room…',
  'Drafting your documents…',
  'Polishing the wording…',
  'Double-checking the facts…',
  'Almost there…',
];

/** Rotate through LOADING_MESSAGES every `intervalMs`, looping forever. */
function useRotatingMessage(active: boolean, intervalMs = 3000): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % LOADING_MESSAGES.length), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return LOADING_MESSAGES[index];
}

// ─── Download helpers ─────────────────────────────────────────────────────────

/**
 * Triggers a browser download of a Blob with the given filename.
 * Uses a temporary <a> tag with an object URL, then cleans up.
 */
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Small delay before revoking so the download can start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}



// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Shown when the edge function returns sparse_audio: true.
 * Displays what was captured, lets the user fill in the missing fields,
 * then calls onFilled with their answers so generation can retry with
 * the extra context included in the prompt.
 */
function SparseAudioView({
  payload,
  onFilled,
  onReRecord,
}: {
  payload: SparseAudioPayload;
  onFilled: (manualData: Record<string, string>) => void;
  onReRecord: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>(
    Object.fromEntries(payload.missing_fields.map((f) => [f, '']))
  );

  /** Human-readable labels for the most common missing field keys. */
  const fieldLabels: Record<string, string> = {
    beds: 'Bedrooms',
    baths: 'Bathrooms',
    sqft: 'Square footage',
    year_built: 'Year built',
    condition: 'Overall condition',
    features: 'Key features',
    price_range: 'Price range',
  };

  const hasAnyFilled = Object.values(fields).some((v) => v.trim().length > 0);

  return (
    <div className="animate-fade-in">
      {/* Warning header */}
      <div className="flex items-start gap-3 mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200">
        <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 text-sm">Recording was brief</p>
          <p className="text-amber-700 text-xs mt-1 leading-relaxed">{payload.message}</p>
        </div>
      </div>

      {/* What was captured */}
      {(payload.captured_rooms.length > 0 || payload.captured_details) && (
        <div className="card p-4 mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            What we captured
          </p>
          {payload.captured_rooms.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {payload.captured_rooms.map((room) => (
                <span
                  key={room}
                  className="px-2 py-0.5 rounded-md text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200"
                >
                  {room}
                </span>
              ))}
            </div>
          )}
          {payload.captured_details && (
            <p className="text-sm text-slate-600 leading-relaxed">{payload.captured_details}</p>
          )}
        </div>
      )}

      {/* Manual fill-in form */}
      {payload.missing_fields.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Fill in the gaps
          </p>
          <div className="space-y-3">
            {payload.missing_fields.map((fieldKey) => (
              <div key={fieldKey}>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {fieldLabels[fieldKey] ?? fieldKey.replace(/_/g, ' ')}
                </label>
                <input
                  type="text"
                  value={fields[fieldKey] ?? ''}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [fieldKey]: e.target.value }))
                  }
                  placeholder={`Enter ${fieldLabels[fieldKey] ?? fieldKey}…`}
                  className="input-field text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={() => onFilled(fields)}
          disabled={!hasAnyFilled && payload.missing_fields.length > 0}
          className="btn-primary w-full"
        >
          <ClipboardList size={16} /> Generate with this information
        </button>
        <button onClick={onReRecord} className="btn-ghost w-full">
          Re-record walkthrough
        </button>
      </div>
    </div>
  );
}

// ─── Document card ─────────────────────────────────────────────────────────────

/**
 * A single document card in the file-browser list.
 * Shows the document name, description, Download and Open buttons.
 * Clicking "Open" expands the structured viewer inline (accordion).
 * Only one card is open at a time — controlled by parent via isOpen/onOpen.
 */
function DocumentCard({
  outputId,
  property,
  onOpen,
  manifestEntry,
  regenerationCount,
  onRegenerate,
  regenerating,
}: {
  outputId: OutputType;
  property: Property;
  onOpen: () => void;
  manifestEntry?: { status?: string; error?: string };
  regenerationCount: number;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const def = OUTPUT_DEFINITIONS[outputId];
  const hasFile = Boolean(property.document_paths?.[outputId]);
  const [downloading, setDownloading] = useState(false);

  /** Download this document from Supabase Storage — same file as the in-app viewer. */
  async function handleDownload() {
    const storagePath = property.document_paths?.[outputId];
    if (!storagePath) { alert('This document is not available yet. Try again or regenerate it if it is marked for update.'); return; }
    setDownloading(true);
    try {
      const url  = await getDocumentSignedUrl(storagePath);
      const res  = await fetch(url);
      const blob = await res.blob();
      const a    = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      a.href     = objectUrl;
      a.download = `${OUTPUT_DEFINITIONS[outputId].label}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      // BUGFIX: this previously only logged to console — the button reset
      // with no feedback, so a failed download looked identical to nothing
      // having happened.
      console.error('[DocumentCard] download error:', err);
      const msg = err instanceof Error ? err.message : 'Could not download this document. Please try again.';
      alert(msg);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="card overflow-hidden transition-all duration-200 hover:shadow-md">
      <div className="flex items-stretch">
        {/* Left colour accent bar */}
        <div className="w-1 flex-shrink-0 rounded-l-2xl" style={{ background: 'linear-gradient(180deg, #1e3a5f 0%, #0f2740 100%)' }} />
        <div className="flex-1 p-4 flex items-center gap-3 min-w-0">
          {/* Doc icon */}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(30,58,95,0.07)' }}>
            <ClipboardList size={16} style={{ color: '#1e3a5f' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-sm text-slate-900 leading-tight">{def.label}</p>{manifestEntry?.status === 'outdated' && <span className="badge badge-warning !px-2 !py-0.5">Updated info available</span>}</div>
            <p className="text-[11px] mt-0.5 leading-relaxed truncate" style={{ color: '#9a9488' }}>{manifestEntry?.status === 'failed' ? (manifestEntry.error ?? 'This document could not be stored.') : def.description}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Download — same style as Open button */}
            <button
              onClick={handleDownload}
              disabled={downloading || !hasFile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 disabled:opacity-50 active:scale-95"
              style={{ background: '#1e3a5f', color: 'white' }}
              title={`Download ${def.label}`}
            >
              <Download size={13} />
              <span>{downloading ? 'Saving…' : hasFile ? '.docx' : 'Unavailable'}</span>
            </button>
            {manifestEntry?.status === 'failed' && <span className="badge badge-warning !px-2 !py-0.5">Unavailable</span>}
            {manifestEntry?.status === 'outdated' && regenerationCount < 3 && <button onClick={onRegenerate} disabled={regenerating} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: '#6FAF9A', color: 'white' }}><RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />{regenerating ? 'Updating…' : `Update (${3 - regenerationCount})`}</button>}
            {manifestEntry?.status === 'outdated' && regenerationCount >= 3 && <span className="text-[10px] text-slate-400 whitespace-nowrap">Update limit reached</span>}
            {/* Open viewer */}
            <button
              onClick={onOpen}
              disabled={!hasFile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
              style={{ background: '#1e3a5f', color: 'white' }}
            >
              <Maximize2 size={12} /> Open
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────


// ─── Full-screen document modal ──────────────────────────────────────────────

/**
 * Full-screen overlay that renders the actual .docx file via mammoth.js.
 * Both the in-app view and the download button serve the same file from
 * Supabase Storage — one source of truth, zero drift.
 */
function DocumentModal({
  outputId,
  property,
  onClose,
}: {
  outputId: OutputType;
  property: Property;
  onClose: () => void;
}) {
  const def         = OUTPUT_DEFINITIONS[outputId];
  const storagePath = property.document_paths?.[outputId] ?? null;
  const [downloading, setDownloading] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleDownload() {
    if (!storagePath) return;
    setDownloading(true);
    try {
      const url  = await getDocumentSignedUrl(storagePath);
      const res  = await fetch(url);
      const blob = await res.blob();
      const a    = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      a.href     = objectUrl;
      a.download = `${def.label}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      // BUGFIX: this previously only logged to console — same silent-failure
      // issue as DocumentCard's download handler above.
      console.error('[DocumentModal] download error:', err);
      const msg = err instanceof Error ? err.message : 'Could not download this document. Please try again.';
      alert(msg);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-5 animate-doc-backdrop"
      style={{ background: 'rgba(10, 26, 47, 0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-white rounded-2xl overflow-hidden w-full h-full animate-doc-panel"
        style={{
          maxWidth: '900px',
          maxHeight: '100%',
          boxShadow: '0 40px 100px rgba(10, 26, 47, 0.5), 0 0 0 1px rgba(255,255,255,0.06)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center gap-3 px-5 py-3.5 flex-shrink-0" style={{ background: '#0f2740' }}>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors flex-shrink-0"
            aria-label="Close document viewer"
          >
            <ChevronLeft size={14} /> Back
          </button>
          <div className="flex-1 min-w-0 text-center">
            <p className="font-semibold text-white text-sm leading-tight truncate">{def.label}</p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{property.address}</p>
          </div>
          <span
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex-shrink-0 select-none"
            style={{ background: 'rgba(111,175,154,0.18)', color: '#6FAF9A', border: '1px solid rgba(111,175,154,0.3)' }}
          >
            <Lock size={10} /> View only
          </span>
          {storagePath && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <Download size={13} />
              <span className="hidden sm:inline">{downloading ? 'Preparing…' : 'Download .docx'}</span>
              <span className="sm:hidden">{downloading ? '…' : '.docx'}</span>
            </button>
          )}
        </div>

        {/* Hint bar */}
        <div className="flex items-center justify-center py-1.5 bg-slate-50 border-b border-slate-100 flex-shrink-0">
          <p className="text-[10px] text-slate-400 select-none">
            Tap outside or press Esc to close · Download .docx to edit
          </p>
        </div>

        {/* Document content — DocViewer renders the actual .docx via mammoth */}
        <div className="flex-1 overflow-y-auto" style={{ background: '#FAFAF8', padding: '24px 32px' }}>
          {storagePath ? (
            <DocViewer storagePath={storagePath} docLabel={def.label} brand={property.document_brand} />
          ) : (
            <p className="text-slate-400 text-sm italic py-8 text-center">
              Document file not yet available. Try refreshing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function GenerateStage({
  propertyId,
  audioPath,
  walkthroughText,
  selectedOutputs,
  followUpAnswers,
  pipelineResult,
  isReopening = false,
  onComplete,
  onOpenLaunchPlan,
  onRetry,
  onModalChange,
}: GenerateStageProps) {
  const [phase, setPhase] = useState<'loading' | 'sparse' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [property, setProperty] = useState<Property | null>(null);
  const [sparsePayload, setSparsePayload] = useState<SparseAudioPayload | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [audioDeleted, setAudioDeleted] = useState(false);
  /**
   * The outputId of whichever document card is currently expanded (open).
   * null means all cards are collapsed.
   */
  /** Which document is currently open in the full-screen modal. Null = closed. */
  const [openModalId, setOpenModalId] = useState<OutputType | null>(null);

  /** Open the full-screen modal for a document. Notifies parent to hide shell bars. */
  const handleOpenModal = useCallback((outputId: OutputType) => {
    setOpenModalId(outputId);
    onModalChange?.(true);
  }, [onModalChange]);
  const [retrying, setRetrying] = useState(false);
  /**
   * Whether a Gemini rate-limit retry is in progress (pipeline_status is
   * 'retrying_extraction' or 'retrying_generation'). When true we show a
   * "Retrying…" badge instead of the rotating status messages.
   */
  const [isRateLimitRetrying, setIsRateLimitRetrying] = useState(false);
  const [showPropertyDatabase, setShowPropertyDatabase] = useState(false);
  const [regeneratingOutput, setRegeneratingOutput] = useState<OutputType | null>(null);
  const [regenerationError, setRegenerationError] = useState<string | null>(null);
  const [downloadSummary, setDownloadSummary] = useState<{ included: number; requested: number } | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const rotatingMessage = useRotatingMessage(phase === 'loading' && !isRateLimitRetrying);

  /** Only documents with a non-empty stored path can be included in a ZIP.
   * Failed manifest entries remain visible separately but never count as ready. */
  const storedOutputs: OutputType[] = useMemo(() => property
    ? Object.entries(property.document_paths ?? {})
        .filter(([, path]) => typeof path === 'string' && path.trim().length > 0)
        .map(([id]) => id)
        .filter((id): id is OutputType => id in OUTPUT_DEFINITIONS)
    : [], [property]);
  const failedOutputs: OutputType[] = useMemo(() => property
    ? Object.entries(property.document_manifest ?? {})
        .filter(([, entry]) => entry?.status === 'failed')
        .map(([id]) => id)
        .filter((id): id is OutputType => id in OUTPUT_DEFINITIONS && !property.document_paths?.[id])
    : [], [property]);

  /**
   * Poll the property's pipeline_status while loading so we can show
   * "Retrying…" if a Gemini rate-limit retry is in progress server-side.
   * Polls every 5 s and stops as soon as phase leaves 'loading'.
   */
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== 'loading') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }
    pollIntervalRef.current = setInterval(async () => {
      try {
        const prop = await propertiesService.getById(propertyId);
        const status = prop?.pipeline_status as PipelineStatus | undefined;
        setIsRateLimitRetrying(
          status === 'retrying_extraction' || status === 'retrying_generation'
        );
      } catch {
        // Non-fatal — polling failure doesn't affect the main flow
      }
    }, 5000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [phase, propertyId]);

  /**
   * Apply a result received from either the background pipeline call
   * (pipelineResult) or a fresh analyze() call. Returns true if a
   * non-sparse, non-error result was applied and phase can go to 'success'.
   */
  const applyResult = useCallback(async (
    result: GeneratedContent & Record<string, unknown>
  ): Promise<boolean> => {
    // Sparse-audio signal — show the fill-in form
    if ((result as unknown as SparseAudioPayload).sparse_audio === true) {
      setSparsePayload(result as unknown as SparseAudioPayload);
      setPhase('sparse');
      return false;
    }

    // Save warning (documents generated but DB write failed)
    if (typeof result._save_warning === 'string') {
      setSaveWarning(result._save_warning);
    }

    // Audio-deleted confirmation
    if (result._audio_deleted === true) {
      setAudioDeleted(true);
    }

    // Fetch updated property to display documents from DB
    const prop = await propertiesService.getById(propertyId);
    setProperty(prop);
    setPhase('success');
    return true;
  }, [propertyId]);

  /**
   * Run Pass 2 (or Pass 1 + 2 if this is the first call for this property).
   * Accepts optional manualData from the sparse fill-in form.
   */
  const runAnalysis = useCallback(async (sparseManualData?: Record<string, string>) => {
    try {
      const hasFollowUpAnswers = Object.keys(followUpAnswers).length > 0;

      const result = await propertiesService.analyze(
        propertyId,
        audioPath,
        selectedOutputs,
        hasFollowUpAnswers ? followUpAnswers : undefined,
        sparseManualData,
        undefined,
        walkthroughText ?? undefined,
      );

      await applyResult(result as GeneratedContent & Record<string, unknown>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
      setErrorMessage(msg);
      setPhase('error');
    }
  }, [propertyId, audioPath, walkthroughText, selectedOutputs, followUpAnswers, applyResult]);

  /**
   * On mount, decide whether to reuse the background pipeline result or
   * run a fresh analyze() call.
   *
   * Reuse pipelineResult when ALL of the following are true:
   *  - pipelineResult is non-null
   *  - it has no sparse_audio flag (would need the fill-in form)
   *  - it has no _save_warning (DB write failed — must retry)
   *  - the user didn't change outputs from the defaults (Pass 2 ran with defaults)
   *  - the user has no follow-up answers to contribute
   *
   * In all other cases call analyze() fresh. Since extraction_data was
   * persisted by the background call (Pass 1), analyze() will skip Pass 1
   * and run only Pass 2 (much faster).
   */
  useEffect(() => {
    const init = async () => {
      // ── Case 1: Reuse in-memory pipeline result ──────────────────────────
      const hasFollowUpAnswers = Object.keys(followUpAnswers).length > 0;
      const outputsMatchDefault =
        selectedOutputs.length === DEFAULT_OUTPUTS.length &&
        selectedOutputs.every((o) => DEFAULT_OUTPUTS.includes(o));

      const canReusePipelineResult =
        pipelineResult !== null &&
        !(pipelineResult as unknown as SparseAudioPayload).sparse_audio &&
        !pipelineResult._save_warning &&
        outputsMatchDefault &&
        !hasFollowUpAnswers;

      if (canReusePipelineResult) {
        applyResult(pipelineResult!).catch(() => runAnalysis());
        return;
      }

      // ── Case 2: Already completed — load from DB, skip re-running Gemini ─
      // IMPORTANT: only short-circuit here when either:
      //   (a) the user has NO follow-up answers — prevents serving the stale
      //       first-draft result when new answers need to be merged in, OR
      //   (b) isReopening is true — the user is viewing a previously completed
      //       property from the home screen. In this case, followUpAnswers in
      //       session state reflect the original run, not new answers being
      //       contributed now, so we must skip Case 3's runAnalysis() (which
      //       would fail because the audio has already been deleted).
      //
      // When isReopening is true and the property is unexpectedly NOT
      // 'completed' (edge case), we fail gracefully with an error rather than
      // falling through to Case 3 (which would crash: no audio in storage).
      if (!hasFollowUpAnswers || isReopening) {
        try {
          const prop = await propertiesService.getById(propertyId);
          if (prop.status === 'completed') {
            if (prop.audio_deleted) setAudioDeleted(true);
            setProperty(prop);
            setPhase('success');
            return;
          }
          // isReopening but property is not 'completed' — fail gracefully
          if (isReopening) {
            setErrorMessage(
              "This property's documents could not be loaded. The property may still be processing. Please return to the home screen and try again shortly."
            );
            setPhase('error');
            return;
          }
        } catch {
          // Non-fatal for normal flow — fall through to fresh generation.
          // For isReopening, also fail gracefully (no audio to re-run with).
          if (isReopening) {
            setErrorMessage(
              "Could not load this property's documents. Please return to the home screen and try again."
            );
            setPhase('error');
            return;
          }
        }
      }

      // ── Case 3: Fresh generation needed ─────────────────────────────────
      if (!audioPath && !walkthroughText?.trim()) {
        setErrorMessage('No walkthrough input found. Please return and paste the walkthrough again.');
        setPhase('error');
        return;
      }

      runAnalysis();
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Retry after an error — reset state and call analyze() again. */
  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setErrorMessage('');
    setIsRateLimitRetrying(false);
    setPhase('loading');
    try {
      await runAnalysis();
    } finally {
      setRetrying(false);
    }
  }, [runAnalysis]);

  /**
   * Called by SparseAudioView when the user submits their manual fill-in
   * data. Passes it to runAnalysis as manualData so Pass 2 can use it.
   */
  const handleSparseDataFilled = useCallback((manualData: Record<string, string>) => {
    setPhase('loading');
    runAnalysis(manualData);
  }, [runAnalysis]);

  const handleRegenerate = useCallback(async (outputId: OutputType) => {
    if (!property) return;
    const count = Number(property.document_regeneration_counts?.[outputId] ?? 0);
    if (count >= 3) return;
    setRegeneratingOutput(outputId); setRegenerationError(null);
    try {
      const result = await propertiesService.regenerateDocument(propertyId, outputId);
      const next = await propertiesService.getById(propertyId);
      setProperty(next);
      if (result.document_manifest) setProperty(next);
    } catch (err) {
      setRegenerationError(err instanceof Error ? err.message : 'Could not update this document.');
    } finally { setRegeneratingOutput(null); }
  }, [property, propertyId]);

  /**
   * Download all generated documents as a single .zip file.
   * Fetches each .docx from Supabase Storage in parallel, bundles into a zip.
   */
  const handleDownloadAll = useCallback(async () => {
    if (!property) return;
    const address     = property.address ?? 'Property';
    const docPaths    = property.document_paths ?? {};
    const zip         = new JSZip();
    // BUGFIX: previously any per-document fetch failure was only logged to
    // console and silently dropped — if every document failed (or none had
    // a storagePath yet), the code would still generate and download an
    // empty, useless .zip file with no explanation. Now failures are
    // tracked so we can warn the user instead of handing them a silent
    // empty (or partial) download.
    const failed: string[] = [];

    await Promise.all(
      storedOutputs.map(async (outputId) => {
        const storagePath = docPaths[outputId];
        if (!storagePath) {
          failed.push(OUTPUT_DEFINITIONS[outputId].label);
          return;
        }
        try {
          const url      = await getDocumentSignedUrl(storagePath);
          const res      = await fetch(url);
          if (!res.ok) throw new Error(`Document download returned ${res.status}`);
          const blob     = await res.blob();
          const filename = `${OUTPUT_DEFINITIONS[outputId].label}.docx`;
          zip.file(filename, blob);
        } catch (err) {
          console.error(`[downloadAll] failed to fetch ${outputId}:`, err);
          failed.push(OUTPUT_DEFINITIONS[outputId].label);
        }
      })
    );

    const included = Object.keys(zip.files).length;
    setDownloadSummary({ included, requested: storedOutputs.length });
    if (included === 0) {
      alert('Could not download any documents. Please check your connection and try again.');
      return;
    }

    const zipBlob    = await zip.generateAsync({ type: 'blob' });
    const safeAddr   = address.replace(/[/\\:*?"<>|]/g, '').trim();
    downloadBlob(`${safeAddr} - Documents.zip`, zipBlob);

    if (failed.length > 0) {
      alert(`Downloaded ${included} of ${storedOutputs.length} documents. The following document(s) could not be included: ${failed.join(', ')}. You can try downloading them individually.`);
    };

  }, [property, storedOutputs]);

  /**
   * Toggle a document card open/closed.
   * Opening a card that's already open closes it; opening a different one
   * closes the current one first (one open at a time).
   */


  // ── Loading ──────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
          <div
            className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
            style={{ borderTopColor: '#1e3a5f' }}
          />
          <div
            className="absolute inset-4 rounded-full flex items-center justify-center"
            style={{ background: '#e8eef5' }}
          >
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: '#1e3a5f' }} />
          </div>
        </div>
        {isRateLimitRetrying ? (
          <>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Taking longer than usual</h2>
            <p className="text-slate-500 text-sm text-center max-w-xs leading-relaxed">
              Google's AI service seems to be under heavier load than usual. We're retrying automatically — this should still complete, no action needed.
            </p>
          </>
        ) : isReopening ? (
          <>
            <h2 className="text-xl font-bold mb-1" style={{ color: '#1a2e45' }}>Retrieving documents</h2>
            <p className="text-slate-400 text-sm transition-all duration-500">Loading your previously generated documents…</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-1" style={{ color: '#1a2e45' }}>Generating documents</h2>
            <p className="text-slate-400 text-sm transition-all duration-500">{rotatingMessage}</p>
          </>
        )}
      </div>
    );
  }

  // ── Sparse audio ─────────────────────────────────────────────────────────
  if (phase === 'sparse' && sparsePayload) {
    return (
      <SparseAudioView
        payload={sparsePayload}
        onFilled={handleSparseDataFilled}
        onReRecord={onRetry}
      />
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={28} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Generation failed</h2>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">{errorMessage}</p>
        <div className="space-y-2">
          <button onClick={handleRetry} disabled={retrying} className="btn-primary w-full">
            <RefreshCw size={16} /> {retrying ? 'Retrying…' : 'Try again'}
          </button>
          <button onClick={onRetry} className="btn-ghost w-full">
            Re-record walkthrough
          </button>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (phase !== 'success' || !property) return null;

  return (
    <div className="animate-fade-in">
      {/* Save warning banner */}
      {saveWarning && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-amber-700 text-xs leading-relaxed">{saveWarning}</p>
        </div>
      )}

      {/* Audio-deleted privacy note */}
      {audioDeleted && (
        <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
          <ShieldCheck size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-slate-500 text-xs leading-relaxed">
            Your audio recording has been deleted from our servers. Only the generated documents are kept.
          </p>
        </div>
      )}

      {/* Success header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(111,175,154,0.12)' }}>
            <CheckCircle2 size={20} className="text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold" style={{ color: '#1a2e45' }}>Documents ready</h2>
            <p className="text-slate-500 text-xs">
              {storedOutputs.length} document{storedOutputs.length === 1 ? '' : 's'} ready
            </p>
          </div>
        </div>

        {/* Download all button */}
        <button
          onClick={async () => { setDownloadingAll(true); try { await handleDownloadAll(); } finally { setDownloadingAll(false); } }}
          disabled={storedOutputs.length === 0 || downloadingAll}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-95 disabled:opacity-50"
          style={{ background: '#1e3a5f', color: 'white', boxShadow: '0 2px 8px rgba(15,39,64,0.2)' }}
        >
          <Download size={14} /> {downloadingAll ? 'Preparing…' : downloadSummary ? `Downloaded ${downloadSummary.included} of ${downloadSummary.requested}` : `Download all (${storedOutputs.length})`}
        </button>
      </div>

      {/* Optional Property Database — intentionally below the first reward and above documents. */}
      <div className="mb-5">
        <button onClick={() => setShowPropertyDatabase((open) => !open)} className="card w-full p-4 flex items-center justify-between gap-3 text-left">
          <div><p className="font-semibold text-sm" style={{ color: '#1a2e45' }}>Review Property Facts &amp; Sources</p><p className="text-xs mt-0.5 text-slate-400">Optional — edit a fact only if something needs correcting</p></div>
          <ChevronLeft size={17} className={showPropertyDatabase ? 'rotate-90 text-slate-400' : 'rotate-180 text-slate-400'} />
        </button>
      </div>
      {showPropertyDatabase && <PropertyDatabase property={property} onSaved={setProperty} onClose={() => setShowPropertyDatabase(false)} />}
      {regenerationError && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2"><AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" /><p className="text-red-700 text-xs leading-relaxed">{regenerationError}</p></div>}

      {/* Document list — only stored files count as ready/downloadable. */}
      <div className="space-y-3">
        {storedOutputs.map((outputId) => (
          <DocumentCard
            key={outputId}
            outputId={outputId}
            property={property}
            manifestEntry={property.document_manifest?.[outputId]}
            regenerationCount={Number(property.document_regeneration_counts?.[outputId] ?? 0)}
            regenerating={regeneratingOutput === outputId}
            onRegenerate={() => handleRegenerate(outputId)}
            onOpen={() => handleOpenModal(outputId)}
          />
        ))}
        {failedOutputs.map((outputId) => (
          <DocumentCard
            key={`failed-${outputId}`}
            outputId={outputId}
            property={property}
            manifestEntry={property.document_manifest?.[outputId]}
            regenerationCount={Number(property.document_regeneration_counts?.[outputId] ?? 0)}
            regenerating={false}
            onRegenerate={() => undefined}
            onOpen={() => undefined}
          />
        ))}
      </div>

      {/* Documents are the complete end of the five-step workflow. This is a
          deliberate, optional next job—not a sixth required workflow step. */}
      {onOpenLaunchPlan && (
        <button
          onClick={() => onOpenLaunchPlan(property.id)}
          className="w-full mt-7 rounded-3xl p-6 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-5 transition-transform duration-200 active:scale-[0.985]"
          style={{ background: 'linear-gradient(135deg, #E6F2EA, #F4FAF6)', border: '1px solid rgba(95,156,121,0.38)', boxShadow: '0 10px 24px rgba(50,104,81,0.10)' }}
        >
          <div><p className="font-bold text-xl" style={{ color: '#1E4D3A' }}>Now get the house ready</p><p className="text-sm mt-1.5 leading-relaxed max-w-xl" style={{ color: '#49735D' }}>Walkthrough will suggest the most useful seller tasks, proof to request, and questions to confirm. You decide what the seller sees.</p></div>
          <span className="flex-shrink-0 rounded-2xl px-5 py-3 text-sm font-bold text-white" style={{ background: '#326851' }}>Build plan</span>
        </button>
      )}

      {/* Footer */}
      <div className="mt-6">
        <button onClick={onComplete} className="btn-ghost w-full">
          <ChevronLeft size={16} /> Back to home
        </button>
      </div>

      {/* Full-screen document modal — portal-style, covers everything */}
      {openModalId && (
        <DocumentModal
          outputId={openModalId}
          property={property}
          onClose={() => { setOpenModalId(null); onModalChange?.(false); }}
        />
      )}
    </div>
  );
}
