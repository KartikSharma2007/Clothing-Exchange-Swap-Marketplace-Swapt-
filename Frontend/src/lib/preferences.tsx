import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AccentColor = "red" | "green" | "blue" | "black";
export type TextSize = "small" | "medium" | "large";
export type ThemeMode = "light" | "dark";

export type Preferences = {
  accent: AccentColor;
  textSize: TextSize;
  mode: ThemeMode;
  reducedMotion: boolean;
  emailUpdates: boolean;
  swapAlerts: boolean;
  marketing: boolean;
  publicProfile: boolean;
  showLocation: boolean;
  language: string;
  currency: string;
};

const DEFAULTS: Preferences = {
  accent: "red",
  textSize: "medium",
  mode: "light",
  reducedMotion: false,
  emailUpdates: true,
  swapAlerts: true,
  marketing: false,
  publicProfile: true,
  showLocation: true,
  language: "en-GB",
  currency: "GBP",
};

const STORAGE_KEY = "swapt.preferences";

export const ACCENTS: { value: AccentColor; label: string; swatch: string }[] = [
  { value: "red", label: "Signature red", swatch: "#e0353a" },
  { value: "green", label: "Fresh green", swatch: "#1f9d55" },
  { value: "blue", label: "Electric blue", swatch: "#2563eb" },
  { value: "black", label: "Mono black", swatch: "#141414" },
];

export const TEXT_SIZES: { value: TextSize; label: string; hint: string }[] = [
  { value: "small", label: "Small", hint: "Compact — fits more on screen" },
  { value: "medium", label: "Medium", hint: "Default reading size" },
  { value: "large", label: "Large", hint: "Easier to read from a distance" },
];

type Ctx = Preferences & {
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  reset: () => void;
};

const PreferencesContext = createContext<Ctx | null>(null);

function read(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  // Hydrate after mount so SSR markup and first client render match.
  useEffect(() => {
    setPrefs(read());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.dataset.accent = prefs.accent;
    root.dataset.textSize = prefs.textSize;
    root.dataset.motion = prefs.reducedMotion ? "reduced" : "full";
    root.classList.toggle("dark", prefs.mode === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — preferences stay for this session only */
    }
  }, [prefs]);

  const set = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const reset = useCallback(() => setPrefs(DEFAULTS), []);

  const value = useMemo<Ctx>(() => ({ ...prefs, set, reset }), [prefs, set, reset]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside <PreferencesProvider>");
  return ctx;
}
