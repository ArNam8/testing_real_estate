/**
 * useAuth.ts
 * React hooks for authentication state and property data.
 *
 * useAuth      — tracks the current Supabase session and exposes sign-in/out.
 * useProperties — fetches the current user's property list and exposes a
 *                 refresh function so any component can trigger a reload.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, propertiesService, brandKitService } from '../services/supabase';
import type { Property, BrandKit } from '../services/supabase';
import type { User, Session } from '@supabase/supabase-js';

// ─── useAuth ─────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

/**
 * Subscribes to Supabase auth state changes and provides
 * signUp / signIn / signOut actions.
 * All actions throw on failure so the calling component can show an error.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });

  useEffect(() => {
    // Load the existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ user: session?.user ?? null, session, loading: false });
    });

    // Keep state in sync with auth events (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState({ user: session?.user ?? null, session, loading: false });
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }, []);

  return { ...state, signUp, signIn, signOut };
}

// ─── useProperties ───────────────────────────────────────────────────────────

interface PropertiesState {
  properties: Property[];
  loading: boolean;
  /** Human-readable error message, or null if no error. */
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches the authenticated user's property list from Supabase.
 * Re-fetches whenever userId changes (e.g. after sign-in).
 * Exposes a refresh() function for use after create/delete operations.
 */
export function useProperties(userId: string | undefined): PropertiesState {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Don't attempt a fetch if there's no authenticated user
    if (!userId) {
      setProperties([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await propertiesService.list();
      setProperties(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load projects.';
      setError(msg);
      // Keep the previous list visible rather than blanking the screen
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { properties, loading, error, refresh };
}

// ─── useBrandKit ─────────────────────────────────────────────────────────────

interface BrandKitState {
  brandKit: BrandKit | null;
  loading: boolean;
  /** Human-readable error message, or null if no error. */
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches the authenticated user's Brand Kit (or null if they haven't
 * created one). Re-fetches whenever userId changes (e.g. after sign-in).
 * Exposes a refresh() function for use after saving changes.
 */
export function useBrandKit(userId: string | undefined): BrandKitState {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBrandKit(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await brandKitService.get();
      setBrandKit(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load your Brand Kit.';
      setError(msg);
      // Keep the previous value visible rather than blanking the screen
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { brandKit, loading, error, refresh };
}
