/**
 * AllProjectsPage.tsx
 * Full searchable/filterable list of every property the user has created.
 * Accessible from the HomeScreen "View all" link.
 */

import { useState, useCallback } from 'react';
import {
  ChevronLeft, Trash2, Clock, CheckCircle2,
  AlertCircle, Loader2, Search,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { Property } from '../../services/supabase';

interface AllProjectsPageProps {
  properties: Property[];
  loading: boolean;
  onBack: () => void;
  onSelectProperty: (prop: Property) => void;
  onDeleteProperty: (id: string) => void;
  user: User;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a UTC date string to a compact human-readable relative time. */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Return an icon element representing the current status of a property. */
function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={16} className="text-teal-600" />;
  if (status === 'processing') return <Loader2 size={16} className="text-blue-500 animate-spin" />;
  if (status === 'error') return <AlertCircle size={16} className="text-red-500" />;
  return <Clock size={16} className="text-slate-400" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AllProjectsPage({
  properties,
  loading,
  onBack,
  onSelectProperty,
  onDeleteProperty,
}: AllProjectsPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  /** ID of the card the user tapped delete on first — tap again to confirm. */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  /**
   * Two-tap delete: first tap arms the confirmation state (card border turns
   * red), second tap within 3 seconds confirms the delete.
   */
  const handleDelete = useCallback((id: string) => {
    if (confirmDelete === id) {
      onDeleteProperty(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  }, [confirmDelete, onDeleteProperty]);

  const sorted = [...properties]
    .filter((p) => p.address.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="min-h-screen" style={{ background: '#f8fafb' }}>

      {/* ── Top bar ── */}
      <div className="top-bar">
        <div className="top-bar-inner">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-700 active:bg-slate-100 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-base font-semibold text-slate-900 flex-1">All Projects</h1>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
            {properties.length}
          </span>
        </div>
      </div>

      <div className="mt-topbar page-content pt-5 pb-12">

        {/* Search input */}
        <div className="mb-6 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search projects..."
            className="input-field pl-10"
          />
        </div>

        {/* Project list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12">
            <Clock size={32} className="text-slate-200 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">
              {searchTerm ? 'No matching projects' : 'No projects yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((prop, i) => (
              <button
                key={prop.id}
                onClick={() => prop.status === 'completed' ? onSelectProperty(prop) : undefined}
                className="card-interactive px-5 py-4 w-full flex items-center gap-4 animate-fade-in"
                style={{ animationDelay: `${i * 30}ms` }}
                aria-label={`Open ${prop.address}`}
              >
                {/* Status icon */}
                <div className="flex-shrink-0">
                  <StatusIcon status={prop.status} />
                </div>

                {/* Address + metadata */}
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-semibold text-slate-900 truncate text-sm">{prop.address}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400 capitalize">{prop.status}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{timeAgo(prop.created_at)}</span>
                  </div>
                </div>

                {/* Delete button — two-tap confirm pattern */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }}
                  className={`p-2 rounded-lg transition-all flex-shrink-0 ${
                    confirmDelete === prop.id
                      ? 'bg-red-50 text-red-600'
                      : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                  }`}
                  aria-label={confirmDelete === prop.id ? 'Confirm delete' : 'Delete property'}
                >
                  <Trash2 size={16} />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
