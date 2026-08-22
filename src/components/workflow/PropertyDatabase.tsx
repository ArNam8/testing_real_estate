import { useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronLeft, Loader2, Save } from 'lucide-react';
import { propertiesService } from '../../services/supabase';
import type { DocumentManifestEntry, FactSource, Property } from '../../services/supabase';

interface PropertyDatabaseProps {
  property: Property;
  onSaved: (property: Property) => void;
  onClose: () => void;
}

type Field = { value?: unknown; confidence?: number; source?: FactSource; note?: string };
type Data = Record<string, unknown>;

const FACT_FIELDS = [
  ['beds', 'Bedrooms'], ['baths', 'Bathrooms'], ['sqft', 'Square footage'],
  ['year_built', 'Year built'], ['lot', 'Lot size'], ['style', 'Property style'],
  ['price_range', 'Price / range'],
] as const;

const OUTPUT_AFFECTS: Record<string, string[]> = {
  listing_pack: ['fact_sheet', 'rooms', 'features', 'renovations', 'issues', 'highlights', 'general_summary'],
  inspection_notes: ['rooms', 'issues', 'renovations'],
  client_summary: ['fact_sheet', 'rooms', 'features', 'highlights', 'client_notes', 'general_summary'],
  offer_summary: ['offer_notes'],
  transaction_timeline: ['transaction_notes'],
  disclosure_prep: ['issues', 'renovations', 'general_summary'],
};

function cloneData(value: unknown): Data { return JSON.parse(JSON.stringify(value ?? {})); }
function fieldAt(data: Data, path: string): Field {
  const value = path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, data);
  return value && typeof value === 'object' && 'value' in value ? value as Field : { value: '' };
}
function setFieldAt(data: Data, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = data;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const existing = current[parts[i]];
    if (existing && typeof existing === 'object') current = existing as Record<string, unknown>;
    else { const next: Data = {}; current[parts[i]] = next; current = next; }
  }
  const key = parts[parts.length - 1];
  const existing = current[key] && typeof current[key] === 'object' ? current[key] as Record<string, unknown> : {};
  current[key] = { ...existing, value, confidence: 100, source: 'user_confirmed', note: 'Edited in Property Facts & Sources' };
}
function asText(value: unknown): string { return Array.isArray(value) ? value.join('\n') : value === 'not mentioned' || value == null ? '' : String(value); }
function asList(value: string): string[] { return value.split('\n').map((item) => item.trim()).filter(Boolean); }
function sourceLabel(source?: FactSource, hasValue = false): string {
  if (!source && hasValue) return 'Captured';
  return ({ observed: 'Observed', seller_stated: 'Seller stated', agent_stated: 'Agent stated', user_confirmed: 'Confirmed', external_document: 'Document', unverified: 'Unverified', conflicting: 'Conflict', unknown: 'Not provided' } as Record<string, string>)[source ?? 'unknown'];
}

function changedTopLevelFields(before: Data, after: Data): string[] {
  const paths = ['rooms', 'fact_sheet', 'features', 'renovations', 'issues', 'highlights', 'client_notes', 'offer_notes', 'transaction_notes', 'general_summary'];
  return paths.filter((path) => JSON.stringify(before?.[path]) !== JSON.stringify(after?.[path]));
}

function affectedManifest(property: Property, changed: string[], nextVersion: number): Record<string, DocumentManifestEntry> {
  const current = (property.document_manifest ?? {}) as Record<string, DocumentManifestEntry>;
  const affected = new Set(Object.entries(OUTPUT_AFFECTS).filter(([, paths]) => changed.some((path) => paths.includes(path))).map(([output]) => output));
  const next: Record<string, DocumentManifestEntry> = { ...current };
  for (const [output, path] of Object.entries(property.document_paths ?? {})) {
    if (!next[output]) next[output] = { status: 'generated', path, data_version: property.document_data_versions?.[output] ?? 1 };
  }
  for (const [output, entry] of Object.entries(next)) {
    if (affected.has(output) && entry.status === 'generated') next[output] = { ...entry, status: 'outdated', data_version: nextVersion };
  }
  return next;
}

function TextField({ label, path, data, onChange }: { label: string; path: string; data: Data; onChange: (path: string, value: string) => void }) {
  const field = fieldAt(data, path);
  return <div><div className="flex items-center justify-between gap-2 mb-1"><label className="label !mb-0">{label}</label><span className="text-[10px] text-slate-400">{sourceLabel(field.source, field.value !== '' && field.value !== 'not mentioned' && field.value != null && (!Array.isArray(field.value) || field.value.length > 0))}</span></div><input className="input-field text-sm" value={asText(field.value)} placeholder="Not provided" onChange={(e) => onChange(path, e.target.value)} /></div>;
}

function ListField({ label, path, data, onChange }: { label: string; path: string; data: Data; onChange: (path: string, value: string[]) => void }) {
  const field = fieldAt(data, path);
  return <div><div className="flex items-center justify-between gap-2 mb-1"><label className="label !mb-0">{label}</label><span className="text-[10px] text-slate-400">{sourceLabel(field.source, field.value !== '' && field.value !== 'not mentioned' && field.value != null && (!Array.isArray(field.value) || field.value.length > 0))}</span></div><textarea className="input-field text-sm min-h-[84px]" value={asText(field.value)} placeholder="One item per line" onChange={(e) => onChange(path, asList(e.target.value))} /></div>;
}

export function PropertyDatabase({ property, onSaved, onClose }: PropertyDatabaseProps) {
  const initial = useMemo(() => cloneData(property.extraction_data), [property.extraction_data]);
  const [draft, setDraft] = useState<Data>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const update = (path: string, value: unknown) => setDraft((current) => { const next = cloneData(current); setFieldAt(next, path, value); return next; });
  const changed = changedTopLevelFields(initial, draft);
  const hasChanges = changed.length > 0;

  async function handleSave() {
    if (!hasChanges) { setSaved(true); return; }
    setSaving(true); setSaveError(null); setSaved(false);
    try {
      const nextVersion = Math.max(1, property.property_data_version ?? 1) + 1;
      const manifest = affectedManifest(property, changed, nextVersion);
      const next = await propertiesService.savePropertyFacts(property.id, draft, property.property_data_version ?? 1, manifest);
      onSaved(next); setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save property information.');
    } finally { setSaving(false); }
  }

  const roomsField = fieldAt(draft, 'rooms');
  const rooms = Array.isArray(roomsField.value) ? roomsField.value as Data[] : [];
  return (
    <section className="card p-4 sm:p-6 mb-6 animate-slide-down" aria-label="Property Facts & Sources">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div><button onClick={onClose} className="btn-ghost !px-0 !justify-start text-slate-400 mb-2"><ChevronLeft size={15} /> Back to documents</button><h2 className="text-xl font-bold" style={{ color: '#1a2e45' }}>Property facts &amp; sources</h2><p className="text-sm text-slate-500 mt-1 max-w-xl">Review anything that needs correcting. Saving a change marks only the related documents for an optional update.</p></div>
        <span className="hidden sm:inline-flex badge" style={{ background: 'rgba(111,175,154,0.12)', color: '#1F7A52' }}>Optional</span>
      </div>
      {saveError && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2"><AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" /><p className="text-red-700 text-xs leading-relaxed">{saveError}</p></div>}
      {saved && <div className="mb-4 p-3 rounded-xl bg-teal-50 border border-teal-200 flex items-center gap-2"><Check size={15} className="text-teal-600" /><p className="text-teal-700 text-xs">Saved. Related documents now show an update available.</p></div>}

      <div className="mb-5"><p className="section-title">Core property facts</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{FACT_FIELDS.map(([key, label]) => <TextField key={key} label={label} path={`fact_sheet.${key}`} data={draft} onChange={update} />)}</div></div>
      <div className="border-t border-slate-100 pt-5 mb-5"><p className="section-title">Property details</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><ListField label="Key features" path="features" data={draft} onChange={update} /><ListField label="Renovations & upgrades" path="renovations" data={draft} onChange={update} /><ListField label="Issues & maintenance" path="issues" data={draft} onChange={update} /><ListField label="Highlights" path="highlights" data={draft} onChange={update} /></div></div>

      <button onClick={() => setShowMore((value) => !value)} className="btn-ghost !px-0 !justify-start text-slate-500 mb-3">{showMore ? 'Hide additional details' : 'Show rooms and additional details'} <ChevronDown size={15} className={showMore ? 'rotate-180' : ''} /></button>
      {showMore && <div className="border-t border-slate-100 pt-5 mb-5 space-y-5"><div><p className="section-title">Rooms</p>{rooms.length === 0 && <p className="text-sm text-slate-400">No rooms were captured.</p>}{rooms.map((_room, index) => <div className="border-b border-slate-100 pb-4 mb-4" key={index}><p className="text-sm font-semibold text-slate-700 mb-3">Room {index + 1}</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><TextField label="Name" path={`rooms.value.${index}.name`} data={draft} onChange={update} /><TextField label="Condition" path={`rooms.value.${index}.condition`} data={draft} onChange={update} /><TextField label="Observations" path={`rooms.value.${index}.observations`} data={draft} onChange={update} /><TextField label="Dimensions" path={`rooms.value.${index}.dimensions`} data={draft} onChange={update} /><TextField label="Flooring" path={`rooms.value.${index}.flooring`} data={draft} onChange={update} /></div></div>)}</div><div><p className="section-title">Overall summary</p><TextField label="General summary" path="general_summary" data={draft} onChange={update} /></div><div><p className="section-title">Client notes</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><ListField label="Preferences" path="client_notes.preferences" data={draft} onChange={update} /><ListField label="Priorities" path="client_notes.priorities" data={draft} onChange={update} /><ListField label="Likes" path="client_notes.likes" data={draft} onChange={update} /><ListField label="Dislikes" path="client_notes.dislikes" data={draft} onChange={update} /><TextField label="Budget indicators" path="client_notes.budget_indicators" data={draft} onChange={update} /><ListField label="Next steps" path="client_notes.next_steps" data={draft} onChange={update} /></div></div><div><p className="section-title">Offer & transaction notes</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><TextField label="Offer amount" path="offer_notes.amount" data={draft} onChange={update} /><TextField label="Offer timeline" path="offer_notes.timelines" data={draft} onChange={update} /><TextField label="Financing" path="offer_notes.financing_notes" data={draft} onChange={update} /><ListField label="Conditions" path="offer_notes.conditions" data={draft} onChange={update} /><ListField label="Contingencies" path="offer_notes.contingencies" data={draft} onChange={update} /><TextField label="Transaction status" path="transaction_notes.overall_status" data={draft} onChange={update} /><ListField label="Missing items" path="transaction_notes.missing_items" data={draft} onChange={update} /></div></div></div>}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2"><button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> {hasChanges ? 'Save changes' : 'Save'}</>}</button><button onClick={onClose} className="btn-ghost">Cancel</button></div>
    </section>
  );
}
