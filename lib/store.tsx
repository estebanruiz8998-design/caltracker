"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FoodLog, Goals, Profile } from "./types";
import { DEFAULT_GOALS } from "./goals";
import { addDays, dateKey, todayKey } from "./dates";

const STORAGE_KEY = "caltracker:v1";

interface PersistedState {
  profile: Profile | null;
  goals: Goals;
  logs: FoodLog[];
}

interface StoreValue extends PersistedState {
  /** false until localStorage has been read (avoids hydration mismatch) */
  hydrated: boolean;
  onboarded: boolean;
  streak: number;
  completeOnboarding: (profile: Profile, goals: Goals) => void;
  setGoals: (goals: Goals) => void;
  /** Clears the profile (re-runs onboarding) but keeps logs and goals. */
  resetProfile: () => void;
  addLog: (log: FoodLog) => void;
  deleteLog: (id: string) => void;
  clearAll: () => void;
  logsFor: (date: string) => FoodLog[];
  totalsFor: (date: string) => Goals;
}

const StoreContext = createContext<StoreValue | null>(null);

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        profile: parsed.profile ?? null,
        goals: parsed.goals ?? DEFAULT_GOALS,
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      };
    }
  } catch {
    // corrupted storage — start fresh
  }
  return { profile: null, goals: DEFAULT_GOALS, logs: [] };
}

function persist(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded — drop photos (largest payload) and retry once.
    try {
      const slim = {
        ...state,
        logs: state.logs.map(({ photo: _photo, ...rest }) => rest),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      // give up silently; data stays in memory for this session
    }
  }
}

function computeStreak(logs: FoodLog[]): number {
  const daysWithLogs = new Set(logs.map((l) => l.date));
  if (daysWithLogs.size === 0) return 0;
  let streak = 0;
  let cursor = new Date();
  // A streak survives today being empty (the day isn't over yet).
  if (!daysWithLogs.has(dateKey(cursor))) {
    cursor = addDays(cursor, -1);
  }
  while (daysWithLogs.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>({
    profile: null,
    goals: DEFAULT_GOALS,
    logs: [],
  });
  const [hydrated, setHydrated] = useState(false);
  const skipPersist = useRef(true);

  useEffect(() => {
    setState(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipPersist.current) {
      // Skip the write triggered by hydration itself.
      skipPersist.current = false;
      return;
    }
    persist(state);
  }, [state, hydrated]);

  const completeOnboarding = useCallback((profile: Profile, goals: Goals) => {
    setState((s) => ({ ...s, profile, goals }));
  }, []);

  const setGoals = useCallback((goals: Goals) => {
    setState((s) => ({ ...s, goals }));
  }, []);

  const resetProfile = useCallback(() => {
    setState((s) => ({ ...s, profile: null }));
  }, []);

  const addLog = useCallback((log: FoodLog) => {
    setState((s) => ({ ...s, logs: [log, ...s.logs] }));
  }, []);

  const deleteLog = useCallback((id: string) => {
    setState((s) => ({ ...s, logs: s.logs.filter((l) => l.id !== id) }));
  }, []);

  const clearAll = useCallback(() => {
    setState({ profile: null, goals: DEFAULT_GOALS, logs: [] });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<StoreValue>(() => {
    const logsFor = (date: string) => state.logs.filter((l) => l.date === date);
    const totalsFor = (date: string) =>
      logsFor(date).reduce(
        (acc, l) => ({
          calories: acc.calories + l.calories,
          protein_g: acc.protein_g + l.protein_g,
          carbs_g: acc.carbs_g + l.carbs_g,
          fat_g: acc.fat_g + l.fat_g,
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      );
    return {
      ...state,
      hydrated,
      onboarded: state.profile !== null,
      streak: computeStreak(state.logs),
      completeOnboarding,
      setGoals,
      resetProfile,
      addLog,
      deleteLog,
      clearAll,
      logsFor,
      totalsFor,
    };
  }, [
    state,
    hydrated,
    completeOnboarding,
    setGoals,
    resetProfile,
    addLog,
    deleteLog,
    clearAll,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export { todayKey };
