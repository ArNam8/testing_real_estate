/**
 * DocumentViewer.tsx
 * Renders AI-generated property documents in a clean, readable format.
 *
 * Each document type (listing_pack, inspection_notes, etc.) has its own
 * layout component so agents can actually read and copy the content.
 * The raw formatOutput() text dump is replaced with structured rendering:
 *   - Listing Pack:           description block, fact sheet grid, bullets, room list
 *   - Inspection Notes:       room-by-room cards with flags
 *   - Client Summary:         sections for preferences/likes/dislikes/next steps
 *   - Offer Summary:          key-value pairs with disclaimer
 *   - Transaction Timeline:   milestone checklist
 *   - Disclosure Prep:        issue cards with severity + seller prompts
 *
 * "Not mentioned" values are rendered as a subtle badge rather than dead text,
 * so agents can immediately see what's missing vs what was confirmed.
 */

import { useCallback, useState } from 'react';
import { Copy, AlertTriangle, CheckCircle2, Clock, Flag } from 'lucide-react';

// ─── Shared primitives ────────────────────────────────────────────────────────

/** Shows a subtle "not mentioned" badge for missing fields. */
function NotMentioned() {
  return (
    <span className="inline-block text-[11px] font-medium text-slate-300 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
      not mentioned
    </span>
  );
}

/** Returns true if a value is the "not mentioned" sentinel. */
function isMissing(v: unknown): boolean {
  if (!v) return true;
  if (typeof v === 'string') return v.trim().toLowerCase() === 'not mentioned' || v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Renders a value — swaps "not mentioned" for the badge. */
function Value({ v }: { v: unknown }) {
  if (isMissing(v)) return <NotMentioned />;
  if (Array.isArray(v)) return <span>{(v as unknown[]).join(', ')}</span>;
  return <span>{String(v)}</span>;
}

/** Section header inside a document card. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 mt-4 first:mt-0">
      {children}
    </p>
  );
}

/** Copy-to-clipboard button. */
export function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(() => {
    navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [getText]);
  return (
    <button
      onClick={handle}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        copied ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >
      <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ─── Listing Pack ─────────────────────────────────────────────────────────────

interface ListingPackData {
  description?: string;
  feature_bullets?: string[];
  room_breakdown?: { room: string; details: string }[];
  highlights?: string[];
  fact_sheet?: {
    beds?: string; baths?: string; sqft?: string;
    year_built?: string; lot?: string; style?: string;
  };
}

export function ListingPackView({ data }: { data: ListingPackData }) {
  const fs = data.fact_sheet ?? {};
  const facts = [
    { label: 'Beds',       value: fs.beds },
    { label: 'Baths',      value: fs.baths },
    { label: 'Sqft',       value: fs.sqft },
    { label: 'Year built', value: fs.year_built },
    { label: 'Lot',        value: fs.lot },
    { label: 'Style',      value: fs.style },
  ];

  return (
    <div className="space-y-4">
      {/* Fact sheet grid */}
      <div>
        <SectionLabel>Property Details</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {facts.map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-slate-400 font-medium mb-0.5">{label}</p>
              <p className="text-sm font-bold text-slate-800">
                {isMissing(value) ? <NotMentioned /> : value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Description */}
      {!isMissing(data.description) && (
        <div>
          <SectionLabel>Listing Description</SectionLabel>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {data.description}
          </p>
        </div>
      )}

      {/* Highlights */}
      {Array.isArray(data.highlights) && data.highlights.length > 0 && !isMissing(data.highlights) && (
        <div>
          <SectionLabel>Highlights</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {data.highlights.map((h, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full text-xs font-medium text-teal-800 border border-teal-200"
                style={{ background: '#f0faf6' }}
              >
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Feature bullets */}
      {Array.isArray(data.feature_bullets) && data.feature_bullets.length > 0 && (
        <div>
          <SectionLabel>Features</SectionLabel>
          <ul className="space-y-1">
            {data.feature_bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                {isMissing(b) ? <NotMentioned /> : b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Room breakdown */}
      {Array.isArray(data.room_breakdown) && data.room_breakdown.length > 0 && (
        <div>
          <SectionLabel>Room Breakdown</SectionLabel>
          <div className="space-y-2">
            {data.room_breakdown.map((r, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                <span className="text-xs font-bold text-slate-800 w-28 flex-shrink-0">{r.room}</span>
                <span className="text-xs text-slate-500 leading-relaxed">
                  {isMissing(r.details) ? <NotMentioned /> : r.details}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inspection Notes ─────────────────────────────────────────────────────────

interface InspectionRoom {
  name: string;
  condition?: string;
  observations?: string;
  maintenance_flags?: string[];
  photo_suggestions?: string[];
}

interface InspectionNotesData {
  rooms?: InspectionRoom[];
  structural_notes?: string;
  cosmetic_notes?: string;
  maintenance_summary?: string[];
}

function conditionColor(condition: string | undefined): string {
  if (!condition || isMissing(condition)) return 'bg-slate-50 text-slate-400';
  const c = condition.toLowerCase();
  if (c.includes('good') || c.includes('excellent')) return 'bg-teal-50 text-teal-700';
  if (c.includes('fair') || c.includes('average')) return 'bg-amber-50 text-amber-700';
  if (c.includes('attention') || c.includes('poor') || c.includes('needs')) return 'bg-red-50 text-red-700';
  return 'bg-slate-50 text-slate-500';
}

export function InspectionNotesView({ data }: { data: InspectionNotesData }) {
  return (
    <div className="space-y-4">
      {/* Room cards */}
      {Array.isArray(data.rooms) && data.rooms.length > 0 && (
        <div>
          <SectionLabel>Room-by-Room</SectionLabel>
          <div className="space-y-3">
            {data.rooms.map((r, i) => (
              <div key={i} className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-800">{r.name}</span>
                  {r.condition && !isMissing(r.condition) && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${conditionColor(r.condition)}`}>
                      {r.condition}
                    </span>
                  )}
                </div>
                {!isMissing(r.observations) && (
                  <p className="text-xs text-slate-600 leading-relaxed mb-2">{r.observations}</p>
                )}
                {Array.isArray(r.maintenance_flags) && r.maintenance_flags.filter(f => !isMissing(f)).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.maintenance_flags.filter(f => !isMissing(f)).map((flag, fi) => (
                      <span key={fi} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        <Flag size={9} /> {flag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structural / cosmetic notes */}
      {!isMissing(data.structural_notes) && (
        <div>
          <SectionLabel>Structural Notes</SectionLabel>
          <p className="text-sm text-slate-700 leading-relaxed">{data.structural_notes}</p>
        </div>
      )}
      {!isMissing(data.cosmetic_notes) && (
        <div>
          <SectionLabel>Cosmetic Notes</SectionLabel>
          <p className="text-sm text-slate-700 leading-relaxed">{data.cosmetic_notes}</p>
        </div>
      )}

      {/* Maintenance summary */}
      {Array.isArray(data.maintenance_summary) && data.maintenance_summary.filter(s => !isMissing(s)).length > 0 && (
        <div>
          <SectionLabel>Maintenance Items</SectionLabel>
          <ul className="space-y-1">
            {data.maintenance_summary.filter(s => !isMissing(s)).map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Client Summary ───────────────────────────────────────────────────────────

interface ClientSummaryData {
  /** Always present — who this property would suit and why. Generated from property features. */
  property_appeal?: string;
  /** Key selling points pulled from highlights/features. */
  standout_features?: string[];
  /** Issues/concerns a buyer should be aware of. */
  potential_concerns?: string[];
  /** Optional — only populated if a client was present during the walkthrough. */
  client_reactions?: {
    likes?: string[];
    dislikes?: string[];
    budget_indicators?: string;
    next_steps?: string[];
  };
  /** Legacy fields — kept for backward compatibility with older saved properties. */
  preferences?: string[];
  priorities?: string[];
  likes?: string[];
  dislikes?: string[];
  budget_indicators?: string;
  next_steps?: string[];
}

export function ClientSummaryView({ data }: { data: ClientSummaryData }) {
  // Support both new schema (property_appeal) and legacy schema (preferences/likes)
  const reactions = data.client_reactions ?? {};
  const legacyLikes    = data.likes ?? [];
  const legacyDislikes = data.dislikes ?? [];
  const legacyNextSteps = data.next_steps ?? [];
  const legacyBudget   = data.budget_indicators;

  const allLikes    = [...(reactions.likes ?? []), ...legacyLikes].filter(s => !isMissing(s));
  const allDislikes = [...(reactions.dislikes ?? []), ...legacyDislikes].filter(s => !isMissing(s));
  const allNext     = [...(reactions.next_steps ?? []), ...legacyNextSteps].filter(s => !isMissing(s));
  const budget      = reactions.budget_indicators ?? legacyBudget;

  const standout    = (data.standout_features ?? []).filter(s => !isMissing(s));
  const concerns    = (data.potential_concerns ?? []).filter(s => !isMissing(s));

  const hasClientSection = allLikes.length > 0 || allDislikes.length > 0 || allNext.length > 0 || !isMissing(budget);

  return (
    <div className="space-y-4">
      {/* Property appeal — always shown if present */}
      {!isMissing(data.property_appeal) && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
          <p className="text-sm text-slate-700 leading-relaxed">{data.property_appeal}</p>
        </div>
      )}

      {/* Standout features */}
      {standout.length > 0 && (
        <div>
          <SectionLabel>Standout Features</SectionLabel>
          <ul className="space-y-1.5">
            {standout.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#6FAF9A' }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Potential concerns */}
      {concerns.length > 0 && (
        <div>
          <SectionLabel>Potential Concerns</SectionLabel>
          <ul className="space-y-1.5">
            {concerns.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Client reactions — only shown when data exists */}
      {hasClientSection && (
        <div className="border-t border-slate-100 pt-4">
          <SectionLabel>Client Reactions</SectionLabel>
          <div className="space-y-3 mt-2">
            {allLikes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">Liked</p>
                <ul className="space-y-1">
                  {allLikes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#6FAF9A' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {allDislikes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">Concerns</p>
                <ul className="space-y-1">
                  {allDislikes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!isMissing(budget) && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">Budget</p>
                <p className="text-sm text-slate-700">{budget}</p>
              </div>
            )}
            {allNext.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">Next Steps</p>
                <ul className="space-y-1">
                  {allNext.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#1e3a5f' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Offer Summary ────────────────────────────────────────────────────────────

interface OfferSummaryData {
  offer_price?: string;
  deposit?: string;
  financing_type?: string;
  closing_date?: string;
  response_deadline?: string;
  contingencies?: string[];
  special_conditions?: string[];
  summary_note?: string;
  disclaimer?: string;
  /** Legacy field — kept for backward compatibility */
  amount?: string;
  conditions?: string[];
  timelines?: string;
  financing_notes?: string;
}

export function OfferSummaryView({ data }: { data: OfferSummaryData }) {
  // Support both new schema and legacy field names
  const rows = [
    { label: 'Offer Price',        value: data.offer_price ?? data.amount },
    { label: 'Deposit',            value: data.deposit },
    { label: 'Financing',          value: data.financing_type ?? data.financing_notes },
    { label: 'Closing Date',       value: data.closing_date ?? data.timelines },
    { label: 'Response Deadline',  value: data.response_deadline },
  ];

  const contingencies    = [...(data.contingencies ?? [])].filter(c => !isMissing(c));
  const specialConditions = [...(data.special_conditions ?? []), ...(data.conditions ?? [])].filter(c => !isMissing(c));

  return (
    <div className="space-y-4">
      {/* Summary note — plain English overview */}
      {!isMissing(data.summary_note) && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
          <p className="text-sm text-slate-700 leading-relaxed">{data.summary_note}</p>
        </div>
      )}

      {/* Key figures table */}
      <div className="grid grid-cols-1 gap-2">
        {rows.filter(r => !isMissing(r.value)).map(({ label, value }) => (
          <div key={label} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
            <span className="text-xs font-bold text-slate-500 w-36 flex-shrink-0">{label}</span>
            <span className="text-sm text-slate-800"><Value v={value} /></span>
          </div>
        ))}
      </div>

      {contingencies.length > 0 && (
        <div>
          <SectionLabel>Contingencies</SectionLabel>
          <ul className="space-y-1">
            {contingencies.map((c, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-300 flex-shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {specialConditions.length > 0 && (
        <div>
          <SectionLabel>Special Conditions</SectionLabel>
          <ul className="space-y-1">
            {specialConditions.map((c, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-300 flex-shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.disclaimer && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
          <p className="text-[11px] text-amber-700 leading-relaxed">{data.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

// ─── Transaction Timeline ─────────────────────────────────────────────────────

interface TimelineMilestone {
  step: string;
  status?: string;
  date?: string;
  notes?: string;
}

interface TransactionTimelineData {
  milestones?: TimelineMilestone[];
  missing_items?: string[];
  overall_status?: string;
}

export function TransactionTimelineView({ data }: { data: TransactionTimelineData }) {
  return (
    <div className="space-y-4">
      {!isMissing(data.overall_status) && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
          <SectionLabel>Overall Status</SectionLabel>
          <p className="text-sm text-slate-700">{data.overall_status}</p>
        </div>
      )}

      {Array.isArray(data.milestones) && data.milestones.length > 0 && (
        <div>
          <SectionLabel>Milestones</SectionLabel>
          <div className="space-y-2">
            {data.milestones.map((m, i) => {
              const isDone = m.status?.toLowerCase() === 'complete';
              return (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                  <div className="mt-0.5 flex-shrink-0">
                    {isDone
                      ? <CheckCircle2 size={16} className="text-teal-500" />
                      : <Clock size={16} className="text-slate-300" />
                    }
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${isDone ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                      {m.step}
                    </p>
                    {!isMissing(m.date) && (
                      <p className="text-xs text-slate-400">{m.date}</p>
                    )}
                    {!isMissing(m.notes) && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{m.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Array.isArray(data.missing_items) && data.missing_items.filter(s => !isMissing(s)).length > 0 && (
        <div>
          <SectionLabel>Outstanding Items</SectionLabel>
          <ul className="space-y-1">
            {data.missing_items.filter(s => !isMissing(s)).map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Disclosure Prep ──────────────────────────────────────────────────────────

interface DisclosureIssue {
  issue: string;
  severity?: string;
  seller_prompt?: string;
}

interface DisclosurePrepData {
  observed_issues?: DisclosureIssue[];
  areas_requiring_confirmation?: string[];
  disclaimer?: string;
}

export function DisclosurePrepView({ data }: { data: DisclosurePrepData }) {
  const hasIssues = Array.isArray(data.observed_issues) &&
    data.observed_issues.filter(i => !isMissing(i.issue)).length > 0;

  return (
    <div className="space-y-4">
      {hasIssues && (
        <div>
          <SectionLabel>Observed Issues</SectionLabel>
          <div className="space-y-3">
            {data.observed_issues!.filter(i => !isMissing(i.issue)).map((issue, i) => (
              <div key={i} className="bg-red-50 border border-red-100 rounded-xl p-3">
                <div className="flex items-start gap-2 mb-2">
                  <Flag size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-semibold text-slate-800">{issue.issue}</p>
                </div>
                {!isMissing(issue.seller_prompt) && (
                  <div className="ml-5">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">
                      Ask seller:
                    </p>
                    <p className="text-xs text-slate-600 italic leading-relaxed">
                      "{issue.seller_prompt}"
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(data.areas_requiring_confirmation) &&
       data.areas_requiring_confirmation.filter(s => !isMissing(s)).length > 0 && (
        <div>
          <SectionLabel>Areas Requiring Confirmation</SectionLabel>
          <ul className="space-y-1">
            {data.areas_requiring_confirmation.filter(s => !isMissing(s)).map((area, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-300 flex-shrink-0" />
                {area}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.disclaimer && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
          <p className="text-[11px] text-amber-700 leading-relaxed">{data.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

// ─── Plain text export ────────────────────────────────────────────────────────

/**
 * Converts any document data to plain text for clipboard copying.
 * Skips "not mentioned" values so the copied text is clean.
 */
function stringify(val: unknown, indent = 0): string {
  if (isMissing(val)) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    return val
      .map(item => stringify(item, indent))
      .filter(Boolean)
      .map(s => `${'  '.repeat(indent)}- ${s}`)
      .join('\n');
  }
  if (typeof val === 'object' && val !== null) {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => {
        const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const body = stringify(v, indent + 1);
        if (!body) return '';
        const isMultiline = body.includes('\n');
        return isMultiline ? `${label}:\n${body}` : `${label}: ${body}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function documentToText(data: unknown): string {
  return stringify(data);
}
