/**
 * DocViewer.tsx
 * In-app document viewer. Fetches the .docx file from Supabase Storage,
 * converts it to HTML using mammoth.js, and renders it inline.
 *
 * This means the in-app preview and the downloaded file are IDENTICAL —
 * both are the same .docx bytes from storage. No separate renderer,
 * no drift between what you see and what you download.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import mammoth from 'mammoth';
import { getDocumentSignedUrl } from '../../services/supabase';
import { deriveTint } from '../../utils/brandPalette';
import { AlertCircle, Loader2 } from 'lucide-react';

/** The brand colors/name frozen onto a property at generation time
 *  (Property.document_brand). Null for documents generated before this
 *  existed — the viewer falls back to Walkthrough AI's document defaults. */
export interface FrozenBrand {
  primary_hex: string;
  secondary_hex: string;
  brand_name: string;
}

interface DocViewerProps {
  /** Storage path for the .docx file, e.g. "documents/{userId}/{propertyId}/listing-pack.docx" */
  storagePath: string;
  /** Human-readable document name for error messages */
  docLabel: string;
  /** The brand colors/name that were actually used to generate this
   *  specific document — NOT the user's current Brand Kit. Documents are
   *  frozen in time: a document always looks the way it did the day it
   *  was generated, in-app and in the downloaded .docx alike, regardless
   *  of any Brand Kit changes made since. */
  brand?: FrozenBrand | null;
}

// Document-specific defaults — deliberately a different navy shade
// (#0F2740) from the app UI's own navy (#1E3A5F); matches
// docBuilder.ts's DEFAULT_NAVY/DEFAULT_SAGE exactly.
const DEFAULT_DOC_PRIMARY_HEX = '0F2740';
const DEFAULT_DOC_SECONDARY_HEX = '6FAF9A';

/**
 * CSS custom properties for this document's frozen brand colors, applied
 * as an inline style on the viewer container. index.css reads these (with
 * Walkthrough AI's own navy/sage as the ultimate fallback) so the in-app
 * preview matches the colors actually baked into this .docx file.
 */
interface BrandCssVars {
  '--brand-primary': string;
  '--brand-secondary': string;
  '--brand-secondary-tint-bg': string;
  '--brand-secondary-tint-fg': string;
}

export function DocViewer({ storagePath, docLabel, brand }: DocViewerProps) {
  const [html, setHtml]       = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef          = useRef<HTMLDivElement>(null);

  // Derived synchronously from the frozen `brand` prop — no fetch needed,
  // since this is just what was recorded at generation time, not a live
  // lookup of the user's current Brand Kit.
  const brandVars = useMemo<BrandCssVars>(() => {
    const primaryHex = brand?.primary_hex ?? DEFAULT_DOC_PRIMARY_HEX;
    const secondaryHex = brand?.secondary_hex ?? DEFAULT_DOC_SECONDARY_HEX;
    const tint = deriveTint(secondaryHex);
    return {
      '--brand-primary': `#${primaryHex}`,
      '--brand-secondary': `#${secondaryHex}`,
      '--brand-secondary-tint-bg': `#${tint.bg}`,
      '--brand-secondary-tint-fg': `#${tint.fg}`,
    };
  }, [brand]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml(null);

    async function load() {
      try {
        // 1. Get a signed URL (1-hour expiry)
        const url = await getDocumentSignedUrl(storagePath);

        // 2. Fetch the .docx bytes
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch document (${res.status})`);
        const arrayBuffer = await res.arrayBuffer();

        // 3. Convert to HTML via mammoth
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            // Style map — preserve our docx design system in the HTML output.
            // Mammoth's default conversion silently drops all direct/inline
            // shading and colour (verified by diffing LibreOffice's render
            // against mammoth's), but DOES preserve named style references —
            // these map the named styles set in docBuilder.ts to CSS classes
            // defined in .doc-viewer-body (index.css).
            styleMap: [
              "b => strong",
              "i => em",
              "u => u",
              "r[style-name='Chip Good'] => span.chip-good",
              "r[style-name='Chip Fair'] => span.chip-fair",
              "r[style-name='Chip Attention'] => span.chip-attention",
              "r[style-name='Chip Pending'] => span.chip-pending",
              "r[style-name='Dot Complete'] => span.dot-complete",
              "r[style-name='Dot Pending'] => span.dot-pending",
              "p[style-name='Section Heading'] => p.section-heading",
            ],
          }
        );

        if (!cancelled) {
          setHtml(result.value);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[DocViewer] load error:', err);
          setError(err instanceof Error ? err.message : 'Could not load document');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [storagePath]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 size={28} className="animate-spin" style={{ color: '#1e3a5f' }} />
        <p className="text-sm" style={{ color: '#9a9488' }}>Loading {docLabel}…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 gap-3 text-center">
        <AlertCircle size={28} style={{ color: '#DC2626' }} />
        <p className="text-sm font-semibold text-slate-700">Could not load document</p>
        <p className="text-xs" style={{ color: '#9a9488' }}>{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="doc-viewer-body"
      style={brandVars as CSSProperties | undefined}
      dangerouslySetInnerHTML={{ __html: html ?? '' }}
    />
  );
}
