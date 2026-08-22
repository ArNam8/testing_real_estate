/**
 * WalkthroughStage.tsx
 * Audio recorder. The agent walks the property and records their observations.
 *
 * Error handling:
 *   - Microphone permission denied / not found → clear actionable message
 *   - Upload failure → error shown, phase returns to 'done' so agent can retry
 *   - Upload timeout (30s) → treated as a failure, not an infinite spinner
 *   - Recording too short (<5s) → blocked with explanation before upload
 *
 * UX notes:
 *   - Address shown in a sub-heading for orientation
 *   - Persistent room-name reminder during recording (non-dismissable)
 *   - Two-step exit: the X in WorkflowShell handles the confirm modal
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Square, Pause, Play, AlertCircle, Mic } from 'lucide-react';
import { propertiesService } from '../../services/supabase';

interface WalkthroughStageProps {
  propertyId: string;
  address: string;
  userId: string;
  /** Called with the uploaded audio path and the recording's duration in seconds. */
  onComplete: (audioPath: string, durationSec: number) => void;
  onCancel: () => void;
  /** True once the user has a saved Brand Kit — used as a signal they're
   *  an established user who no longer needs the beginner room-name
   *  reminder shown during recording. */
  hasBrandKit?: boolean;
}

/** Upload will be aborted and an error shown if it takes longer than this. */
const UPLOAD_TIMEOUT_MS = 30_000;

// ── Voice orb ─────────────────────────────────────────────────────────────────

/**
 * ChatGPT-style voice orb. A layered circle that breathes and morphs
 * organically in response to real microphone amplitude via AnalyserNode.
 *
 * Idle: soft slow-breathing navy orb.
 * Recording: expands, wobbles, and ripples with your actual voice — louder
 *   speech = larger orb with more pronounced ripples.
 *
 * Canvas is scaled by devicePixelRatio for crisp rendering on all screens
 * including Retina displays and Capacitor-wrapped apps.
 */
function VoiceOrb({ stream }: { stream: MediaStream | null }) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  const smoothRef   = useRef(0); // smoothed amplitude carried between frames
  const SIZE = 200; // logical px — canvas CSS size

  // Scale canvas for device pixel ratio once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
  }, []);

  // Wire audio analyser and run animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx  = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array         = new Uint8Array(0);

    if (stream) {
      const audioCtx = new AudioContext();
      const an       = audioCtx.createAnalyser();
      an.fftSize     = 256;
      an.smoothingTimeConstant = 0.80;
      const source   = audioCtx.createMediaStreamSource(stream);
      source.connect(an);
      analyser           = an;
      dataArray          = new Uint8Array(an.frequencyBinCount);
      audioCtxRef.current = audioCtx;
      analyserRef.current = an;
      sourceRef.current   = source;
    }

    const cx     = SIZE / 2;
    const cy     = SIZE / 2;
    const BASE_R = 52;

    function drawOrb(amplitude: number, t: number) {
      ctx.clearRect(0, 0, SIZE, SIZE);
      const a = amplitude;

      // Outer ambient glow — blooms when speaking
      const glowR = BASE_R + 18 + a * 30;
      const glow  = ctx.createRadialGradient(cx, cy, BASE_R * 0.5, cx, cy, glowR);
      glow.addColorStop(0,   `rgba(30, 58, 95, ${0.10 + a * 0.16})`);
      glow.addColorStop(0.5, `rgba(30, 58, 95, ${0.04 + a * 0.08})`);
      glow.addColorStop(1,   'rgba(30, 58, 95, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // Expanding ripple rings when voice detected
      if (a > 0.04) {
        for (let ring = 0; ring < 3; ring++) {
          const phase    = (t * 0.0016 + ring * 0.33) % 1;
          const ringR    = BASE_R + phase * (20 + a * 34);
          const ringA    = (1 - phase) * (0.16 + a * 0.24);
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(30, 58, 95, ${ringA})`;
          ctx.lineWidth   = 1.5;
          ctx.stroke();
        }
      }

      // Core blob — morphs with organic wobble driven by voice
      const POINTS = 72;
      const blobR  = BASE_R + a * 16;
      ctx.beginPath();
      for (let i = 0; i <= POINTS; i++) {
        const angle  = (i / POINTS) * Math.PI * 2;
        const wobble = a * (
          Math.sin(angle * 3 + t * 0.0024) * 5.5 +
          Math.sin(angle * 5 - t * 0.0017) * 3.0 +
          Math.sin(angle * 7 + t * 0.0029) * 1.8
        );
        const r = blobR + wobble;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else         ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Deep navy gradient fill
      const fill = ctx.createRadialGradient(
        cx - blobR * 0.22, cy - blobR * 0.22, 0,
        cx, cy, blobR + 10
      );
      fill.addColorStop(0,   `rgba(56,  96, 148, ${0.93 + a * 0.07})`);
      fill.addColorStop(0.5, `rgba(30,  58,  95, ${0.97 + a * 0.03})`);
      fill.addColorStop(1,   'rgba(13,  34,  56, 1)');
      ctx.fillStyle = fill;
      ctx.fill();

      // Specular highlight — soft sheen top-left
      const shine = ctx.createRadialGradient(
        cx - blobR * 0.28, cy - blobR * 0.32, 0,
        cx - blobR * 0.1,  cy - blobR * 0.1,  blobR * 0.7
      );
      shine.addColorStop(0,   `rgba(255,255,255, ${0.15 + a * 0.07})`);
      shine.addColorStop(0.5, `rgba(255,255,255, ${0.04 + a * 0.02})`);
      shine.addColorStop(1,   'rgba(255,255,255, 0)');
      ctx.fillStyle = shine;
      ctx.fill();
    }

    function tick(ts: number) {
      // Measure amplitude from frequency bins
      let raw = 0;
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        // Weight toward vocal range (roughly bins 2–30 of 128)
        const lo = 2, hi = Math.min(30, dataArray.length);
        for (let i = lo; i < hi; i++) sum += dataArray[i];
        raw = (sum / ((hi - lo) * 255));
        raw = Math.min(1, raw * 1.8); // slight boost so voice reads clearly
      }

      // Idle breath when no stream
      const idleBreath = stream ? 0 : 0.045 * (0.5 + 0.5 * Math.sin(ts * 0.0014));

      const target = raw + idleBreath;
      // Fast attack (voice starts), slow decay (voice ends) — feels natural
      smoothRef.current += (target - smoothRef.current) * (target > smoothRef.current ? 0.22 : 0.06);

      drawOrb(smoothRef.current, ts);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (sourceRef.current)   { sourceRef.current.disconnect();  sourceRef.current   = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close();     audioCtxRef.current = null; }
      analyserRef.current = null;
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: SIZE, height: SIZE, display: 'block', margin: '0 auto' }}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WalkthroughStage({
  propertyId,
  address,
  userId,
  onComplete,
  onCancel,
  hasBrandKit = false,
}: WalkthroughStageProps) {
  const [phase, setPhase]       = useState<'idle' | 'recording' | 'paused' | 'done' | 'uploading'>('idle');
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError]       = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const uploadAbortRef   = useRef<AbortController | null>(null);
  // Synchronous re-entry guard for startRecording(). `phase` alone isn't
  // enough: it only flips away from 'idle' *after* the async
  // getUserMedia() permission prompt resolves, so the "Start Recording"
  // button stays visible/clickable during that window. A double-tap there
  // used to spawn two independent recorders + timers — the second
  // overwrote timerRef, leaking the first interval forever (it kept
  // incrementing `duration` even after the visible recording was stopped,
  // since nothing could ever clearInterval() an ID no longer referenced
  // anywhere). A ref (not state) is required here since it must block
  // re-entry immediately, before any re-render happens.
  const startingRef      = useRef(false);

  // Stop all media tracks and timers on unmount.
  // Refs are intentionally read at cleanup time (not captured as locals)
  // since recording state changes after this effect runs on mount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // eslint-disable-next-line react-hooks/exhaustive-deps
      uploadAbortRef.current?.abort();
    };
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Plays a short, synthesized "recording started" beep (like a camera/voice
   * memo app start tone). Built with the Web Audio API so no audio file
   * needs to be bundled. Wrapped so any failure here (e.g. autoplay
   * restrictions, unsupported browser) is silently ignored and never
   * interrupts the actual recording flow.
   */
  const playRecordingStartSound = useCallback(() => {
    try {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // short high beep
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);

      // Close the audio context once the beep finishes so we don't leak it.
      oscillator.onended = () => {
        ctx.close().catch(() => {
          // Ignore — closing is best-effort cleanup only.
        });
      };
    } catch {
      // Never let a sound-playback failure interrupt recording.
    }
  }, []);

  /** Request mic access and start recording. */
  const startRecording = useCallback(async () => {
    if (startingRef.current) return; // already starting (or started) — ignore a double-tap
    startingRef.current = true;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;

      // Prefer opus for smaller file size; fall back to generic webm
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        setPhase('done');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // flush a chunk every second
      playRecordingStartSound();
      setPhase('recording');
      setDuration(0);
      startTimer();
    } catch (err) {
      startingRef.current = false;
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone access was denied. Please tap "Allow" when your browser asks, or enable microphone access in your device settings.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.');
        } else {
          setError(`Microphone error: ${err.message}. Please try again.`);
        }
      } else {
        setError('Unable to access the microphone. Please check your browser settings.');
      }
    }
  }, [startTimer, playRecordingStartSound]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      stopTimer();
      setPhase('paused');
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      startTimer();
      setPhase('recording');
    }
  }, [startTimer]);

  const stopRecording = useCallback(() => {
    const state = mediaRecorderRef.current?.state;
    if (state === 'recording' || state === 'paused') {
      mediaRecorderRef.current!.stop();
      stopTimer();
    }
  }, [stopTimer]);

  /**
   * Upload the recorded blob to Supabase Storage with a 30-second timeout.
   * If the upload hangs, the timeout fires and returns an error rather than
   * leaving the agent staring at a spinner indefinitely.
   */
  const handleUpload = useCallback(async () => {
    if (!audioBlob) return;
    if (duration < 5) {
      setError('Recording is too short — please record for at least 5 seconds. Walk through the property and describe each room as you go.');
      return;
    }

    setPhase('uploading');
    setError('');

    // Race the upload against a timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Upload timed out. Please check your connection and try again.')), UPLOAD_TIMEOUT_MS)
    );

    try {
      const path = await Promise.race([
        propertiesService.uploadAudio(propertyId, userId, audioBlob),
        timeoutPromise,
      ]);
      onComplete(path, duration);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setError(msg);
      setPhase('done');
    }
  }, [audioBlob, duration, propertyId, userId, onComplete]);

  /** Discard the recording and return to idle. */
  const reset = useCallback(() => {
    startingRef.current = false;
    const state = mediaRecorderRef.current?.state;
    if (state === 'recording' || state === 'paused') {
      mediaRecorderRef.current!.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopTimer();
    setAudioBlob(null);
    setDuration(0);
    setError('');
    setPhase('idle');
  }, [stopTimer]);

  /** Format seconds as MM:SS. */
  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const isActive = phase === 'recording';

  return (
    <div className="animate-fade-in">

      {/* Property address sub-heading */}
      <p className="text-center text-xs font-medium mb-6 truncate px-4" style={{ color: '#9a9488' }}>
        {address}
      </p>

      {/* Status pill */}
      <div className="flex justify-center mb-8">
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider border ${
            isActive        ? 'bg-red-50   border-red-200   text-red-600'
            : phase === 'paused'    ? 'bg-amber-50 border-amber-200 text-amber-600'
            : phase === 'done'      ? 'bg-teal-50  border-teal-200  text-teal-600'
            : phase === 'uploading' ? 'bg-blue-50  border-blue-200  text-blue-600'
            : 'bg-[#F5F4F0] border-[rgba(226,220,210,0.8)] text-[#9a9488]'
          }`}
        >
          {isActive && <span className="w-2 h-2 rounded-full bg-red-500 animate-record-dot" />}
          {phase === 'idle'      ? 'Ready to record'
            : phase === 'recording'  ? 'Recording'
            : phase === 'paused'     ? 'Paused'
            : phase === 'uploading'  ? 'Uploading…'
            : 'Recording complete'}
        </div>
      </div>

      {/* Voice orb — breathes at rest, reacts to voice when recording */}
      <div className="mb-2">
        <VoiceOrb stream={isActive ? streamRef.current : null} />
      </div>

      {/* Timer */}
      <div className="text-center mb-8">
        <p
          className="text-6xl font-bold font-mono tracking-tight tabular-nums"
          style={{
            color: isActive          ? '#1e3a5f'
              : phase === 'paused'   ? '#b45309'
              : phase === 'done'     ? '#0f766e'
              : '#c4bdb3',
          }}
        >
          {fmt(duration)}
        </p>
        {phase === 'idle' && (
          <p className="text-slate-400 text-sm mt-2">Tap start to begin your walkthrough</p>
        )}
        {phase === 'done' && (
          <p className="text-slate-500 text-sm mt-2">
            {fmt(duration)} recorded — ready to continue
          </p>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm leading-relaxed">{error}</p>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-3">

        {phase === 'idle' && (
          <button onClick={startRecording} className="btn-primary w-full text-base py-4">
            <span className="w-3 h-3 rounded-full bg-white/80 animate-record-dot" />
            Start Recording
          </button>
        )}

        {(phase === 'recording' || phase === 'paused') && (
          <div className="flex gap-3">
            {phase === 'recording' ? (
              <button onClick={pauseRecording} className="btn-secondary flex-1">
                <Pause size={18} /> Pause
              </button>
            ) : (
              <button onClick={resumeRecording} className="btn-primary flex-1">
                <Play size={18} /> Resume
              </button>
            )}
            <button onClick={stopRecording} className="btn-danger flex-1">
              <Square size={18} /> Stop
            </button>
          </div>
        )}

        {phase === 'done' && (
          <>
            <button
              onClick={handleUpload}
              disabled={duration < 5}
              className="btn-primary w-full"
            >
              Continue to Outputs
            </button>
            <button onClick={reset} className="btn-ghost w-full">
              Re-record
            </button>
            <button onClick={onCancel} className="btn-ghost w-full text-slate-400">
              Cancel walkthrough
            </button>
          </>
        )}

        {phase === 'uploading' && (
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" />
            <span className="text-slate-500 text-sm">Uploading recording…</span>
          </div>
        )}
      </div>

      {/* Persistent room-name reminder — visible only while recording/paused,
          and only for users without a Brand Kit yet (a saved Brand Kit is
          treated as a signal they're already an established user who
          doesn't need the beginner reminder). */}
      {(phase === 'recording' || phase === 'paused') && !hasBrandKit && (
        <div
          className="mt-8 p-3 rounded-xl flex items-center gap-2.5 animate-fade-in"
          style={{
            background: 'rgba(30, 58, 95, 0.05)',
            border: '1px solid rgba(30, 58, 95, 0.1)',
            borderRadius: '14px',
          }}
        >
          <Mic size={14} style={{ color: '#1e3a5f', flexShrink: 0 }} />
          <p className="text-xs font-medium" style={{ color: '#1e3a5f' }}>
            Say each room name as you enter — "Kitchen", "Living Room", "Bedroom"…
          </p>
        </div>
      )}

    </div>
  );
}
