/**
 * HomeScreen.tsx
 * The main landing page after sign-in.
 * Shows the big record button, the 3 most recent properties,
 * and a bottom sheet modal for entering a new property address.
 */

import { useState, useCallback } from 'react';
import { Mic, ChevronRight, Clock, Trash2, ArrowRight, LogOut, AlertCircle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { Property, BrandKit } from '../../services/supabase';
import { paletteHex } from '../../utils/brandPalette';

interface HomeScreenProps {
  properties: Property[];
  loading: boolean;
  /** Non-null when the properties fetch failed — shown as an inline error. */
  loadError: string | null;
  onStartNew: (address: string) => void;
  onViewProperty: (property: Property) => void;
  onViewAllProjects: () => void;
  onDeleteProperty: (id: string) => void;
  user: User;
  onSignOut: () => void;
  /** The user's Brand Kit, or null if they haven't created one yet. */
  brandKit: BrandKit | null;
  /** Open the Brand Kit screen (to create or edit). */
  onOpenBrandKit: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a UTC date string to a human-readable relative time label. */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeScreen({
  properties,
  loading,
  loadError,
  onStartNew,
  onViewProperty,
  onViewAllProjects,
  onDeleteProperty,
  onSignOut,
  brandKit,
  onOpenBrandKit,
}: HomeScreenProps) {
  const [showNewModal, setShowNewModal] = useState(false);
  const [address, setAddress] = useState('');


  /** Submit the new-property address form. */
  const handleSubmit = useCallback(() => {
    if (address.trim()) {
      onStartNew(address.trim());
      setShowNewModal(false);
      setAddress('');
    }
  }, [address, onStartNew]);

  /**
   * Single-tap delete with a native confirm dialog.
   * Cleaner than the two-tap pattern which felt like a bug.
   */
  const handleDelete = useCallback((id: string, address: string) => {
    if (window.confirm(`Delete "${address}"? This cannot be undone.`)) {
      onDeleteProperty(id);
    }
  }, [onDeleteProperty]);

  const completedCount = properties.filter((p) => p.status === 'completed').length;
  const recentProperties = [...properties]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

  return (
    <div className="min-h-screen" style={{ background: '#F5F4F0' }}>

      {/* ── Top bar ── */}
      <div className="top-bar">
        <div className="top-bar-inner">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#1e3a5f' }}>
              <Mic size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">Walkthrough AI</h1>
              <p className="text-xs text-slate-400">{completedCount} completed</p>
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="mt-topbar page-content pt-8 pb-32">

        {/* Primary CTA — large record button */}
        <div className="mb-12 text-center animate-slide-up">
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#1a2e45' }}>Start a walkthrough</h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color: '#7a8899' }}>
            Walk the property, talk naturally — documents ready in minutes
          </p>
          <button
            onClick={() => setShowNewModal(true)}
            className="relative mx-auto block"
            aria-label="Start a new walkthrough"
          >
            {/* Breathing glow ring */}
            <div
              className="absolute inset-[-8px] rounded-full mic-glow"
              style={{ background: 'transparent' }}
            />
            {/* Outer halo */}
            <div
              className="absolute inset-[-16px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(30,58,95,0.07) 0%, transparent 70%)' }}
            />
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center relative transition-all duration-200 active:scale-95"
              style={{
                background: 'linear-gradient(145deg, #22416b 0%, #0f2740 100%)',
                boxShadow: '0 12px 32px rgba(15, 39, 64, 0.28), 0 2px 8px rgba(15, 39, 64, 0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              <Mic size={38} className="text-white" />
            </div>
          </button>
        </div>

        {/* Properties list section */}
        {loading ? (
          /* Loading spinner */
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
          </div>
        ) : loadError ? (
          /* Error state — fetch failed */
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-700 text-sm font-semibold">Could not load projects</p>
              <p className="text-red-600 text-xs mt-0.5">{loadError}</p>
            </div>
          </div>
        ) : properties.length === 0 ? (
          /* Empty state */
          <div className="text-center py-12">
            <Clock size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No projects yet. Start your first walkthrough above.</p>
          </div>
        ) : (
          /* Recent projects */
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="section-title mb-0" style={{ color: '#9a9488' }}>Recent</p>
            </div>

            <div className="space-y-2">
              {recentProperties.map((prop, i) => (
                <button
                  key={prop.id}
                  onClick={() => prop.status === 'completed' ? onViewProperty(prop) : undefined}
                  className="card-interactive w-full flex items-center animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms`, padding: '14px 16px' }}
                  aria-label={`Open ${prop.address}`}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-slate-900 truncate text-sm leading-snug">{prop.address}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {/* Status pill — coloured text only, no coloured borders on card */}
                      <span className={`text-[11px] font-semibold capitalize ${
                        prop.status === 'completed' ? 'text-teal-600'
                        : prop.status === 'processing' ? 'text-blue-500'
                        : prop.status === 'recording' ? 'text-amber-500'
                        : 'text-slate-400'
                      }`}>{prop.status}</span>
                      <span className="text-slate-300 text-xs">·</span>
                      <span className="text-[11px] text-slate-400">{timeAgo(prop.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(prop.id, prop.address); }}
                      className="p-2 rounded-lg transition-all text-slate-300 hover:text-red-500 hover:bg-red-50"
                      aria-label="Delete property"
                    >
                      <Trash2 size={15} />
                    </button>
                    {prop.status === 'completed' && (
                      <ChevronRight size={15} className="text-slate-300" />
                    )}
                  </div>
                </button>
              ))}

              {/* View all card — slimmer, navy, sits naturally after recent cards */}
              <button
                onClick={onViewAllProjects}
                className="w-full flex items-center justify-between rounded-2xl animate-fade-in transition-all duration-200 active:scale-[0.985] overflow-hidden"
                style={{
                  animationDelay: `${recentProperties.length * 60}ms`,
                  background: 'linear-gradient(135deg, #1e3a5f 0%, #0d2236 100%)',
                  boxShadow: '0 2px 10px rgba(13, 34, 54, 0.22), 0 1px 2px rgba(13, 34, 54, 0.15)',
                  padding: '12px 16px',
                }}
                aria-label="View all projects"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                    <ArrowRight size={13} className="text-white/80" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white leading-tight">View all projects</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{properties.length} total</p>
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
              </button>
            </div>
          </div>
        )}

        {/* Brand Kit card — always visible regardless of properties state.
            Default (no kit): a soft 3-dot color cluster hints "this is
            where your colors live" even before you've picked any.
            Active (kit exists): dual-ring border in the user's own colors
            plus a two-tone swatch mark actually built from their real
            primary/secondary — the card itself IS a small preview of the
            brand, not just a link to go set one up. */}
        <button
          onClick={onOpenBrandKit}
          className="w-full mt-10 flex items-center justify-between rounded-2xl text-left animate-fade-in transition-all duration-200 active:scale-[0.985]"
          style={
            brandKit
              ? {
                  padding: '24px 22px',
                  background: '#fdfcfa',
                  boxShadow: `0 0 0 1.5px #${paletteHex(brandKit.secondary_color_key) ?? '6FAF9A'}, 0 0 0 4px #${paletteHex(brandKit.primary_color_key) ?? '1E3A5F'}1a, 0 3px 14px rgba(30,20,10,0.09)`,
                  border: `1.5px solid #${paletteHex(brandKit.primary_color_key) ?? '1E3A5F'}`,
                }
              : {
                  padding: '24px 22px',
                  background: '#fdfcfa',
                  border: '1px solid rgba(226, 220, 210, 0.9)',
                  boxShadow: '0 1px 4px rgba(30, 20, 10, 0.05)',
                }
          }
          aria-label={brandKit ? 'Edit your Brand Kit' : 'Make your Brand Kit'}
        >
          <div className="min-w-0 pr-4">
            <p className="text-base font-bold leading-snug" style={{ color: '#1a2e45' }}>
              {brandKit ? brandKit.brand_name : 'Make your brand kit'}
            </p>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: '#7a8899' }}>
              {brandKit
                ? 'Tap to edit your colors or brand name.'
                : 'Choose your primary and secondary colors, give your brand a name, and make every document yours.'}
            </p>
          </div>

          {/* Symbolic mark: an actual two-tone swatch once a kit exists,
              or a soft neutral 3-dot cluster hinting at "colors" before one does. */}
          <div className="relative flex-shrink-0 w-14 h-14">
            {brandKit ? (
              <>
                <div
                  className="absolute top-0 left-0 w-9 h-9 rounded-full shadow-sm"
                  style={{ background: `#${paletteHex(brandKit.primary_color_key) ?? '1E3A5F'}` }}
                />
                <div
                  className="absolute bottom-0 right-0 w-9 h-9 rounded-full shadow-sm ring-2 ring-white"
                  style={{ background: `#${paletteHex(brandKit.secondary_color_key) ?? '6FAF9A'}` }}
                />
              </>
            ) : (
              <>
                <div className="absolute top-0 left-1 w-7 h-7 rounded-full opacity-90" style={{ background: '#1e3a5f' }} />
                <div className="absolute top-2 right-0 w-7 h-7 rounded-full opacity-90 ring-2 ring-[#fdfcfa]" style={{ background: '#c16b4f' }} />
                <div className="absolute bottom-0 left-3 w-7 h-7 rounded-full opacity-90 ring-2 ring-[#fdfcfa]" style={{ background: '#6FAF9A' }} />
              </>
            )}
          </div>
        </button>
      </div>

      {/* ── New property bottom-sheet modal ── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => { setShowNewModal(false); setAddress(''); }}
          />
          <div className="relative rounded-t-3xl p-6 animate-slide-up shadow-2xl" style={{ background: '#fdfcfa', borderTop: '1px solid rgba(226,220,210,0.8)' }}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6" />
            <h2 className="text-xl font-bold text-slate-900 mb-1">New Walkthrough</h2>
            <p className="text-slate-500 text-sm mb-6">Enter the property address to begin recording</p>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="123 Main St, Los Angeles, CA"
              className="input-field mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNewModal(false); setAddress(''); }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!address.trim()}
                className="btn-primary flex-1"
              >
                <Mic size={16} /> Start
              </button>
            </div>
            <div style={{ height: 'env(safe-area-inset-bottom)' }} />
          </div>
        </div>
      )}
    </div>
  );
}
