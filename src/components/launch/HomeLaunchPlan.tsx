/**
 * V84 design direction: the agent finishes the familiar five-step workflow first.
 * This is an optional, calm continuation—not a second dashboard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Eye, Link2, Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { launchPlanService } from '../../services/supabase';
import type { HomeLaunchPlan, HomeLaunchTask, Property, SellerContact } from '../../services/supabase';
import { SellerPortalPreview } from './SellerPortal';

type DraftTask = Omit<Pick<HomeLaunchTask, 'id' | 'category' | 'title' | 'why_it_matters' | 'mandatory' | 'requires_upload' | 'requires_review' | 'due_date'>, 'id'> & { id?: string };
type Screen = 'drafting' | 'review' | 'preview' | 'send';
const labels: Record<DraftTask['category'], { title: string; color: string; tint: string }> = {
  fix: { title: 'Fix before launch', color: '#A34C36', tint: '#F8E6E0' },
  prepare: { title: 'Prepare the home', color: '#326851', tint: '#E6F2EA' },
  proof: { title: 'Prove and confirm', color: '#1E3A5F', tint: '#E8EEF5' },
  access: { title: 'Access and showings', color: '#6A557A', tint: '#F0EAF5' },
};

function TinyStep({ current, title }: { current: number; title: string }) {
  return <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: '#6F7D8E' }}><span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] text-white" style={{ background: '#1E3A5F' }}>{current}</span><span>{title}</span><span className="text-slate-300">·</span><span>Step {current} of 3</span></div>;
}

export function HomeLaunchPlan({ property, agentId, onBack, previewTasks }: { property: Property; agentId: string; onBack: () => void; previewTasks?: DraftTask[] }) {
  const [plan, setPlan] = useState<HomeLaunchPlan | null>(null);
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [screen, setScreen] = useState<Screen>(previewTasks ? 'review' : 'drafting');
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [intro, setIntro] = useState('I’ve put together a simple plan to help your home look its best before it goes live. Complete what you can, and tell me where you need help.');
  const [targetDate, setTargetDate] = useState('');
  const [contacts, setContacts] = useState<SellerContact[]>([]);
  const [contactId, setContactId] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const startedDraft = useRef(false);

  const previewData = useMemo(() => ({
    address: property.address,
    agent_intro: intro,
    launch_target_date: targetDate || null,
    tasks: tasks.map((task, index) => ({ ...task, id: task.id || `preview-${index}`, plan_id: plan?.id ?? '', agent_id: agentId, display_order: index, seller_status: 'not_started' as const, seller_completion_date: null, seller_note: null, agent_review_status: 'pending' as const })),
  }), [property.address, intro, targetDate, tasks, plan?.id, agentId]);
  const requiredCount = tasks.filter((task) => task.mandatory).length;
  const grouped = useMemo(() => (['fix', 'prepare', 'proof', 'access'] as DraftTask['category'][]).map((category) => ({ category, tasks: tasks.map((task, index) => ({ task, index })).filter(({ task }) => task.category === category) })).filter((group) => group.tasks.length > 0), [tasks]);

  const createDraft = useCallback(async () => {
    setScreen('drafting'); setError('');
    try {
      const next = await launchPlanService.generateDraft(property.id);
      setTasks(next.map((task) => ({ ...task, due_date: null })));
      setScreen('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a Home Launch draft.');
    }
  }, [property.id]);

  const load = useCallback(async () => {
    try {
      const [nextPlan, nextContacts] = await Promise.all([launchPlanService.getOrCreatePlan(agentId, property.id), launchPlanService.listContacts()]);
      const nextTasks = await launchPlanService.listTasks(nextPlan.id);
      setPlan(nextPlan); setContacts(nextContacts); setContactId(nextPlan.seller_contact_id ?? ''); setIntro(nextPlan.agent_intro || intro); setTargetDate(nextPlan.launch_target_date ?? '');
      if (nextTasks.length) { setTasks(nextTasks); setScreen('review'); }
      else if (!startedDraft.current) { startedDraft.current = true; await createDraft(); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not open the Home Launch Plan.'); }
  // The initial agent introduction is intentionally only used if this plan has not been saved.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, property.id, createDraft]);
  useEffect(() => {
    if (previewTasks) { setTasks(previewTasks); setScreen('review'); return; }
    load();
  }, [load, previewTasks]);

  const savePlan = async (): Promise<HomeLaunchTask[] | null> => {
    if (!plan) return null;
    setSaving(true); setError('');
    try {
      await launchPlanService.updatePlan(plan.id, { seller_contact_id: contactId || null, agent_intro: intro, launch_target_date: targetDate || null });
      const saved = await launchPlanService.saveTasks(agentId, plan.id, tasks);
      setTasks(saved);
      return saved;
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save this plan.'); return null; }
    finally { setSaving(false); }
  };
  const updateTask = (index: number, patch: Partial<DraftTask>) => setTasks((all) => all.map((task, taskIndex) => taskIndex === index ? { ...task, ...patch } : task));
  const addTask = () => { setTasks((all) => [...all, { category: 'prepare', title: 'Add a seller task', why_it_matters: 'Explain why this will help the home launch well.', mandatory: false, requires_upload: false, requires_review: true, due_date: null }]); setOpenTask(tasks.length); };
  const createContact = async () => { if (!newContact.trim()) return; try { const contact = await launchPlanService.createContact(agentId, newContact, newEmail); setContacts((all) => [contact, ...all]); setContactId(contact.id); setNewContact(''); setNewEmail(''); } catch (err) { setError(err instanceof Error ? err.message : 'Could not add seller.'); } };
  const createLink = async () => { if (!plan || !contactId) { setError('Choose the seller before creating their private link.'); return; } const saved = await savePlan(); if (!saved) return; try { const created = await launchPlanService.createSellerLink(agentId, plan.id); setLink(`${window.location.origin}/seller/${created.rawToken}`); } catch (err) { setError(err instanceof Error ? err.message : 'Could not create private Seller Link.'); } };
  const copyLink = async () => { try { await navigator.clipboard.writeText(link); } catch { window.prompt('Copy this private Seller Link:', link); } };

  if (screen === 'drafting') return <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F5F4F0' }}><style>{`@media (prefers-reduced-motion:no-preference){.launch-orb{animation:launch-orb 1.6s ease-in-out infinite}@keyframes launch-orb{50%{transform:scale(1.08);opacity:.75}}}`}</style><div className="max-w-md text-center"><div className="launch-orb w-16 h-16 mx-auto rounded-3xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#E6F2EA,#E8EEF5)', color: '#1E3A5F' }}><Sparkles size={27} /></div><p className="mt-7 text-xs font-bold uppercase tracking-[.16em]" style={{ color: '#6F7D8E' }}>Home Launch Plan</p><h1 className="mt-2 text-2xl font-bold" style={{ color: '#15263A' }}>Turning the walkthrough into a simple seller plan.</h1><p className="mt-3 text-sm leading-relaxed" style={{ color: '#708094' }}>Looking for the most useful prep, proof, and confirmation requests—then you will decide what to send.</p>{error && <div className="mt-5"><p className="text-sm" style={{ color: '#A34C36' }}>{error}</p><button onClick={createDraft} className="mt-3 px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#1E3A5F' }}>Try again</button></div>}</div></div>;

  if (screen === 'preview') return <div><div className="fixed z-50 top-4 left-1/2 -translate-x-1/2 w-[min(94%,760px)] flex items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-xl" style={{ background: '#15263A', color: 'white' }}><div><TinyStep current={2} title="Preview seller plan" /><p className="text-[11px] text-white/60 mt-1">This is exactly what the seller sees.</p></div><button onClick={() => setScreen('review')} className="px-3 py-2 rounded-xl text-xs font-bold bg-white/10">Back to edit</button></div><SellerPortalPreview data={previewData} /><button onClick={() => setScreen('send')} className="fixed z-50 bottom-5 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-sm font-bold text-white shadow-xl" style={{ background: '#326851' }}>Looks good — create Seller Link <ChevronRight size={16} className="inline" /></button></div>;

  if (screen === 'send') return <div className="min-h-screen" style={{ background: '#F5F4F0' }}><main className="max-w-xl mx-auto px-5 py-10"><button onClick={() => setScreen('preview')} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600"><ArrowLeft size={16} /> Back to preview</button><div className="mt-8 rounded-3xl p-7" style={{ background: '#FCFBF8', border: '1px solid rgba(30,58,95,.10)', boxShadow: '0 10px 28px rgba(15,39,64,.07)' }}><TinyStep current={3} title="Create Seller Link" /><div className="mt-6 w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#E6F2EA', color: '#326851' }}><Link2 size={22} /></div><h1 className="mt-5 text-2xl font-bold" style={{ color: '#15263A' }}>{link ? 'The seller plan is ready.' : 'Choose the seller, then create their private link.'}</h1><p className="mt-2 text-sm leading-relaxed" style={{ color: '#708094' }}>{link ? 'Copy this link and share it however you normally communicate. Walkthrough will not send anything automatically.' : 'They will see only the simple checklist you just previewed.'}</p>{!link && <><label className="block mt-6 text-xs font-bold" style={{ color: '#536273' }}>Seller</label><select value={contactId} onChange={(event) => setContactId(event.target.value)} className="mt-2 w-full rounded-xl px-3 py-3 text-sm border" style={{ borderColor: 'rgba(30,58,95,.15)' }}><option value="">Choose seller…</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.email ? ` · ${contact.email}` : ''}</option>)}</select><div className="mt-3 grid sm:grid-cols-2 gap-2"><input value={newContact} onChange={(event) => setNewContact(event.target.value)} placeholder="Or add seller name" className="rounded-xl px-3 py-2.5 text-sm border" /><input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="Email (optional)" className="rounded-xl px-3 py-2.5 text-sm border" /></div><button onClick={createContact} disabled={!newContact.trim()} className="mt-2 text-xs font-bold disabled:opacity-40" style={{ color: '#1E3A5F' }}><Plus size={13} className="inline" /> Add seller</button><button onClick={createLink} disabled={saving || !contactId} className="mt-6 w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-45" style={{ background: '#1E3A5F' }}>{saving ? 'Creating…' : 'Create private Seller Link'}</button></>}{link && <><div className="mt-6 rounded-2xl p-4 break-all text-xs" style={{ background: '#E6F2EA', color: '#326851' }}>{link}</div><button onClick={copyLink} className="mt-3 w-full py-3 rounded-2xl text-sm font-bold text-white" style={{ background: '#326851' }}>Copy Seller Link</button><div className="mt-6 flex gap-3 rounded-2xl p-4" style={{ background: '#E8EEF5' }}><ShieldCheck size={18} className="flex-shrink-0" style={{ color: '#1E3A5F' }} /><p className="text-xs leading-relaxed" style={{ color: '#496887' }}>When the seller acts, you receive clear notices. Their updates are never silently treated as confirmed listing facts.</p></div></>}{error && <p className="mt-4 text-sm" style={{ color: '#A34C36' }}>{error}</p>}</div></main></div>;

  return <div className="min-h-screen pb-16" style={{ background: '#F5F4F0' }}><style>{`@media (prefers-reduced-motion:no-preference){.launch-card{animation:launch-in 360ms cubic-bezier(.23,1,.32,1) both}@keyframes launch-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}}`}</style><div className="top-bar"><div className="top-bar-inner"><button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600"><ArrowLeft size={16} /> Back to documents</button><span className="text-xs font-semibold" style={{ color: '#326851' }}>Optional listing continuation</span></div></div><main className="mt-topbar max-w-3xl mx-auto px-5 pt-8"><TinyStep current={1} title="Review AI draft" /><h1 className="mt-5 text-3xl font-bold tracking-tight" style={{ color: '#15263A' }}>Get the house ready—without the back-and-forth.</h1><p className="mt-3 text-sm leading-relaxed max-w-xl" style={{ color: '#708094' }}>Walkthrough found the most useful requests from the property capture. Keep what helps, change anything, then preview exactly what the seller receives.</p><div className="mt-6 rounded-2xl p-4 flex gap-3" style={{ background: '#E8EEF5' }}><Sparkles size={18} className="flex-shrink-0" style={{ color: '#1E3A5F' }} /><p className="text-xs leading-relaxed" style={{ color: '#486887' }}><strong>AI draft, agent decision.</strong> Nothing is shared until you review the plan and create the private link.</p></div><div className="mt-8 space-y-6">{grouped.map((group, groupIndex) => <section key={group.category} className="launch-card" style={{ animationDelay: `${groupIndex * 65}ms` }}><div className="flex items-center gap-2 mb-3"><span className="text-[11px] font-bold px-2 py-1 rounded-md" style={{ background: labels[group.category].tint, color: labels[group.category].color }}>{labels[group.category].title}</span></div><div className="space-y-2">{group.tasks.map(({ task, index }) => <article key={`${task.id ?? 'draft'}-${index}`} className="rounded-2xl overflow-hidden" style={{ background: '#FCFBF8', border: '1px solid rgba(30,58,95,.10)' }}><button onClick={() => setOpenTask(openTask === index ? null : index)} className="w-full p-4 text-left flex items-center gap-3"><span className="w-2 h-2 rounded-full" style={{ background: labels[task.category].color }} /><div className="flex-1"><p className="text-sm font-bold" style={{ color: '#15263A' }}>{task.title}</p><p className="mt-1 text-xs" style={{ color: '#718093' }}>{task.why_it_matters}</p></div>{task.mandatory && <span className="text-[10px] font-bold" style={{ color: '#A34C36' }}>REQUIRED</span>}<Pencil size={14} className="text-slate-400" /></button>{openTask === index && <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: 'rgba(30,58,95,.08)' }}><label className="block mt-3 text-xs font-bold text-slate-600">Seller action</label><input value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm border" /><label className="block mt-3 text-xs font-bold text-slate-600">Why it matters</label><textarea value={task.why_it_matters ?? ''} onChange={(event) => updateTask(index, { why_it_matters: event.target.value })} className="mt-1.5 w-full min-h-20 rounded-xl p-3 text-sm border" /><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><label className="text-xs font-semibold"><input type="checkbox" className="mr-1.5" checked={task.mandatory} onChange={(event) => updateTask(index, { mandatory: event.target.checked })} />Required before submit</label><label className="text-xs font-semibold"><input type="checkbox" className="mr-1.5" checked={task.requires_upload} onChange={(event) => updateTask(index, { requires_upload: event.target.checked })} />Ask for proof/photo</label><label className="text-xs font-semibold">Suggested date <input type="date" value={task.due_date ?? ''} onChange={(event) => updateTask(index, { due_date: event.target.value || null })} className="ml-1 rounded border p-1" /></label></div><button onClick={() => { setTasks((all) => all.filter((_, taskIndex) => taskIndex !== index)); setOpenTask(null); }} className="mt-4 text-xs font-bold" style={{ color: '#A34C36' }}><Trash2 size={13} className="inline mr-1" />Remove this suggestion</button></div>}</article>)}</div></section>)}</div><button onClick={addTask} className="mt-5 flex items-center gap-1.5 text-sm font-bold" style={{ color: '#1E3A5F' }}><Plus size={16} /> Add one task</button><details className="mt-7 rounded-2xl p-4" style={{ background: '#FCFBF8', border: '1px solid rgba(30,58,95,.10)' }}><summary className="cursor-pointer text-sm font-bold" style={{ color: '#32465D' }}>Optional plan settings</summary><div className="mt-4"><label className="text-xs font-bold text-slate-600">Target launch date</label><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="ml-3 rounded-lg px-2 py-1.5 text-sm border" /><label className="block mt-4 text-xs font-bold text-slate-600">A short note for the seller</label><textarea value={intro} onChange={(event) => setIntro(event.target.value)} className="mt-1.5 w-full min-h-20 rounded-xl p-3 text-sm border" /></div></details>{error && <p className="mt-4 text-sm" style={{ color: '#A34C36' }}>{error}</p>}<div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"><p className="text-xs" style={{ color: '#718093' }}>{tasks.length} seller actions · {requiredCount} required</p><button onClick={async () => { const saved = await savePlan(); if (saved) setScreen('preview'); }} disabled={saving || tasks.length === 0} className="px-5 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-45" style={{ background: '#1E3A5F' }}>{saving ? 'Saving…' : <>Preview seller plan <Eye size={16} className="inline ml-1" /></>}</button></div></main></div>;
}
