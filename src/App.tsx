/**
 * App.tsx
 * Root component. Owns the top-level view state.
 *
 * View flow:
 *   - Unauthenticated: LandingPage (public) + AuthModal overlay when needed
 *   - Authenticated:   onboarding → home → all-projects → workflow
 *
 * Auth is triggered from the landing page via "Sign in" / "Get started" buttons,
 * which open the AuthModal as a bottom-sheet overlay without navigating away.
 *
 * Workflow stage order: walkthrough → outputs → followup → photos → generate
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth, useProperties, useBrandKit } from './hooks/useAuth';
import { propertiesService } from './services/supabase';
import type { Property, WorkflowStage, OutputType, GeneratedContent } from './services/supabase';
import { DEFAULT_OUTPUTS } from './services/supabase';
import { LandingPage } from './components/shared/LandingPage';
import { AuthModal } from './components/shared/AuthPage';
import { PageLoader } from './components/shared/LoadingSpinner';
import { OnboardingFlow, hasCompletedOnboarding } from './components/shared/OnboardingFlow';
import { HomeScreen } from './components/home/HomeScreen';
import { AllProjectsPage } from './components/home/AllProjectsPage';
import { BrandKitScreen } from './components/brand/BrandKitScreen';
import { WorkflowShell } from './components/workflow/WorkflowShell';
import { TextWalkthroughStage } from './components/workflow/TextWalkthroughStage';
import { OutputsStage } from './components/workflow/OutputsStage';
import { FollowUpStage } from './components/workflow/FollowUpStage';
import { PhotosStage } from './components/workflow/PhotosStage';
import { GenerateStage } from './components/workflow/GenerateStage';

// ─── First-run Brand Kit intro tracking ────────────────────────────────────────
// Separate from onboarding's own localStorage flag — this makes sure the
// Brand Kit intro screen is shown exactly once per browser, immediately
// after onboarding, regardless of whether the user actually saves a kit
// or skips it.
const BRAND_KIT_INTRO_KEY = 'wt_brandkit_intro_seen';

function hasSeenBrandKitIntro(): boolean {
  try {
    return localStorage.getItem(BRAND_KIT_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

function markBrandKitIntroSeen(): void {
  try {
    localStorage.setItem(BRAND_KIT_INTRO_KEY, '1');
  } catch {
    // Non-fatal — worst case they see the intro again next visit
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** All state needed to resume or navigate a property workflow session. */
interface SessionState {
  propertyId: string | null;
  address: string;
  stage: WorkflowStage;
  selectedOutputs: OutputType[];
  audioPath: string | null;
  /** QA-only pasted walkthrough input. */
  walkthroughText: string | null;
  /**
   * Duration of the recorded walkthrough, in seconds. Passed to FollowUpStage
   * so it can show a "longer recordings take a bit more time" note for
   * lengthy (e.g. luxury-property) recordings while genuinely waiting on
   * Pass 1, rather than guessing from a fixed timeout.
   */
  recordingDurationSec: number;
  /**
   * Answers collected in FollowUpStage, keyed by question ID.
   * Passed directly to GenerateStage so they reach Pass 2 without
   * requiring an extra DB fetch.
   */
  followUpAnswers: Record<string, string>;
  /**
   * Status of the background pipeline call fired right after upload:
   *  - 'pending': still in flight — keep polling normally
   *  - 'ready': Pass 1 completed and follow_up_questions should be saved
   *  - 'failed': the call failed — FollowUpStage should not wait the full
   *    poll timeout and can show fallback questions sooner with a clear
   *    explanation.
   */
  followUpsStatus: 'pending' | 'ready' | 'failed';
  /**
   * First-draft GeneratedContent returned by the background pipeline call
   * (Pass 1 + first Pass 2), if it completed before the user reaches
   * GenerateStage. Lets GenerateStage skip a redundant call when the user
   * has no follow-up answers to add.
   */
  pipelineResult: (GeneratedContent & Record<string, unknown>) | null;
  /**
   * True when this session was opened by clicking a completed property on
   * the home screen (handleViewProperty). Passed to GenerateStage so it
   * knows to load documents from the DB immediately and never attempt
   * runAnalysis() — the original audio has already been deleted from storage.
   */
  isReopening: boolean;
}

/** Top-level view the user is currently looking at. */
type AppView = 'onboarding' | 'home' | 'all-projects' | 'brand-kit' | 'workflow';

/** Which auth modal mode is open, or null if closed. */
type AuthModalMode = 'signin' | 'signup' | null;

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { properties, loading: propsLoading, error: propsError, refresh } = useProperties(user?.id);
  const { brandKit, loading: brandKitLoading, refresh: refreshBrandKit } = useBrandKit(user?.id);

  /**
   * Initial app view for authenticated users.
   *   - First visit ever → onboarding (which itself routes into the Brand
   *     Kit intro on completion, see handleOnboardingComplete below).
   *   - Anything else → home. The Brand Kit intro (for already-onboarded
   *     users who've never seen it) is decided separately below, once we
   *     actually know from the database whether they already have a kit —
   *     see the brandKitIntroDecidedRef effect. Deciding that synchronously
   *     from localStorage alone (as an earlier version of this did) meant
   *     a cleared/fresh browser profile would re-show the intro even for
   *     a user who already has a saved kit sitting in the database.
   */
  const [view, setView] = useState<AppView>(
    !hasCompletedOnboarding() ? 'onboarding' : 'home'
  );
  const [session, setSession] = useState<SessionState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  /** True while the Brand Kit screen is open as the automatic first-run
   *  intro (right after onboarding, or on first load for an already-
   *  onboarded user), rather than opened manually from the home screen
   *  card — changes its copy and shows a "Skip" option. */
  const [brandKitFirstRun, setBrandKitFirstRun] = useState(false);

  /** Ensures the "should we show the Brand Kit intro?" decision below runs
   *  exactly once per signed-in session, not every time brandKit/loading
   *  happen to change (e.g. after saving a kit from the home screen card). */
  const brandKitIntroDecidedRef = useRef(false);

  // Decide whether to show the Brand Kit intro, once we have real data.
  // The database is the source of truth: if a Brand Kit already exists,
  // the intro is skipped (and the local "seen" flag is repaired) no matter
  // what that flag currently says — covers a new browser/device/incognito
  // window for someone who already set this up elsewhere. If no kit exists
  // and the local flag says "not seen yet", show it exactly once.
  useEffect(() => {
    if (brandKitIntroDecidedRef.current) return;
    if (!user) return;
    if (brandKitLoading) return; // wait for the real answer before deciding
    if (!hasCompletedOnboarding()) return; // still going through onboarding — don't interrupt it
    if (view !== 'home') return; // don't yank the user out of an active screen

    brandKitIntroDecidedRef.current = true;

    if (brandKit) {
      markBrandKitIntroSeen(); // self-heal the local flag — no need to ever ask again
      return;
    }
    if (!hasSeenBrandKitIntro()) {
      markBrandKitIntroSeen();
      setBrandKitFirstRun(true);
      setView('brand-kit');
    }
  }, [user, brandKitLoading, brandKit, view]);

  /** Auth modal state — null means closed, 'signin'/'signup' sets the initial mode. */
  const [authModal, setAuthModal] = useState<AuthModalMode>(null);
  /** True when a document modal is open in GenerateStage — hides WorkflowShell bars. */
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);

  /**
   * Tracks whether we should play the "arriving in the app" entrance
   * animation. This is true only the first time `user` becomes truthy
   * during this session — i.e. the moment someone signs in/up and the
   * landing page transitions into the authenticated app. It does NOT
   * replay on every re-render or stage change within the app.
   */
  const hasPlayedEntranceRef = useRef(false);
  const [playEntrance, setPlayEntrance] = useState(false);

  useEffect(() => {
    if (user && !hasPlayedEntranceRef.current) {
      hasPlayedEntranceRef.current = true;
      setPlayEntrance(true);
    }
  }, [user]);

  // ── Auth / landing handlers ───────────────────────────────────────────────

  /** Open the auth modal in sign-in mode (from "Sign in" button on landing). */
  const handleOpenSignIn = useCallback(() => setAuthModal('signin'), []);

  /** Open the auth modal in sign-up mode (from "Get started" buttons on landing). */
  const handleOpenSignUp = useCallback(() => setAuthModal('signup'), []);

  /** Dismiss the auth modal without authenticating. */
  const handleCloseAuth = useCallback(() => setAuthModal(null), []);

  // ── Onboarding ────────────────────────────────────────────────────────────

  /**
   * Onboarding just finished. Go home — the brandKitIntroDecidedRef effect
   * above takes it from there: once the brand kit fetch (already underway
   * in parallel since `user` was set at sign-up) resolves, it'll route a
   * brand-new user (no kit, never seen the intro) into the Brand Kit intro
   * automatically. This avoids having two separate places deciding the
   * same thing in slightly different ways.
   */
  const handleOnboardingComplete = useCallback(() => {
    setView('home');
  }, []);

  // ── Brand Kit ─────────────────────────────────────────────────────────────

  /** Open the Brand Kit screen from the home screen card (create or edit). */
  const handleOpenBrandKit = useCallback(() => {
    setBrandKitFirstRun(false);
    setView('brand-kit');
  }, []);

  /** Brand Kit saved — refresh it and return home. */
  const handleBrandKitSaved = useCallback(() => {
    setBrandKitFirstRun(false);
    refreshBrandKit();
    setView('home');
  }, [refreshBrandKit]);

  /** Backed out of the Brand Kit screen without saving (or skipped, on first run). */
  const handleBrandKitBack = useCallback(() => {
    setBrandKitFirstRun(false);
    setView('home');
  }, []);

  // ── Session / navigation handlers ────────────────────────────────────────

  /** Create a new property and open the walkthrough recorder. */
  const handleStartSession = useCallback(async (address: string) => {
    if (!user) return;
    // BUGFIX: this was previously unguarded. If create() failed, the
    // function threw silently — the "new address" modal had already closed
    // optimistically, leaving the agent back on the home screen with no new
    // session and no indication that anything went wrong.
    let property;
    try {
      property = await propertiesService.create(address, user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start a new walkthrough. Please try again.';
      alert(msg);
      return;
    }
    setSession({
      propertyId: property.id,
      address,
      stage: 'walkthrough',
      selectedOutputs: DEFAULT_OUTPUTS,
      audioPath: null,
      walkthroughText: null,
      recordingDurationSec: 0,
      followUpAnswers: {},
      followUpsStatus: 'pending',
      pipelineResult: null,
      isReopening: false,
    });
    setView('workflow');
  }, [user]);

  /** Open a completed property at the generate/outputs view. */
  const handleViewProperty = useCallback((prop: Property) => {
    setSession({
      propertyId: prop.id,
      address: prop.address,
      stage: 'generate',
      selectedOutputs: (prop.selected_outputs as OutputType[]) ?? DEFAULT_OUTPUTS,
      audioPath: prop.audio_storage_path,
      walkthroughText: null,
      recordingDurationSec: 0,
      followUpAnswers: (prop.follow_up_answers as Record<string, string>) ?? {},
      followUpsStatus: 'ready',
      pipelineResult: null,
      isReopening: true,
    });
    setView('workflow');
  }, []);

  // ── Workflow stage transitions ────────────────────────────────────────────

  /**
   * Pasted walkthrough submitted — persist the testing state, advance to
   * output selection, and kick off the same two-pass pipeline using text.
   */
  const handleTextComplete = useCallback(async (walkthroughText: string, durationSec: number) => {
    if (!session?.propertyId) return;

    try {
      await propertiesService.update(session.propertyId, {
        status: 'recording',
        workflow_stage: 'outputs',
      });
    } catch (err) {
      console.warn('[walkthrough_testing] failed to save workflow stage (non-fatal, continuing):', err);
    }

    const propertyId = session.propertyId;
    const selectedOutputs = session.selectedOutputs;

    propertiesService.startPipeline(propertyId, '', selectedOutputs, walkthroughText)
      .then((result) => {
        // A sparse_audio result means Pass 1 ran but the recording was too
        // brief — no extraction_data was saved and no follow-up questions were
        // generated. Treat this as 'failed' so FollowUpStage does NOT
        // auto-skip on the empty follow_up_questions DB default. Instead it
        // will show fallback questions, which the agent can answer before the
        // sparse fill-in form appears in GenerateStage.
        const isSparse = result && (result as Record<string, unknown>).sparse_audio === true;
        setSession((prev: SessionState | null) =>
          prev ? {
            ...prev,
            followUpsStatus: (result && !isSparse) ? 'ready' : 'failed',
            pipelineResult: result,
          } : prev
        );
      })
      .catch(() => {
        setSession((prev: SessionState | null) =>
          prev ? { ...prev, followUpsStatus: 'failed' } : prev
        );
      });

    setSession((prev: SessionState | null) => prev ? { ...prev, audioPath: null, walkthroughText, recordingDurationSec: durationSec, stage: 'outputs' } : prev);
  }, [session?.propertyId, session?.selectedOutputs]);

  /** Outputs selected — advance to follow-up questions. */
  const handleOutputsSelected = useCallback((outputs: OutputType[]) => {
    setSession((prev: SessionState | null) =>
      prev ? { ...prev, selectedOutputs: outputs, stage: 'followup' } : prev
    );
  }, []);

  /** Follow-up answered or skipped — store answers in session and advance to the photos step. */
  const handleFollowUpComplete = useCallback((answers: Record<string, string>) => {
    setSession((prev: SessionState | null) =>
      prev ? { ...prev, followUpAnswers: answers, stage: 'photos' } : prev
    );
  }, []);

  /** Photos step done (with or without any photos attached) — advance to generation. */
  const handlePhotosComplete = useCallback(() => {
    setSession((prev: SessionState | null) => prev ? { ...prev, stage: 'generate' } : prev);
  }, []);

  /**
   * Generation complete — fully reset session state and return to home.
   * Using setSession(null) (not a partial stage update) ensures that
   * followUpAnswers, pipelineResult, and followUpsStatus from this run
   * are not carried over into a subsequent workflow run in the same
   * browser session, which was the root cause of the followup→generate
   * loop bug.
   */
  const handleGenerationComplete = useCallback(() => {
    setSession(null);
    setView('home');
    refresh();
  }, [refresh]);

  /** Exit workflow, return to home, refresh property list. */
  const handleExitWorkflow = useCallback(() => {
    setSession(null);
    setView('home');
    refresh();
  }, [refresh]);

  // ── Property management ───────────────────────────────────────────────────

  const handleDeleteProperty = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      await propertiesService.remove(id);
      refresh();
    } catch (err) {
      // BUGFIX: this previously only logged to console — the delete button
      // just stopped spinning and the property silently stayed in the list
      // with no explanation that anything failed.
      console.error('Failed to delete property:', err);
      const msg = err instanceof Error ? err.message : 'Could not delete this property. Please try again.';
      alert(msg);
    } finally {
      setDeleting(null);
    }
  }, [refresh]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setSession(null);
    setView('home');
    brandKitIntroDecidedRef.current = false;
  }, [signOut]);

  // ── Render ────────────────────────────────────────────────────────────────

  // Auth still loading — show a spinner
  if (authLoading) return <PageLoader />;

  // Not authenticated — show landing page + optional auth modal overlay
  if (!user) {
    return (
      <div>
        <LandingPage onSignIn={handleOpenSignIn} onSignUp={handleOpenSignUp} />
        {authModal && (
          <AuthModal initialMode={authModal} onClose={handleCloseAuth} />
        )}
      </div>
    );
  }

  // Authenticated — show the full app
  return (
    <div
      className={`min-h-screen ${playEntrance ? 'animate-app-enter' : ''}`}
      style={{ background: '#f8fafb' }}
    >

      {/* Onboarding — full screen overlay, shown once */}
      {view === 'onboarding' && (
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      )}

      {/* Home screen */}
      {view === 'home' && (
        <HomeScreen
          properties={properties}
          loading={propsLoading || deleting !== null}
          loadError={propsError}
          onStartNew={handleStartSession}
          onViewProperty={handleViewProperty}
          onViewAllProjects={() => setView('all-projects')}
          onDeleteProperty={handleDeleteProperty}
          user={user}
          onSignOut={handleSignOut}
          brandKit={brandKit}
          onOpenBrandKit={handleOpenBrandKit}
        />
      )}

      {/* Brand Kit — create or edit */}
      {view === 'brand-kit' && (
        <BrandKitScreen
          userId={user.id}
          existingKit={brandKit}
          isFirstRun={brandKitFirstRun}
          onSaved={handleBrandKitSaved}
          onBack={handleBrandKitBack}
        />
      )}

      {/* All projects page */}
      {view === 'all-projects' && (
        <AllProjectsPage
          properties={properties}
          loading={propsLoading || deleting !== null}
          onBack={() => setView('home')}
          onSelectProperty={(prop) => { handleViewProperty(prop); setView('workflow'); }}
          onDeleteProperty={handleDeleteProperty}
          user={user}
        />
      )}

      {/* Workflow */}
      {view === 'workflow' && session && (
        <WorkflowShell
          address={session.address}
          stage={session.stage}
          onExit={handleExitWorkflow}
          isModalOpen={isDocModalOpen}
        >
          {session.stage === 'walkthrough' && session.propertyId && (
              <TextWalkthroughStage
                address={session.address}
                onComplete={handleTextComplete}
                onCancel={handleExitWorkflow}
              />
          )}

          {session.stage === 'outputs' && (
            <OutputsStage
              propertyId={session.propertyId!}
              initialSelected={session.selectedOutputs}
              followUpsStatus={session.followUpsStatus}
              onComplete={handleOutputsSelected}
              onBack={() =>
                setSession((prev: SessionState | null) => prev ? { ...prev, stage: 'walkthrough' } : prev)
              }
            />
          )}

          {session.stage === 'followup' && session.propertyId && (
            <FollowUpStage
              propertyId={session.propertyId}
              followUpsStatus={session.followUpsStatus}
              recordingDurationSec={session.recordingDurationSec}
              onComplete={handleFollowUpComplete}
              onSkip={() => handleFollowUpComplete({})}
            />
          )}

          {session.stage === 'photos' && session.propertyId && (
            <PhotosStage
              propertyId={session.propertyId}
              userId={user.id}
              selectedOutputs={session.selectedOutputs}
              onComplete={handlePhotosComplete}
              onBack={() =>
                setSession((prev: SessionState | null) => prev ? { ...prev, stage: 'followup' } : prev)
              }
            />
          )}

          {session.stage === 'generate' && session.propertyId && (
            <GenerateStage
              propertyId={session.propertyId}
              audioPath={session.audioPath ?? ''}
              walkthroughText={session.walkthroughText}
              selectedOutputs={session.selectedOutputs}
              followUpAnswers={session.followUpAnswers}
              pipelineResult={session.pipelineResult}
              isReopening={session.isReopening}
              onComplete={handleGenerationComplete}
              onModalChange={setIsDocModalOpen}
              onRetry={() =>
                setSession((prev: SessionState | null) => prev ? { ...prev, stage: 'walkthrough' } : prev)
              }
            />
          )}
        </WorkflowShell>
      )}

    </div>
  );
}

export default App;
