import { useEffect, useRef, useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  ClipboardList,
  DownloadCloud,
  FileCheck2,
  FileText,
  ImagePlus,
  ListChecks,
  Menu,
  Mic,
  MoreHorizontal,
  Palette,
  Sparkles,
  TimerReset,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { AI_PROVIDERS, buildAskAiPrompt, DOCUMENT_TYPES, SAMPLE_FOLLOW_UP, WALKTHROUGH_ROOMS } from './landing/constants';
import './landing-v79.css';

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

type StepId = 1 | 2 | 3 | 4 | 5;

const workflowCopy = [
  {
    id: 1 as StepId,
    eyebrow: '01 / Capture the room',
    title: 'Talk like you already do.',
    body: 'Walk the property, say each room as you enter, and describe what you notice. No script. No typing. Walkthrough AI keeps up.',
    accent: 'sage',
  },
  {
    id: 2 as StepId,
    eyebrow: '02 / Choose the output',
    title: 'One walkthrough. The documents you need.',
    body: 'Select the packs, summaries, notes, and timelines that make sense for this property. Every output comes from the same source of truth.',
    accent: 'blue',
  },
  {
    id: 3 as StepId,
    eyebrow: '03 / Close the gaps',
    title: 'It asks before it assumes.',
    body: 'When something important is missing, Walkthrough AI pauses to ask. That small moment of verification is what keeps your documents accurate.',
    accent: 'amber',
  },
  {
    id: 4 as StepId,
    eyebrow: '04 / Add the evidence',
    title: 'Bring the rooms into focus.',
    body: 'Attach the photos that belong to each detected room. They flow into the right place in your finished documents.',
    accent: 'rose',
  },
  {
    id: 5 as StepId,
    eyebrow: '05 / Leave with the work done',
    title: 'From voice note to ready-to-send.',
    body: 'Your walkthrough becomes structured, checked, branded documents in under five minutes. Download PDF or Word and get on with the day.',
    accent: 'ink',
  },
];

function Mark({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`lp79-mark ${dark ? 'lp79-mark-dark' : ''}`} aria-hidden="true">
      <span /><span /><span />
    </span>
  );
}

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`lp79-logo ${dark ? 'lp79-logo-dark' : ''}`}>
      <Mark dark={dark} />
      <span>walkthrough<span className="lp79-logo-ai">ai</span></span>
    </span>
  );
}

function ProductChrome({ children, label = 'Walkthrough AI' }: { children: ReactNode; label?: string }) {
  return (
    <div className="lp79-product-window">
      <div className="lp79-product-topbar">
        <div className="lp79-window-dots"><i /><i /><i /></div>
        <div className="lp79-window-title"><Mark /> {label}</div>
        <MoreHorizontal size={16} />
      </div>
      {children}
    </div>
  );
}

function Waveform({ compact = false }: { compact?: boolean }) {
  const heights = [18, 28, 12, 35, 46, 23, 54, 32, 22, 39, 16, 48, 27, 20, 42, 30, 15, 37, 24, 44, 18, 32, 12, 25];
  return (
    <div className={`lp79-waveform ${compact ? 'lp79-waveform-compact' : ''}`} aria-label="Live audio waveform">
      {heights.map((height, index) => <span key={index} style={{ height: `${height}%`, animationDelay: `${index * 45}ms` }} />)}
    </div>
  );
}

function RecorderVisual() {
  return (
    <ProductChrome label="New walkthrough">
      <div className="lp79-recorder-visual">
        <div className="lp79-recorder-meta">
          <span className="lp79-live"><i /> Recording</span>
          <span>00:02:41</span>
        </div>
        <div className="lp79-voice-orb-wrap">
          <div className="lp79-orb-ring lp79-orb-ring-one" />
          <div className="lp79-orb-ring lp79-orb-ring-two" />
          <div className="lp79-voice-orb"><Mic size={26} /></div>
        </div>
        <Waveform />
        <div className="lp79-recorder-hint"><span className="lp79-room-dot" /> Say each room name as you enter</div>
        <div className="lp79-transcript-float lp79-transcript-one"><span>Kitchen</span> quartz counters, gas range</div>
        <div className="lp79-transcript-float lp79-transcript-two"><span>Primary bedroom</span> new carpet, walk-in closet</div>
      </div>
    </ProductChrome>
  );
}

function DocumentMini({ title, icon: Icon, selected = false, muted = false }: { title: string; icon: ElementType; selected?: boolean; muted?: boolean }) {
  return (
    <div className={`lp79-doc-mini ${selected ? 'is-selected' : ''} ${muted ? 'is-muted' : ''}`}>
      <span className="lp79-doc-mini-icon"><Icon size={16} /></span>
      <span>{title}</span>
      <span className="lp79-check">{selected ? <Check size={13} /> : null}</span>
    </div>
  );
}

function OutputVisual() {
  return (
    <ProductChrome label="Choose your outputs">
      <div className="lp79-output-visual">
        <div className="lp79-output-heading"><div><span className="lp79-overline">OUTPUTS</span><strong>What should we prepare?</strong></div><span className="lp79-selected-count">2 selected</span></div>
        <div className="lp79-output-list">
          <DocumentMini title="Property Listing Pack" icon={FileText} selected />
          <DocumentMini title="Client Summary Report" icon={Users} selected />
          <DocumentMini title="Inspection Notes" icon={ClipboardList} />
          <DocumentMini title="Transaction Timeline" icon={ListChecks} muted />
        </div>
        <div className="lp79-product-action"><span>Continue</span><ArrowRight size={15} /></div>
      </div>
    </ProductChrome>
  );
}

function FollowUpVisual() {
  return (
    <ProductChrome label="A quick check">
      <div className="lp79-followup-visual">
        <div className="lp79-followup-badge"><HelpCircle size={14} /> Accuracy check</div>
        <h4>One detail to confirm</h4>
        <p>{SAMPLE_FOLLOW_UP.question}</p>
        <div className="lp79-answer-row"><span>{SAMPLE_FOLLOW_UP.answer}</span><BadgeCheck size={18} /></div>
        <div className="lp79-followup-footer"><span>Question 1 of 3</span><span className="lp79-progress"><i /></span></div>
      </div>
    </ProductChrome>
  );
}

function PhotosVisual() {
  return (
    <ProductChrome label="Add room photos">
      <div className="lp79-photos-visual">
        <div className="lp79-output-heading"><div><span className="lp79-overline">PHOTOS</span><strong>Match each room</strong></div><span className="lp79-photo-count">0 / 5</span></div>
        <div className="lp79-room-grid">
          {WALKTHROUGH_ROOMS.slice(0, 4).map((room, index) => (
            <div className="lp79-room-card" key={room}>
              <div className={`lp79-photo-placeholder room-${index}`}><ImagePlus size={18} /></div>
              <span>{room}</span><small>Add photo</small>
            </div>
          ))}
        </div>
        <div className="lp79-product-action lp79-action-light"><span>Continue without photos</span><ArrowRight size={15} /></div>
      </div>
    </ProductChrome>
  );
}

function DocumentsVisual({ large = false }: { large?: boolean }) {
  return (
    <div className={`lp79-document-payoff ${large ? 'is-large' : ''}`}>
      <div className="lp79-document-toolbar"><span className="lp79-doc-status"><i /> Documents ready</span><span className="lp79-download"><DownloadCloud size={14} /> Download all</span></div>
      <div className="lp79-document-sheet">
        <div className="lp79-sheet-brand"><Mark /><span>WALKTHROUGH AI</span><em>PROPERTY LISTING PACK</em></div>
        <div className="lp79-sheet-line lp79-sheet-line-long" />
        <div className="lp79-sheet-title">A considered home<br />in its own words.</div>
        <div className="lp79-sheet-rule" />
        <div className="lp79-sheet-columns"><div><span /> <span /> <span /></div><div><span /> <span /></div></div>
        <div className="lp79-sheet-footer">PDF &nbsp;·&nbsp; DOCX &nbsp;·&nbsp; BRAND KIT APPLIED</div>
      </div>
      <div className="lp79-document-file-list"><span><FileText size={15} /> Property Listing Pack <b>PDF</b></span><span><FileCheck2 size={15} /> Client Summary Report <b>DOCX</b></span></div>
    </div>
  );
}

function WorkflowVisual({ step }: { step: StepId }) {
  if (step === 1) return <RecorderVisual />;
  if (step === 2) return <OutputVisual />;
  if (step === 3) return <FollowUpVisual />;
  if (step === 4) return <PhotosVisual />;
  return <DocumentsVisual />;
}

function Hero({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section className="lp79-hero" id="top">
      <div className="lp79-hero-grid" />
      <div className="lp79-hero-glow lp79-hero-glow-one" /><div className="lp79-hero-glow lp79-hero-glow-two" />
      <div className="lp79-container">
        <div className="lp79-hero-copy">
          <div className="lp79-eyebrow lp79-eyebrow-light"><span className="lp79-eyebrow-dot" /> Voice-first property intelligence</div>
          <h1>Finish your listings <span>before you leave the driveway.</span></h1>
          <p className="lp79-hero-lede">Walkthrough AI turns the way you already walk a property into polished, branded documents — while the details are still fresh.</p>
          <div className="lp79-hero-actions"><button className="lp79-button lp79-button-sage" onClick={onSignUp}>Start your first walkthrough <ArrowRight size={16} /></button><a className="lp79-text-link lp79-text-link-light" href="#workflow">See the five-minute flow <ArrowDown size={15} /></a></div>
          <div className="lp79-hero-proof"><span><Zap size={14} /> No script</span><span><TimerReset size={14} /> Under 5 minutes</span><span><Palette size={14} /> Your brand, built in</span></div>
        </div>
        <div className="lp79-hero-stage" aria-label="Walkthrough AI product preview"><div className="lp79-orbit orbit-a" /><div className="lp79-orbit orbit-b" /><div className="lp79-hero-window"><RecorderVisual /></div><div className="lp79-float-card lp79-float-card-top"><span className="lp79-float-icon"><Sparkles size={14} /></span><span><b>Details captured</b><small>Kitchen · Primary bedroom · 12 more</small></span></div><div className="lp79-float-card lp79-float-card-bottom"><span className="lp79-float-check"><Check size={13} /></span><span><b>Brand kit applied</b><small>Ready for your review</small></span></div></div>
      </div>
      <div className="lp79-scroll-cue"><span>Scroll to follow the work</span><span className="lp79-scroll-line" /></div>
    </section>
  );
}

function Navbar({ onSignIn, onSignUp }: LandingPageProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`lp79-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="lp79-container lp79-nav-inner"><a className="lp79-nav-logo" href="#top" onClick={() => setOpen(false)}><Logo dark={scrolled} /></a><nav className={`lp79-nav-links ${open ? 'is-open' : ''}`}><a href="#workflow" onClick={() => setOpen(false)}>How it works</a><a href="#documents" onClick={() => setOpen(false)}>Documents</a><a href="#brand" onClick={() => setOpen(false)}>Your brand</a><a href="#ask-ai" onClick={() => setOpen(false)}>Ask AI</a><div className="lp79-nav-mobile-actions"><button className="lp79-button lp79-button-navy" onClick={onSignUp}>Get started <ArrowRight size={15} /></button><button className="lp79-nav-signin" onClick={onSignIn}>Sign in</button></div></nav><div className="lp79-nav-actions"><button className="lp79-nav-signin" onClick={onSignIn}>Sign in</button><button className="lp79-button lp79-button-navy lp79-button-small" onClick={onSignUp}>Get started <ArrowRight size={15} /></button></div><button className="lp79-menu-button" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button></div>
    </header>
  );
}

function Workflow({ onSignUp }: { onSignUp: () => void }) {
  const [active, setActive] = useState<StepId>(1);
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<number, HTMLElement | null>>({});
  const scrollToStep = (id: StepId) => { setActive(id); cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); };
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.querySelectorAll<HTMLElement>('[data-step-card]'));
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) setActive(Number(entry.target.getAttribute('data-step-card')) as StepId); }), { root: rail, threshold: 0.62 });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);
  return (
    <section className="lp79-workflow" id="workflow">
      <div className="lp79-container"><div className="lp79-section-intro"><div><div className="lp79-eyebrow"><span className="lp79-eyebrow-dot" /> The Walkthrough AI workflow</div><h2>Five steps between<br /><span>“I’ll remember that.”</span><br />and actually remembering it.</h2></div><div className="lp79-intro-side"><p>The product story is simple: your voice becomes information, information becomes checked facts, and checked facts become work you can send.</p><button className="lp79-button lp79-button-outline" onClick={onSignUp}>Try it on a real property <ArrowUpRight size={15} /></button></div></div><div className="lp79-step-nav" role="tablist" aria-label="Workflow steps">{workflowCopy.map((step) => <button key={step.id} className={active === step.id ? 'is-active' : ''} onClick={() => scrollToStep(step.id)} role="tab" aria-selected={active === step.id}><span>0{step.id}</span><i /></button>)}</div><div className="lp79-workflow-rail" ref={railRef}>{workflowCopy.map((step) => <article key={step.id} data-step-card={step.id} ref={(node) => { cardRefs.current[step.id] = node; }} className={`lp79-step-card accent-${step.accent}`}><div className="lp79-step-copy"><span className="lp79-step-eyebrow">{step.eyebrow}</span><h3>{step.title}</h3><p>{step.body}</p><div className="lp79-step-foot"><span className="lp79-step-number">0{step.id}</span><span className="lp79-step-connector" />{step.id < 5 ? <span>Next: {workflowCopy[step.id].eyebrow.split(' / ')[1]}</span> : <span>Ready to send</span>}</div></div><div className="lp79-step-visual"><WorkflowVisual step={step.id} /></div></article>)}</div><div className="lp79-mobile-rail-hint"><ChevronLeft size={15} /> swipe through the workflow <ChevronRight size={15} /></div></div>
    </section>
  );
}

function BrandSection() {
  return (
    <section className="lp79-brand-section" id="brand"><div className="lp79-container lp79-brand-grid"><div className="lp79-brand-copy"><div className="lp79-eyebrow lp79-eyebrow-light"><span className="lp79-eyebrow-dot" /> Your work, recognisably yours</div><h2>AI does the heavy lifting.<br /><span>Your brand gets the credit.</span></h2><p>Every document is more than generated text. Your logo, colors, hierarchy, and voice carry through to something that feels considered, professional, and ready for a client.</p><div className="lp79-brand-list"><span><Check size={14} /> Your colors, applied at generation</span><span><Check size={14} /> A real PDF and editable Word file</span><span><Check size={14} /> Review it before it leaves your hands</span></div></div><div className="lp79-brand-art"><div className="lp79-brand-glow" /><div className="lp79-brand-stack lp79-brand-stack-back"><DocumentsVisual /></div><div className="lp79-brand-stack lp79-brand-stack-front"><DocumentsVisual large /></div><div className="lp79-brand-caption"><Palette size={16} /><span><b>Brand Kit</b><small>Locked to this document</small></span></div></div></div></section>
  );
}

function DocumentsSection({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section className="lp79-documents" id="documents"><div className="lp79-container"><div className="lp79-section-intro lp79-doc-intro"><div><div className="lp79-eyebrow"><span className="lp79-eyebrow-dot" /> One source, many useful outputs</div><h2>Make one walkthrough<br /><span>do more work.</span></h2></div><p>Choose only what you need today — and keep the rest of the detail ready for tomorrow. Walkthrough AI generates six practical documents from the same conversation.</p></div><div className="lp79-documents-mosaic"><div className="lp79-mosaic-feature"><div className="lp79-mosaic-label"><FileText size={16} /> Core listing work</div><h3>Property<br />Listing Pack</h3><p>Description, room breakdown, highlights, fact sheet, and the details you did not want to lose.</p><div className="lp79-mosaic-page"><div className="lp79-page-top"><Mark /><span>WALKTHROUGH AI</span><i /></div><div className="lp79-page-hero" /><div className="lp79-page-lines"><i /><i /><i /><i /></div><span className="lp79-page-chip">BRANDED · REVIEWED</span></div></div><div className="lp79-mosaic-list">{DOCUMENT_TYPES.slice(1).map((document, index) => { const Icon = document.icon; return <div className="lp79-mosaic-item" key={document.key}><span className={`lp79-mosaic-item-icon item-${index}`}><Icon size={17} /></span><span><b>{document.label}</b><small>{document.description}</small></span><ArrowUpRight size={15} /></div>; })}</div></div><div className="lp79-doc-cta"><div><span className="lp79-eyebrow"><span className="lp79-eyebrow-dot" /> Built for the gap between properties</span><h3>Your next walkthrough can be your next finished pack.</h3></div><button className="lp79-button lp79-button-navy" onClick={onSignUp}>Build yours in under 5 minutes <ArrowRight size={16} /></button></div></div></section>
  );
}

function AskAISection() {
  const [copied, setCopied] = useState(false);
  const prompt = buildAskAiPrompt(window.location.href);
  const copyPrompt = async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 2200); } catch { /* Clipboard is a progressive enhancement. */ } };
  return (
    <section className="lp79-ask-ai" id="ask-ai"><div className="lp79-ask-grid" /><div className="lp79-container"><div className="lp79-ask-inner"><div className="lp79-eyebrow lp79-eyebrow-light"><span className="lp79-eyebrow-dot" /> A second opinion, on demand</div><h2>Still not sure?<br /><span>Ask your AI.</span></h2><p>We made it easy to ask the assistants you already trust to read the page, understand the product, and give you an honest view of where Walkthrough AI fits.</p><div className="lp79-ai-options">{AI_PROVIDERS.map((provider) => { const url = provider.buildUrl(encodeURIComponent(prompt)); return <a className={`lp79-ai-option ai-${provider.id}`} href={url} target="_blank" rel="noreferrer" key={provider.id}><span className="lp79-ai-logo">{provider.id === 'claude' ? '✳' : provider.id === 'chatgpt' ? '◎' : '✦'}</span><span><b>{provider.name}</b><small>Open with context</small></span><ArrowUpRight size={16} /></a>; })}</div><button className="lp79-prompt-copy" onClick={copyPrompt}>{copied ? <Check size={14} /> : <ClipboardList size={14} />}{copied ? 'Prompt copied' : 'Copy the honest-evaluation prompt'}</button></div></div></section>
  );
}

function Footer({ onSignUp }: { onSignUp: () => void }) {
  return (
    <footer className="lp79-footer"><div className="lp79-footer-scene"><div className="lp79-footer-blur lp79-footer-blur-one" /><div className="lp79-footer-blur lp79-footer-blur-two" /><div className="lp79-footer-grid" /><div className="lp79-phone"><div className="lp79-phone-speaker" /><div className="lp79-phone-screen"><div className="lp79-phone-bar"><Mark dark /><span>Walkthrough AI</span><MoreHorizontal size={12} /></div><div className="lp79-phone-greeting">Good morning,<br /><strong>Ready to walk?</strong></div><div className="lp79-phone-card"><span className="lp79-phone-card-icon"><Mic size={16} /></span><span><b>New walkthrough</b><small>Turn your notes into more</small></span><ArrowRight size={14} /></div><div className="lp79-phone-card lp79-phone-card-muted"><span className="lp79-phone-doc"><FileText size={14} /></span><span><b>Recent documents</b><small>2 ready to review</small></span></div></div></div></div><div className="lp79-container lp79-footer-content"><div><a href="#top"><Logo /></a><p>Walk the property. Say what you see.<br />Leave with the work done.</p></div><div className="lp79-footer-links"><div><span>Explore</span><a href="#workflow">How it works</a><a href="#documents">Documents</a><a href="#brand">Your brand</a></div><div><span>Start here</span><button onClick={onSignUp}>Get started</button><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top</button></div></div><div className="lp79-footer-bottom"><span>© 2026 Walkthrough AI</span><span>Voice → facts → finished work</span></div></div></footer>
  );
}

export function LandingPage({ onSignIn, onSignUp }: LandingPageProps) {
  return <div className="lp79-page"><Navbar onSignIn={onSignIn} onSignUp={onSignUp} /><main><Hero onSignUp={onSignUp} /><Workflow onSignUp={onSignUp} /><BrandSection /><DocumentsSection onSignUp={onSignUp} /><AskAISection /></main><Footer onSignUp={onSignUp} /></div>;
}
