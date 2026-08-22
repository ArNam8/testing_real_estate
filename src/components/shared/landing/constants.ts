/**
 * constants.ts
 * Static content for the landing page. Kept separate from the visual
 * components so copy can be reviewed/edited without touching JSX or CSS.
 *
 * Document labels/descriptions are copied from services/supabase.ts
 * (OUTPUT_DEFINITIONS) so the marketing page can never describe a document
 * the product doesn't actually produce, or describe it differently than
 * the app does.
 */

import {
  FileText, ClipboardList, Users, DollarSign, ListChecks, ShieldAlert,
  Mic, ListTree, HelpCircle, Camera, Sparkles,
  ShieldCheck, FileCheck2, Palette, FileType2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** One of the six real document types the app can generate. */
export interface DocumentType {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** Mirrors OUTPUT_DEFINITIONS + OUTPUT_ICONS + OUTPUT_ORDER from services/supabase.ts. */
export const DOCUMENT_TYPES: DocumentType[] = [
  {
    key: 'listing_pack',
    label: 'Property Listing Pack',
    description: 'Description, feature bullets, room breakdown, highlights & fact sheet',
    icon: FileText,
  },
  {
    key: 'client_summary',
    label: 'Client Summary Report',
    description: 'Buyer/seller preferences, priorities, budget constraints & next steps',
    icon: Users,
  },
  {
    key: 'inspection_notes',
    label: 'Inspection Notes',
    description: 'Room-by-room observations, condition notes, maintenance flags, photo suggestions',
    icon: ClipboardList,
  },
  {
    key: 'offer_summary',
    label: 'Offer Summary Sheet',
    description: 'Offer amount, conditions, timelines, financing & contingencies',
    icon: DollarSign,
  },
  {
    key: 'transaction_timeline',
    label: 'Transaction Timeline',
    description: 'Milestones checklist: viewings, offers, inspections, closing & missing items',
    icon: ListChecks,
  },
  {
    key: 'disclosure_prep',
    label: 'Disclosure Prep Assistant',
    description: 'Observed issues converted to prompts for seller confirmation',
    icon: ShieldAlert,
  },
];

/** One panel of the 5-step scroll experience. */
export interface WorkflowStep {
  index: number;
  kicker: string;
  title: string;
  body: string;
  icon: LucideIcon;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    index: 1,
    kicker: 'Step 1',
    title: 'Record the walkthrough',
    body: 'Say the room name as you walk in, then talk naturally about size, condition, and finishes. No script, no typing — Walkthrough AI listens and accumulates the details as you move through the property.',
    icon: Mic,
  },
  {
    index: 2,
    kicker: 'Step 2',
    title: 'Choose your documents',
    body: 'Pick which of the six documents you actually need for this listing. Every document is generated from the same walkthrough — nothing is re-recorded.',
    icon: ListTree,
  },
  {
    index: 3,
    kicker: 'Step 3',
    title: 'Answer a few quick checks',
    body: "If something important was missed, Walkthrough AI asks — it doesn't guess. A handful of short follow-up questions close the gaps, which is what keeps the documents accurate instead of invented.",
    icon: HelpCircle,
  },
  {
    index: 4,
    kicker: 'Step 4',
    title: 'Add your photos',
    body: 'Every room detected in the walkthrough gets its own photo slot. Attach a shot from your camera roll and it flows straight into the finished documents.',
    icon: Camera,
  },
  {
    index: 5,
    kicker: 'Step 5',
    title: 'Get polished, branded documents',
    body: 'Your voice becomes structured information, your information becomes verified facts, and your facts become finished documents — branded in your colors, ready as PDF or Word. Start to finish, under 5 minutes.',
    icon: Sparkles,
  },
];

/** Mock transcript fragments used to animate Step 1's "flowing text" visual. Illustrative only. */
export const TRANSCRIPT_SNIPPETS: string[] = [
  'Kitchen — quartz counters, gas range, stainless appliances',
  'Fresh coat of paint, minor scuff on the hallway trim',
  'Primary bedroom — walk-in closet, new carpet',
  'Bathroom — recently retiled, good water pressure',
  'Backyard — fenced, mature trees, deck needs staining',
];

/** Rooms shown filling in during Step 1 and getting photo slots in Step 4. */
export const WALKTHROUGH_ROOMS: string[] = [
  'Kitchen', 'Living Room', 'Primary Bedroom', 'Bathroom', 'Backyard',
];

/** Example follow-up question shown in Step 3. */
export const SAMPLE_FOLLOW_UP = {
  question: "You mentioned the kitchen counters but not the flooring — what's underfoot in there?",
  answer: 'Hardwood, refinished last year',
};

/** Honest, mechanism-based trust points — no invented stats or testimonials. */
export interface TrustPoint {
  title: string;
  body: string;
  icon: LucideIcon;
}

export const TRUST_POINTS: TrustPoint[] = [
  {
    title: 'Only writes what you said',
    body: "Every fact in your documents is traced back to something said in the walkthrough — extraction is scored by confidence, and gaps trigger a follow-up question instead of a guess.",
    icon: ShieldCheck,
  },
  {
    title: 'You see it before it ships',
    body: 'Every generated document opens in a full viewer before you send or download it, so nothing reaches a client unreviewed.',
    icon: FileCheck2,
  },
  {
    title: 'Branded in your colors',
    body: 'Your logo and brand colors are applied at generation time and locked to that document, so what you send always looks like it came from you.',
    icon: Palette,
  },
  {
    title: 'Real files, not just previews',
    body: 'Documents are generated as genuine .docx files you can open, edit, and re-send in Word — not a locked preview you have to copy out of.',
    icon: FileType2,
  },
];

/** An AI assistant the visitor can ask about Walkthrough AI. */
export interface AiProvider {
  id: 'chatgpt' | 'claude' | 'gemini';
  name: string;
  /** Base chat URL. `?q=` prefill is supported by ChatGPT and (usually) Claude; Gemini does not
   *  reliably support it, so the prompt is also offered as copyable text as a fallback. */
  buildUrl: (encodedPrompt: string) => string;
}

export const AI_PROVIDERS: AiProvider[] = [
  { id: 'claude', name: 'Claude', buildUrl: (q) => `https://claude.ai/new?q=${q}` },
  { id: 'chatgpt', name: 'ChatGPT', buildUrl: (q) => `https://chatgpt.com/?q=${q}` },
  { id: 'gemini', name: 'Gemini', buildUrl: () => `https://gemini.google.com/app` },
];

/**
 * Builds the prompt sent to whichever AI the visitor picks. Takes the page's
 * own current URL at call time (rather than a hardcoded domain, which isn't
 * recorded anywhere in this repo and would be wrong the moment the site
 * moves) so the link always points the AI at wherever this page is actually
 * live. Deliberately asks for a critical, informed read rather than blind
 * praise — evaluate strengths using only what's on the page, the way a
 * skeptical prospective user would.
 */
export function buildAskAiPrompt(pageUrl: string): string {
  return (
    "Please read the Walkthrough AI landing page at the URL below, then give me your honest, " +
    "informed opinion of the product based only on what's actually on that page — what looks " +
    "genuinely useful, what's still unproven, and who it would and wouldn't be a good fit for. " +
    "Don't just praise it; be critical where it's warranted. " +
    `URL: ${pageUrl}`
  );
}
