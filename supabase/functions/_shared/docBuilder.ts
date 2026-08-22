/**
 * docBuilder.ts
 * Server-side .docx generation for all 6 Walkthrough AI document types.
 *
 * Uses npm:docx (via Deno npm compat) to produce real Word documents.
 * These are stored in Supabase Storage and served to both:
 *   - The in-app viewer (rendered via mammoth.js → HTML)
 *   - The download button (same file, direct download)
 *
 * Design system:
 *   Background:    warm off-white (#FAFAF8) — approximated in docx as very light fill
 *   Primary:       navy  #0F2740  — headers, section titles
 *   Accent:        sage  #6FAF9A  — positive indicators, highlights
 *   Warning:       amber #D97706  — maintenance flags, concerns
 *   Danger:        red   #DC2626  — serious issues
 *   Body text:     #1A2E45 (near-black, warmer than pure black)
 *   Labels:        #6B7280 (medium grey)
 *   Font:          Calibri throughout (universally available in Word)
 *   Margins:       1 inch (1440 twips) all sides
 *
 * Visual language (added in the document redesign pass):
 *   - Each of the 6 documents is treated as a different genre of real-world
 *     document (marketing flyer, personal client note, internal checklist,
 *     term sheet, status tracker, legal-adjacent prep sheet) rather than one
 *     shared template reused six times.
 *   - "Chips" (condition/status tags) are rendered via TextRun-level shading
 *     — NOT paragraph shading — so they sit inline next to other text.
 *   - Callout boxes are single-cell Tables (docx has no multi-paragraph
 *     bordered-box primitive), using a thick left border for the accent.
 *   - All new/changed shading always sets `color` AND `fill` to the same
 *     hex value. This was verified empirically (rendered via LibreOffice →
 *     PDF → image, pixel-sampled) before use — some docx.js guidance warns
 *     that solid shading can render black, which only happens when `color`
 *     is left unset; setting both explicitly avoids that reliably.
 */

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  Footer, PageNumber, ImageRun,
} from "npm:docx@8.5.0";
import { deriveTint } from "./palette.ts";

// ── Colour constants ──────────────────────────────────────────────────────────
// NAVY and SAGE are `let`, not `const` — they represent the current
// document's brand "primary" and "secondary" colors, which default to
// Walkthrough AI's own navy/sage but can be overridden per-user via a
// Brand Kit (see setBrandColors() below). Every other color here is a
// fixed semantic color (warning/danger/body text) and never changes.
//
// Safety note on using mutable module-level state in a Deno edge function
// that may serve concurrent requests: setBrandColors() is always called
// synchronously immediately before the (also synchronous) builder(...)
// call in buildDocx(), with no `await` in between. JS run-to-completion
// semantics mean nothing else can execute between those two calls, so this
// is safe even if the isolate is handling another request concurrently —
// the only await in buildDocx() happens *after* the document object (and
// everything derived from these colors) has already been fully built.

const DEFAULT_NAVY = "0F2740";
const DEFAULT_SAGE = "6FAF9A";
const DEFAULT_SAGE_BG = "E3F2EC";
const DEFAULT_SAGE_FG = "1F7A52";
const DEFAULT_BRAND_NAME = "Walkthrough AI";

let NAVY   = DEFAULT_NAVY;
let SAGE   = DEFAULT_SAGE;
let SAGE_BG = DEFAULT_SAGE_BG;
let SAGE_FG = DEFAULT_SAGE_FG;
let BRAND_NAME = DEFAULT_BRAND_NAME;

const AMBER  = "D97706";
const RED    = "DC2626";
const BODY   = "1A2E45";
const LABEL  = "6B7280";
const WHITE  = "FFFFFF";
const WARM_BG = "FAFAF8";
const LIGHT_RULE = "E8E4DE"; // warm light grey for dividers

// Tinted chip/badge backgrounds + matching foreground text colours for the
// fixed semantic colors (amber = fair/review, red = attention/flag).
// SAGE_BG/SAGE_FG (the "good/complete" tone) are brand-dependent — see above.
const AMBER_BG = "FDF1DF"; const AMBER_FG = "9A6A1E";
const RED_BG   = "FBE7E7"; const RED_FG   = "B23B3B";
const GREY_BG  = "EFEDE7";

/**
 * Set the brand colors for the document about to be built. Pass undefined
 * (or call with no arguments) to reset to Walkthrough AI's own defaults —
 * always call this before building a document, even for users with no
 * Brand Kit, so a previous request's colors can never leak into this one.
 *
 * primaryHex/secondaryHex are expected to be 6-digit hex strings with no
 * leading "#", sourced from the fixed 30-color palette (see palette.ts) —
 * never arbitrary user input.
 */
function setBrandColors(primaryHex?: string, secondaryHex?: string, brandName?: string): void {
  NAVY = primaryHex ? primaryHex.toUpperCase() : DEFAULT_NAVY;
  SAGE = secondaryHex ? secondaryHex.toUpperCase() : DEFAULT_SAGE;
  BRAND_NAME = brandName && brandName.trim() ? brandName.trim() : DEFAULT_BRAND_NAME;

  if (secondaryHex) {
    const tint = deriveTint(SAGE);
    SAGE_BG = tint.bg;
    SAGE_FG = tint.fg;
  } else {
    SAGE_BG = DEFAULT_SAGE_BG;
    SAGE_FG = DEFAULT_SAGE_FG;
  }
}

// ── Shared paragraph/run helpers ─────────────────────────────────────────────

function run(text: string, opts: {
  bold?: boolean;
  color?: string;
  size?: number;   // half-points
  font?: string;
  italic?: boolean;
  allCaps?: boolean;
  characterSpacing?: number;
  style?: string;  // named character style — see NAMED_STYLES below
} = {}): TextRun {
  return new TextRun({
    text,
    bold:    opts.bold    ?? false,
    color:   opts.color   ?? BODY,
    size:    opts.size    ?? 20,   // 10pt default
    font:    opts.font    ?? "Calibri",
    italics: opts.italic  ?? false,
    allCaps: opts.allCaps ?? false,
    characterSpacing: opts.characterSpacing,
    style: opts.style,
  });
}

function para(children: TextRun | TextRun[], opts: {
  spacingBefore?: number;
  spacingAfter?:  number;
  alignment?:     typeof AlignmentType[keyof typeof AlignmentType];
  indent?:        number;
  borderLeft?:    string; // colour — renders a left accent rule (blockquote-style)
} = {}): Paragraph {
  const runs = Array.isArray(children) ? children : [children];
  return new Paragraph({
    children: runs,
    spacing: {
      before: opts.spacingBefore ?? 0,
      after:  opts.spacingAfter  ?? 80,
    },
    alignment: opts.alignment,
    indent:    opts.indent ? { left: opts.indent } : undefined,
    border: opts.borderLeft
      ? { left: { style: BorderStyle.SINGLE, size: 12, color: opts.borderLeft } }
      : undefined,
  });
}

/**
 * Full-width navy header band with property address + document type.
 * Built as a single-cell table (not a plain paragraph) so we get real
 * internal padding above/below the text — a plain shaded Paragraph has no
 * way to add padding independent of the surrounding spacing, which is why
 * the previous version felt cramped.
 */
function headerBand(address: string, docType: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({ children: [new TableCell({
      children: [
        new Paragraph({
          children: [run(docType.toUpperCase(), { color: WHITE, size: 40, bold: true, characterSpacing: 4 })],
          spacing: { before: 0, after: 40 },
        }),
        new Paragraph({
          children: [run(address, { color: "C9D6E0", size: 20 })],
          spacing: { before: 0, after: 0 },
        }),
      ],
      shading: { type: ShadingType.SOLID, color: NAVY, fill: NAVY },
      margins: { top: 260, bottom: 260, left: 280, right: 280 },
      borders: { bottom: { style: BorderStyle.SINGLE, size: 8, color: SAGE } },
    })] })],
  });
}

/** Sage-accented section header — UPPERCASE with bottom rule */
function sectionHeader(title: string, spacingBefore = 360): Paragraph {
  return new Paragraph({
    style: "SectionHeading",
    children: [run(title, { color: NAVY, bold: true, size: 24, allCaps: true, characterSpacing: 4 })],
    spacing: { before: spacingBefore, after: 100 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: SAGE },
      left:   { style: BorderStyle.SINGLE, size: 12, color: SAGE },
    },
    indent: { left: 120 },
  });
}

/** A smaller, supporting-detail label (e.g. "Structural Notes") — not a full section header. */
function subLabel(text: string): Paragraph {
  return new Paragraph({
    children: [run(text, { color: NAVY, bold: true, size: 19 })],
    spacing: { before: 200, after: 60 },
  });
}

/** Label + value on the same line */
function labelValue(label: string, value: string | null | undefined, opts: { color?: string } = {}): Paragraph {
  if (!value || value === "not mentioned") return blank(40);
  return para([
    run(`${label}: `, { color: LABEL, size: 18, bold: true }),
    run(value, { color: opts.color ?? BODY, size: 18 }),
  ], { spacingAfter: 60 });
}

/** Manual bullet — safe to use inside table cells (avoids Word numbering-id gotchas across cells) */
function manualBullet(text: string, opts: { color?: string } = {}): Paragraph {
  return new Paragraph({
    children: [run("•  ", { color: SAGE, bold: true, size: 20 }), run(text, { color: opts.color ?? BODY, size: 20 })],
    spacing: { before: 40, after: 40 },
    indent: { left: 160, hanging: 160 },
  });
}

/** Checklist-style line with a hollow square glyph — for working documents (offers, confirmations) */
function checkItem(text: string): Paragraph {
  return new Paragraph({
    children: [run("☐  ", { color: NAVY, size: 20 }), run(text, { color: BODY, size: 20 })],
    spacing: { before: 50, after: 50 },
    indent: { left: 160, hanging: 200 },
  });
}

/** Plain body paragraph */
function body(text: string, opts: { spacingBefore?: number; spacingAfter?: number; color?: string } = {}): Paragraph {
  return para(run(text, { color: opts.color ?? BODY, size: 21 }), {
    spacingBefore: opts.spacingBefore ?? 60,
    spacingAfter:  opts.spacingAfter  ?? 120,
  });
}

/** Blank spacer paragraph */
function blank(size = 120): Paragraph {
  return new Paragraph({ children: [run("", { size })], spacing: { before: 0, after: 0 } });
}

/**
 * Footer: brand mark + real page number field, centered, understated.
 * PageNumber.CURRENT is a live Word field, not a static string — it updates
 * automatically as pages are added/removed.
 */
function footerPara(address: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          run(BRAND_NAME, { color: LABEL, size: 16, bold: true }),
          run("   ·   ", { color: LABEL, size: 16 }),
          run(address, { color: LABEL, size: 16 }),
          run("   ·   Page ", { color: LABEL, size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], color: LABEL, size: 16, font: "Calibri" }),
        ],
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: LIGHT_RULE } },
        spacing: { before: 120 },
      }),
    ],
  });
}

/**
 * "Chip" — a small inline tag (e.g. "GOOD", "PENDING") with a tinted
 * background. Implemented via TextRun-level shading (not paragraph
 * shading), so it can sit inline next to other text on the same line.
 */
type ChipTone = "good" | "fair" | "attention" | "pending" | "complete" | "flag" | "review";
function chip(text: string, tone: ChipTone): TextRun {
  const map: Record<ChipTone, [string, string, string]> = {
    good:      [SAGE_BG, SAGE_FG, "ChipGood"],
    complete:  [SAGE_BG, SAGE_FG, "ChipGood"],
    fair:      [AMBER_BG, AMBER_FG, "ChipFair"],
    review:    [AMBER_BG, AMBER_FG, "ChipFair"],
    attention: [RED_BG, RED_FG, "ChipAttention"],
    flag:      [RED_BG, RED_FG, "ChipAttention"],
    pending:   [GREY_BG, LABEL, "ChipPending"],
  };
  const [bg, fg, styleId] = map[tone];
  return new TextRun({
    text: `  ${text.toUpperCase()}  `,
    style: styleId,
    color: fg,
    bold: true,
    size: 15,
    font: "Calibri",
    characterSpacing: 4,
    shading: { type: ShadingType.SOLID, color: bg, fill: bg },
  });
}

/**
 * Callout box — a single-cell Table with a thick left accent border and a
 * tinted background. docx has no native multi-paragraph bordered-box
 * primitive, so a 1x1 table is the standard way to achieve this.
 */
function calloutBox(paragraphs: Paragraph[], accent: string = SAGE, bg: string = WARM_BG): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [new TableCell({
      children: paragraphs,
      shading: { type: ShadingType.SOLID, color: bg, fill: bg },
      margins: { top: 180, bottom: 180, left: 260, right: 260 },
      borders: {
        top:    { style: BorderStyle.SINGLE, size: 4, color: bg },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: bg },
        right:  { style: BorderStyle.SINGLE, size: 4, color: bg },
        left:   { style: BorderStyle.SINGLE, size: 28, color: accent },
      },
    })] })],
  });
}

/**
 * Two boxes side by side — e.g. "Standout Features" vs "Potential Concerns".
 * A 1-row, 2-column table, each cell independently accented.
 */
function twoColumnBoxes(
  left: { title: string; items: string[]; accent: string },
  right: { title: string; items: string[]; accent: string },
): Table {
  const cell = (col: { title: string; items: string[]; accent: string }) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: WARM_BG, fill: WARM_BG },
    margins: { top: 180, bottom: 180, left: 220, right: 220 },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: WARM_BG },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: WARM_BG },
      right:  { style: BorderStyle.SINGLE, size: 4, color: WARM_BG },
      left:   { style: BorderStyle.SINGLE, size: 24, color: col.accent },
    },
    children: [
      new Paragraph({ children: [run(col.title, { bold: true, color: NAVY, size: 18, allCaps: true, characterSpacing: 3 })], spacing: { after: 100 } }),
      ...col.items.map(i => manualBullet(i)),
    ],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({ children: [cell(left), cell(right)] })],
  });
}

/**
 * Vertical milestone tracker for the Transaction Timeline. A single Table
 * with a narrow status-dot column on the left; the repeated right-border on
 * every row of that column renders as one continuous connecting line down
 * the page (verified visually — this is the standard way to fake a timeline
 * rail in Word, since docx has no vector-line primitive).
 */
type Milestone = { step?: string; status?: string; date?: string; notes?: string };
function milestoneTable(milestones: Milestone[]): Table {
  const rows = milestones.map((m) => {
    const statusLower = (m.status ?? "").toLowerCase();
    const isDone = statusLower.includes("complet") || statusLower.includes("done");
    const dotColor = isDone ? SAGE : LABEL;

    return new TableRow({
      children: [
        new TableCell({
          width: { size: 8, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [run(isDone ? "●" : "○", { color: dotColor, size: 24, bold: true, style: isDone ? "DotComplete" : "DotPending" })],
          })],
          borders: { right: { style: BorderStyle.SINGLE, size: 8, color: "D8D3CA" } },
        }),
        new TableCell({
          width: { size: 92, type: WidthType.PERCENTAGE },
          margins: { left: 220, top: 60, bottom: 160 },
          children: [
            new Paragraph({
              children: [
                run(m.step ?? "Milestone", { bold: true, color: isDone ? BODY : NAVY, size: 20 }),
                m.date ? run(`   ${m.date}`, { color: LABEL, size: 17 }) : run(""),
              ],
            }),
            ...(m.notes ? [new Paragraph({
              children: [run(m.notes, { color: LABEL, size: 17, italic: true })],
              spacing: { before: 20 },
            })] : []),
          ],
        }),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    },
    rows,
  });
}

/** Horizontal divider */
function divider(): Paragraph {
  return new Paragraph({
    children: [run("")],
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: LIGHT_RULE } },
    spacing: { before: 120, after: 120 },
  });
}

/**
 * Fact grid / fact strip — e.g. "Beds: 3 | Baths: 2 | Sqft: 1,400".
 * Big bold navy numbers over small letter-spaced grey labels, tiled across
 * a borderless table so columns line up cleanly. Used for the Listing
 * Pack's headline facts and the Offer Summary's key terms.
 */
function factGrid(facts: { label: string; value: string | null | undefined }[]): Table {
  const filled = facts.filter(f => f.value && f.value !== "not mentioned");
  const rows: typeof facts[] = [];
  for (let i = 0; i < filled.length; i += 3) rows.push(filled.slice(i, i + 3));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    },
    rows: rows.map(row => {
      const cells = row.map(f =>
        new TableCell({
          children: [
            new Paragraph({
              children: [run(f.value!, { color: NAVY, size: 32, bold: true })],
              spacing: { after: 40 },
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [run(f.label.toUpperCase(), { color: LABEL, size: 14, bold: true, characterSpacing: 6 })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          shading: { type: ShadingType.SOLID, color: WARM_BG, fill: WARM_BG },
          margins: { top: 180, bottom: 180, left: 80, right: 80 },
        })
      );
      while (cells.length < 3) {
        cells.push(new TableCell({ children: [new Paragraph({ children: [run("")] })] }));
      }
      return new TableRow({ children: cells });
    }),
  });
}

/** Amber/red flag line for maintenance items and concerns */
function flagLine(text: string, severity: "warning" | "danger" = "warning"): Paragraph {
  const color = severity === "danger" ? RED : AMBER;
  return new Paragraph({
    children: [run(`⚠  ${text}`, { color, size: 19, bold: true })],
    spacing: { before: 60, after: 60 },
    indent: { left: 240 },
  });
}

// ── Room photo embedding ──────────────────────────────────────────────────────
// Agent-uploaded photos, attached per room before generation (see
// PhotosStage.tsx). Only buildListingPack uses these — its "Room by Room"
// section is the only place any document has a natural per-room slot for a
// photo. A room with no photo simply gets no image here; there is never a
// placeholder box or "insert photo" text.

/** A single room photo: raw bytes plus its actual pixel dimensions
 *  (captured client-side at upload time in resizeImageForUpload). */
export interface RoomPhotoData {
  bytes: Uint8Array;
  width: number;
  height: number;
}
/** Room photos for one document build, keyed by exact room name. */
export type RoomPhotoMap = Record<string, RoomPhotoData | RoomPhotoData[]>;

/** Photos are scaled to fit within this box, preserving aspect ratio —
 *  never stretched, never cropped. This is a *display* size inside the
 *  document, independent of the (larger) resolution actually uploaded. */
const PHOTO_MAX_WIDTH = 440;
const PHOTO_MAX_HEIGHT = 320;

/**
 * Look up a room's photo by name, matching case/whitespace-insensitively.
 * Pass 2 regenerates room names from the same Pass 1 data on every call
 * but isn't guaranteed to reproduce identical casing/whitespace, so an
 * exact string match would be too fragile here. Returns null (not an
 * error) if there's no photo for this room — a missing photo is always a
 * silent, clean no-op.
 */
function findRoomPhotos(roomPhotos: RoomPhotoMap | undefined, roomName: string): RoomPhotoData[] {
  if (!roomPhotos) return [];
  const target = roomName.trim().toLowerCase();
  for (const [name, photos] of Object.entries(roomPhotos)) {
    if (name.trim().toLowerCase() === target) return Array.isArray(photos) ? photos : [photos];
  }
  return [];
}

/**
 * Build a Paragraph containing a room's photo, scaled to fit within
 * PHOTO_MAX_WIDTH x PHOTO_MAX_HEIGHT while preserving its aspect ratio.
 * Returns null if the photo has no usable dimensions (defensive — should
 * not happen given how photos are always stored with their real size).
 */
function roomPhotoParagraph(photo: RoomPhotoData): Paragraph | null {
  if (!photo.width || !photo.height) return null;
  const scale = Math.min(PHOTO_MAX_WIDTH / photo.width, PHOTO_MAX_HEIGHT / photo.height, 1);
  const width  = Math.max(1, Math.round(photo.width * scale));
  const height = Math.max(1, Math.round(photo.height * scale));

  return new Paragraph({
    children: [
      new ImageRun({
        data: photo.bytes,
        transformation: { width, height },
      }),
    ],
    spacing: { before: 80, after: 120 },
  });
}

// ── Helper to safely read a value ────────────────────────────────────────────

/**
 * Named styles referenced by chip()/sectionHeader()/milestoneTable() below.
 * These exist ONLY so mammoth.js (the in-app viewer) can pick them up as
 * CSS classes via DocViewer.tsx's styleMap — mammoth's default HTML
 * conversion silently drops all direct/inline shading and colour (verified
 * empirically: rendered via LibreOffice vs. via mammoth and diffed the
 * output), but it DOES preserve named style references. Word/LibreOffice
 * ignore this and just use the inline formatting on each run as before —
 * this is additive, not a replacement.
 */
/**
 * Built as a function (not a static const) so it always reflects whichever
 * brand colors were just set via setBrandColors() for *this* document,
 * rather than whatever NAVY/SAGE happened to be when the module first
 * loaded (which, for a `let`-based mutable value, would otherwise only
 * ever capture the very first request's colors).
 */
function namedStyles() {
  return {
    characterStyles: [
      { id: "ChipGood",      name: "Chip Good",      basedOn: "DefaultParagraphFont", run: { color: SAGE_FG,  bold: true } },
      { id: "ChipFair",      name: "Chip Fair",      basedOn: "DefaultParagraphFont", run: { color: AMBER_FG, bold: true } },
      { id: "ChipAttention", name: "Chip Attention", basedOn: "DefaultParagraphFont", run: { color: RED_FG,   bold: true } },
      { id: "ChipPending",   name: "Chip Pending",   basedOn: "DefaultParagraphFont", run: { color: LABEL,    bold: true } },
      { id: "DotComplete",   name: "Dot Complete",   basedOn: "DefaultParagraphFont", run: { color: SAGE,     bold: true } },
      { id: "DotPending",    name: "Dot Pending",    basedOn: "DefaultParagraphFont", run: { color: LABEL,    bold: true } },
    ],
    paragraphStyles: [
      { id: "SectionHeading", name: "Section Heading", basedOn: "Normal", next: "Normal", run: { color: NAVY, bold: true, size: 24 } },
    ],
  };
}

function val(v: unknown): string | null {
  if (v === null || v === undefined || v === "not mentioned" || v === "") return null;
  return String(v);
}

function arr<T>(v: unknown): T[] {
  if (!Array.isArray(v) || v.length === 0) return [];
  return v as T[];
}

/** Standard page setup shared by every document — 1in margins, footer, US Letter default from docx.js. */
function docSections(children: (Paragraph | Table)[], address: string) {
  return {
    styles: namedStyles(),
    sections: [{
      properties: {
        page: { margin: { top: 720, bottom: 720, left: 1080, right: 1080 } },
      },
      footers: { default: footerPara(address) },
      children,
    }],
  };
}

// ── Document builders ─────────────────────────────────────────────────────────

// 1. LISTING PACK ──────────────────────────────────────────────────────────────
// A marketing document. Numbers-forward fact strip, magazine-style
// description, highlights in a callout box, features as a two-column grid.

function buildListingPack(data: Record<string, unknown>, address: string, roomPhotos?: RoomPhotoMap): Document {
  const fs       = (data.fact_sheet ?? {}) as Record<string, string | null>;
  const headline = val(data.headline);
  const desc     = val(data.description) ?? val(data.general_summary) ?? "";
  const feats    = arr<string>(data.feature_bullets);
  const rooms    = arr<Record<string, unknown>>(data.room_breakdown);
  const highs    = arr<string>(data.highlights);

  const children: (Paragraph | Table)[] = [
    headerBand(address, "Property Listing Pack"),
    blank(160),
  ];

  if (headline) {
    children.push(
      new Paragraph({
        children: [run(headline, { color: NAVY, size: 26, bold: true, italic: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 220 },
      })
    );
  }

  children.push(
    factGrid([
      { label: "Beds",       value: val(fs.beds) },
      { label: "Baths",      value: val(fs.baths) },
      { label: "Sqft",       value: val(fs.sqft) },
      { label: "Style",      value: val(fs.style) },
      { label: "Year Built", value: val(fs.year_built) },
      { label: "Lot Size",   value: val(fs.lot) },
    ]),
    blank(160),
  );

  if (val(fs.price_range)) {
    children.push(
      new Paragraph({
        children: [run(val(fs.price_range)!, { color: NAVY, size: 34, bold: true })],
        spacing: { before: 40, after: 200 },
        alignment: AlignmentType.CENTER,
      })
    );
  }

  if (desc) {
    children.push(sectionHeader("Property Description"));
    desc.split("\n").filter(Boolean).forEach(p => children.push(body(p)));
    children.push(blank(80));
  }

  if (highs.length > 0) {
    children.push(sectionHeader("Why You'll Love It"));
    children.push(blank(40));
    children.push(calloutBox(highs.map(h => manualBullet(h)), SAGE));
    children.push(blank(120));
  }

  if (feats.length > 0) {
    children.push(sectionHeader("Key Features"));
    children.push(blank(40));
    // Two-column grid rather than a single long bulleted list.
    const rowsData: string[][] = [];
    for (let i = 0; i < feats.length; i += 2) rowsData.push(feats.slice(i, i + 2));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
      },
      rows: rowsData.map(pair => new TableRow({
        children: [
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [manualBullet(pair[0])] }),
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [pair[1] ? manualBullet(pair[1]) : new Paragraph({ children: [run("")] })] }),
        ],
      })),
    }));
    children.push(blank(120));
  }

  if (rooms.length > 0) {
    children.push(sectionHeader("Room by Room"));
    rooms.forEach((r, i) => {
      const name    = val(r.room) ?? val(r.name) ?? "Room";
      const details = val(r.details) ?? val(r.observations) ?? "";
      children.push(
        new Paragraph({
          children: [run(name, { bold: true, color: NAVY, size: 21 })],
          spacing: { before: 160, after: 40 },
        })
      );
      // Agent-uploaded photo for this room, if one was attached in the
      // Photos step — scaled to fit, never stretched. No photo means no
      // image here at all, not a placeholder.
      const photosForRoom = findRoomPhotos(roomPhotos, name);
      photosForRoom.forEach((photo) => {
        const photoPara = roomPhotoParagraph(photo);
        if (photoPara) children.push(photoPara);
      });
      if (details) children.push(body(details));
      if (i < rooms.length - 1) children.push(divider());
    });
  }

  return new Document(docSections(children, address));
}

// 2. INSPECTION NOTES ─────────────────────────────────────────────────────────
// Agent walkthrough observations — explicitly NOT a certified inspection
// report. Condition chips per room, consolidated maintenance checklist.

function buildInspectionNotes(data: Record<string, unknown>, address: string): Document {
  const rooms  = arr<Record<string, unknown>>(data.rooms);
  const struct = val(data.structural_notes);
  const cosmet = val(data.cosmetic_notes);
  const maint  = arr<string>(data.maintenance_summary);

  const children: (Paragraph | Table)[] = [
    headerBand(address, "Inspection Notes"),
    blank(120),
    new Paragraph({
      children: [run("Agent walkthrough observations — not a licensed inspection.", { color: LABEL, size: 17, italic: true })],
      spacing: { after: 80 },
    }),
    para([
      run("Date of walkthrough: ", { color: LABEL, size: 18, bold: true }),
      run(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), { color: BODY, size: 18 }),
    ]),
    blank(100),
  ];

  if (maint.length > 0) {
    children.push(sectionHeader("Maintenance Summary"));
    children.push(blank(40));
    children.push(calloutBox(maint.map(m => manualBullet(m, { color: AMBER_FG })), AMBER, AMBER_BG));
    children.push(blank(120));
  }

  if (rooms.length > 0) {
    children.push(sectionHeader("Room-by-Room Observations"));
    rooms.forEach((room, i) => {
      const name  = val(room.name) ?? "Room";
      const cond  = val(room.condition);
      const obs   = val(room.observations);
      const flags = arr<string>(room.maintenance_flags);
      const photos = arr<string>(room.photo_suggestions);

      const condLower = (cond ?? "").toLowerCase();
      const tone: ChipTone = condLower.includes("good") ? "good"
        : condLower.includes("needs") || condLower.includes("poor") ? "attention"
        : condLower.includes("fair") ? "fair"
        : "good";

      children.push(
        new Paragraph({
          children: cond
            ? [run(name, { bold: true, color: NAVY, size: 22 }), run("   "), chip(cond, tone)]
            : [run(name, { bold: true, color: NAVY, size: 22 })],
          spacing: { before: 200, after: 60 },
        })
      );

      if (obs) children.push(body(obs, { spacingBefore: 40, spacingAfter: 60 }));
      flags.forEach(f => children.push(flagLine(f, "warning")));

      if (photos.length > 0) {
        children.push(
          para(
            [run("Photo reminders: ", { color: SAGE_FG, size: 17, bold: true }),
             run(photos.join(" · "), { color: LABEL, size: 17 })],
            { spacingBefore: 40, spacingAfter: 60 }
          )
        );
      }

      if (i < rooms.length - 1) children.push(divider());
    });
  }

  if (struct) {
    children.push(subLabel("Structural Notes"));
    children.push(body(struct));
  }
  if (cosmet) {
    children.push(subLabel("Cosmetic Notes"));
    children.push(body(cosmet));
  }

  return new Document(docSections(children, address));
}

// 3. CLIENT SUMMARY ───────────────────────────────────────────────────────────
// The most client-facing of the six. Reads like a personal recap rather
// than a form — pull-quote-style overview, side-by-side pros/cons.

function buildClientSummary(data: Record<string, unknown>, address: string): Document {
  const appeal    = val(data.property_appeal);
  const standout  = arr<string>(data.standout_features);
  const concerns  = arr<string>(data.potential_concerns);
  const reactions = (data.client_reactions ?? {}) as Record<string, unknown>;
  const likes     = arr<string>(reactions.likes);
  const dislikes  = arr<string>(reactions.dislikes);
  const budget    = val(reactions.budget_indicators);
  const next      = arr<string>(reactions.next_steps);

  const children: (Paragraph | Table)[] = [
    headerBand(address, "Client Summary Report"),
    blank(160),
  ];

  if (appeal) {
    children.push(
      new Paragraph({
        children: [run(appeal, { color: BODY, size: 22, italic: true })],
        spacing: { before: 40, after: 200 },
        indent: { left: 320, right: 320 },
        border: { left: { style: BorderStyle.SINGLE, size: 16, color: SAGE } },
      })
    );
  }

  if (standout.length > 0 || concerns.length > 0) {
    children.push(twoColumnBoxes(
      { title: "Standout Features", items: standout.length > 0 ? standout : ["None captured"], accent: SAGE },
      { title: "Points to Consider", items: concerns.length > 0 ? concerns : ["None captured"], accent: AMBER },
    ));
    children.push(blank(160));
  }

  if (likes.length > 0 || dislikes.length > 0 || budget || next.length > 0) {
    const notesChildren: Paragraph[] = [
      new Paragraph({
        children: [run("Internal Notes", { bold: true, color: NAVY, size: 18, allCaps: true, characterSpacing: 3 })],
        spacing: { after: 120 },
      }),
    ];

    if (likes.length > 0) {
      notesChildren.push(para(run("Liked:", { bold: true, color: SAGE_FG, size: 19 }), { spacingBefore: 40, spacingAfter: 40 }));
      likes.forEach(l => notesChildren.push(manualBullet(l)));
    }
    if (dislikes.length > 0) {
      notesChildren.push(para(run("Concerns:", { bold: true, color: AMBER_FG, size: 19 }), { spacingBefore: 80, spacingAfter: 40 }));
      dislikes.forEach(d => notesChildren.push(manualBullet(d)));
    }
    if (budget) {
      notesChildren.push(labelValue("Budget discussed", budget));
    }
    if (next.length > 0) {
      notesChildren.push(para(run("Next Steps:", { bold: true, color: NAVY, size: 19 }), { spacingBefore: 80, spacingAfter: 40 }));
      next.forEach((n, i) => notesChildren.push(manualBullet(`${i + 1}. ${n}`)));
    }

    children.push(calloutBox(notesChildren, LIGHT_RULE, "F3F1EC"));
  }

  return new Document(docSections(children, address));
}

// 4. OFFER SUMMARY ────────────────────────────────────────────────────────────
// A working term sheet, not prose. Numbers-forward summary strip up top,
// checklist-style contingencies for fast scanning under time pressure.

function buildOfferSummary(data: Record<string, unknown>, address: string): Document {
  const price      = val(data.offer_price);
  const deposit    = val(data.deposit);
  const financing  = val(data.financing_type);
  const closing    = val(data.closing_date);
  const deadline   = val(data.response_deadline);
  const contingen  = arr<string>(data.contingencies);
  const special    = arr<string>(data.special_conditions);
  const summary    = val(data.summary_note);
  const disclaimer = val(data.disclaimer);

  const children: (Paragraph | Table)[] = [
    headerBand(address, "Offer Summary Sheet"),
    blank(160),
  ];

  if (summary) {
    children.push(calloutBox([
      new Paragraph({ children: [run(summary, { color: BODY, size: 20 })] }),
    ], NAVY));
    children.push(blank(160));
  }

  children.push(factGrid([
    { label: "Offer Price",  value: price },
    { label: "Deposit",      value: deposit },
    { label: "Closing Date", value: closing },
  ]));
  children.push(blank(120));

  if (financing || deadline) {
    children.push(labelValue("Financing", financing));
    children.push(labelValue("Response Deadline", deadline));
    children.push(blank(100));
  }

  if (contingen.length > 0) {
    children.push(sectionHeader("Contingencies"));
    contingen.forEach(c => children.push(checkItem(c)));
    children.push(blank(80));
  }

  if (special.length > 0) {
    children.push(sectionHeader("Special Conditions"));
    special.forEach(s => children.push(checkItem(s)));
    children.push(blank(80));
  }

  if (disclaimer) {
    children.push(blank(80));
    children.push(divider());
    children.push(
      para(run(disclaimer, { color: LABEL, size: 16, italic: true }), { spacingBefore: 80 })
    );
  }

  return new Document(docSections(children, address));
}

// 5. TRANSACTION TIMELINE ─────────────────────────────────────────────────────
// A real visual status tracker — not restyled prose. Milestones render in
// the order provided, each with a connected status dot, rather than being
// forced into an invented "contract / due diligence / closing" grouping.

function buildTransactionTimeline(data: Record<string, unknown>, address: string): Document {
  const milestones = arr<Milestone>(data.milestones);
  const missing    = arr<string>(data.missing_items);
  const overall    = val(data.overall_status);

  const children: (Paragraph | Table)[] = [
    headerBand(address, "Transaction Timeline"),
    blank(160),
  ];

  if (overall) {
    children.push(calloutBox([
      new Paragraph({ children: [
        run("Overall Status:  ", { bold: true, color: LABEL, size: 18 }),
        run(overall, { bold: true, color: NAVY, size: 20 }),
      ] }),
    ], NAVY));
    children.push(blank(160));
  }

  if (milestones.length > 0) {
    children.push(sectionHeader("Milestones"));
    children.push(blank(60));
    children.push(milestoneTable(milestones));
    children.push(blank(120));
  }

  if (missing.length > 0) {
    children.push(sectionHeader("Outstanding Items"));
    children.push(blank(40));
    children.push(calloutBox(missing.map(m => manualBullet(m, { color: AMBER_FG })), AMBER, AMBER_BG));
  }

  return new Document(docSections(children, address));
}

// 6. DISCLOSURE PREP ──────────────────────────────────────────────────────────
// Agent prep material for the disclosure conversation — deliberately NOT
// styled like a signable legal form (no signature lines, no attestation
// language), since that is the seller's own official document, not this one.

function buildDisclosurePrep(data: Record<string, unknown>, address: string): Document {
  type Issue = { issue?: string; severity?: string; seller_prompt?: string };
  const issues     = arr<Issue>(data.observed_issues);
  const areas      = arr<string>(data.areas_requiring_confirmation);
  const disclaimer = val(data.disclaimer);

  const children: (Paragraph | Table)[] = [
    headerBand(address, "Disclosure Prep Assistant"),
    blank(120),
    new Paragraph({
      children: [run("DRAFT · INTERNAL USE — NOT A LEGAL DISCLOSURE FORM", { color: AMBER_FG, size: 15, bold: true, characterSpacing: 3 })],
      spacing: { after: 100 },
    }),
    para(
      run(
        "This worksheet helps prepare for legally required property disclosures. " +
        "Review each item with your seller before completing formal disclosure forms.",
        { color: LABEL, size: 17, italic: true }
      ),
      { spacingBefore: 40, spacingAfter: 160 }
    ),
  ];

  if (issues.length > 0) {
    children.push(sectionHeader("Observed Issues"));
    children.push(blank(60));

    issues.forEach((issue, i) => {
      const sev  = (issue.severity ?? "").toLowerCase();
      const tone: ChipTone = sev.includes("flag") ? "flag" : "review";
      const label = sev.includes("flag") ? "Flag" : "Review";

      const issueParas: Paragraph[] = [
        new Paragraph({
          children: [
            run(`${i + 1}.  `, { bold: true, color: NAVY, size: 19 }),
            run(issue.issue ?? "Issue", { bold: true, color: BODY, size: 19 }),
            run("   "),
            chip(label, tone),
          ],
          spacing: { after: issue.seller_prompt ? 100 : 0 },
        }),
      ];

      if (issue.seller_prompt) {
        issueParas.push(
          para(
            [run("Ask seller:  ", { bold: true, color: SAGE_FG, size: 17 }),
             run(issue.seller_prompt, { color: BODY, size: 18, italic: true })],
            { indent: 200, borderLeft: SAGE }
          )
        );
      }

      children.push(calloutBox(issueParas, i % 2 === 0 ? LIGHT_RULE : LIGHT_RULE, "FCFBF9"));
      children.push(blank(80));
    });
  }

  if (areas.length > 0) {
    children.push(sectionHeader("Areas Requiring Confirmation"));
    children.push(blank(40));
    areas.forEach(a => children.push(checkItem(a)));
    children.push(blank(80));
  }

  if (disclaimer) {
    children.push(blank(80));
    children.push(calloutBox([
      new Paragraph({ children: [run(disclaimer, { color: RED_FG, size: 17, bold: true })] }),
    ], RED, RED_BG));
  }

  return new Document(docSections(children, address));
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Map from output type to builder function. Only buildListingPack actually
 *  reads the roomPhotos argument — the other five ignore it, which is fine
 *  since JS/TS allow calling a function with more arguments than it declares. */
const BUILDERS: Record<string, (data: Record<string, unknown>, address: string, roomPhotos?: RoomPhotoMap) => Document> = {
  listing_pack:         buildListingPack,
  inspection_notes:     buildInspectionNotes,
  client_summary:       buildClientSummary,
  offer_summary:        buildOfferSummary,
  transaction_timeline: buildTransactionTimeline,
  disclosure_prep:      buildDisclosurePrep,
};

/** A user's Brand Kit colors + name, or undefined to use Walkthrough AI's own defaults. */
export interface BrandOptions {
  primaryHex?: string;
  secondaryHex?: string;
  brandName?: string;
}

/**
 * Generate a .docx file for a single output type from the Gemini-generated
 * document data. Returns a Uint8Array (the raw .docx bytes) ready for upload
 * to Supabase Storage.
 *
 * @param outputType  One of the 6 document types
 * @param docData     The Gemini-generated JSON object for this document type
 * @param address     Property address for header/footer
 * @param brand       Optional Brand Kit colors/name — omit for Walkthrough AI defaults
 * @param roomPhotos  Agent-uploaded room photos, keyed by room name — only
 *                    used by listing_pack; harmless to pass for other types
 */
export async function buildDocx(
  outputType: string,
  docData: Record<string, unknown>,
  address: string,
  brand?: BrandOptions,
  roomPhotos?: RoomPhotoMap
): Promise<Uint8Array> {
  const builder = BUILDERS[outputType];
  if (!builder) throw new Error(`No builder for output type: ${outputType}`);
  // Always call this, even with no brand — resets to defaults so a
  // previous request's colors can never leak into this document.
  setBrandColors(brand?.primaryHex, brand?.secondaryHex, brand?.brandName);
  const doc = builder(docData, address, roomPhotos);
  return await Packer.toBuffer(doc);
}
