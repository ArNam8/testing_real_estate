/**
 * TextWalkthroughStage.tsx
 * QA-only replacement for the microphone recorder.
 *
 * It lets a tester paste a realistic walkthrough transcript/notes, then sends
 * that text through the same outputs → follow-ups → photos → documents flow.
 */

import { useState } from 'react';
import { AlertCircle, ClipboardPaste, FileText, Sparkles } from 'lucide-react';

interface TextWalkthroughStageProps {
  address: string;
  onComplete: (walkthroughText: string, durationSec: number) => void;
  onCancel: () => void;
}

const SAMPLE_WALKTHROUGH = `Entry hall with original oak flooring and a bright south-facing window. The seller said the roof was replaced around 2022, but I have not verified that.

Kitchen has quartz counters, a gas range, and new cabinet fronts. The seller believes the plumbing was updated during the renovation. The room feels spacious.

Primary bedroom has new carpet and a walk-in closet. There are three bedrooms and two bathrooms. The property is approximately 1,850 square feet and was possibly renovated in 2021.

The rear garden has a patio and mature planting. I noticed a small stain near the utility cupboard; condition and cause are unconfirmed.`;

export function TextWalkthroughStage({ address, onComplete, onCancel }: TextWalkthroughStageProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handleContinue = () => {
    const cleaned = text.trim();
    if (!cleaned) {
      setError('Paste a walkthrough before continuing. Include the rooms and details you want the documents to use.');
      return;
    }
    setError('');
    // A text run has no recording duration; the existing follow-up timing
    // contract receives zero and the rest of the workflow remains unchanged.
    onComplete(cleaned, 0);
  };

  return (
    <div className="animate-fade-in">
      <p className="text-center text-xs font-medium mb-6 truncate px-4" style={{ color: '#9a9488' }}>
        {address}
      </p>

      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider border bg-teal-50 border-teal-200 text-teal-700">
          <FileText size={14} /> Text test input
        </div>
      </div>

      <div className="text-center mb-7">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'rgba(30, 58, 95, 0.08)', border: '1px solid rgba(30, 58, 95, 0.12)' }}>
          <ClipboardPaste size={32} style={{ color: '#1e3a5f' }} />
        </div>
        <h2 className="text-2xl font-bold" style={{ color: '#1e3a5f' }}>Paste the walkthrough</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          This testing build sends the text directly to extraction. No microphone, audio upload, or transcription step is used.
        </p>
      </div>

      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(event) => { setText(event.target.value); if (error) setError(''); }}
          placeholder="Paste the walkthrough notes here…"
          rows={11}
          className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          aria-label="Walkthrough text"
        />

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
            <p className="text-sm leading-relaxed text-red-700">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => { setText(SAMPLE_WALKTHROUGH); setError(''); }}
          className="btn-secondary w-full"
        >
          <Sparkles size={17} /> Load sample walkthrough
        </button>

        <button type="button" onClick={handleContinue} className="btn-primary w-full text-base py-4">
          Continue to Outputs
        </button>

        <button type="button" onClick={onCancel} className="btn-ghost w-full text-slate-400">
          Cancel walkthrough
        </button>
      </div>
    </div>
  );
}
