import { createContext, useContext, useEffect, useMemo } from "react";
import { usePreferences } from "@/lib/preferences";

/**
 * Lightweight i18n — no external library. Language + currency come from the
 * user's preferences (localStorage), formatted with Intl so number/date/money
 * output follows the locale. Catalogues cover the languages offered in
 * Settings → Language & region.
 */

type Lang = "en" | "fr" | "es" | "hi";

function baseLang(code: string): Lang {
  const base = String(code || "en-GB").toLowerCase().slice(0, 2);
  if (base === "fr") return "fr";
  if (base === "es") return "es";
  if (base === "hi") return "hi";
  return "en";
}

const en = "en";
const fr = "fr";
const es = "es";
const hi = "hi";

const STRINGS: Record<string, Record<Lang, string>> = {
  "nav.sellNow": { [en]: "Sell now", [fr]: "Vendre", [es]: "Vender", [hi]: "बेचें" },
  "nav.logIn": { [en]: "Log in", [fr]: "Connexion", [es]: "Iniciar sesión", [hi]: "लॉग इन" },
  "nav.signUp": { [en]: "Sign up", [fr]: "Inscription", [es]: "Registrarse", [hi]: "साइन अप" },
  "nav.bag": { [en]: "Your Bag", [fr]: "Votre sac", [es]: "Tu bolsa", [hi]: "आपका बैग" },
  "action.saveToBag": { [en]: "Save to Bag", [fr]: "Ajouter au sac", [es]: "Guardar en bolsa", [hi]: "बैग में सहेजें" },
  "action.inYourBag": { [en]: "In your Bag", [fr]: "Dans votre sac", [es]: "En tu bolsa", [hi]: "आपके बैग में" },
  "action.requestExchange": { [en]: "Request exchange", [fr]: "Proposer un échange", [es]: "Solicitar intercambio", [hi]: "अदला-बदली का अनुरोध" },
  "action.browseAll": { [en]: "Browse all", [fr]: "Tout parcourir", [es]: "Explorar todo", [hi]: "सभी देखें" },
  "action.seeTrending": { [en]: "See trending", [fr]: "Voir les tendances", [es]: "Ver tendencias", [hi]: "ट्रेंडिंग देखें" },
  "action.more": { [en]: "View all", [fr]: "Voir tout", [es]: "Ver todo", [hi]: "सभी देखें" },
  "common.credits": { [en]: "credits", [fr]: "crédits", [es]: "créditos", [hi]: "क्रेडिट" },
  "common.creditsShort": { [en]: "cr", [fr]: "cr", [es]: "cr", [hi]: "क्रे" },
  "common.retail": { [en]: "retail", [fr]: "neuf", [es]: "retail", [hi]: "खुदरा" },
  "common.listedAgo": { [en]: "Listed {n}d ago", [fr]: "Publié il y a {n}j", [es]: "Publicado hace {n}d", [hi]: "{n} दिन पहले प्रकाशित" },
  "common.views": { [en]: "{n} views", [fr]: "{n} vues", [es]: "{n} vistas", [hi]: "{n} बार देखा गया" },
  "common.justNow": { [en]: "just now", [fr]: "à l'instant", [es]: "ahora mismo", [hi]: "अभी" },
  "common.minutesAgo": { [en]: "{n}m ago", [fr]: "il y a {n} min", [es]: "hace {n} min", [hi]: "{n} मिनट पहले" },
  "common.hoursAgo": { [en]: "{n}h ago", [fr]: "il y a {n}h", [es]: "hace {n}h", [hi]: "{n} घंटे पहले" },
  "common.daysAgo": { [en]: "{n}d ago", [fr]: "il y a {n}j", [es]: "hace {n}d", [hi]: "{n} दिन पहले" },
  "common.size": { [en]: "Size {s}", [fr]: "Taille {s}", [es]: "Talla {s}", [hi]: "साइज़ {s}" },
  "common.search": { [en]: "Search", [fr]: "Rechercher", [es]: "Buscar", [hi]: "खोजें" },
  "common.fitsYou": { [en]: "Fits you", [fr]: "À votre taille", [es]: "Te queda", [hi]: "आपको फिट" },
  "common.meetup": { [en]: "Meetup", [fr]: "Rencontre", [es]: "Quedada", [hi]: "मीटअप" },
  "home.recommended": { [en]: "Recommended for you", [fr]: "Recommandé pour vous", [es]: "Recomendado para ti", [hi]: "आपके लिए अनुशंसित" },
  "home.trending": { [en]: "Trending this week", [fr]: "Tendances de la semaine", [es]: "Tendencias de la semana", [hi]: "इस सप्ताह के ट्रेंडिंग" },
  "home.wallet": { [en]: "Wallet", [fr]: "Portefeuille", [es]: "Monedero", [hi]: "वॉलेट" },
};

export type I18n = {
  locale: string;
  currency: string;
  /** Translate a key, interpolating {n}/{s}/{d} tokens. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Locale-aware integer grouping. */
  n: (value: number) => string;
  /** Locale-aware date. */
  d: (date: string | number | Date, opts?: Intl.DateTimeFormatOptions) => string;
  /** Locale-aware short datetime. */
  dt: (date: string | number | Date) => string;
  /** Format an amount in the user's currency (falls back to "credits"). */
  money: (value: number, currency?: string) => string;
  /** Compact relative time (just now / n m ago / n h ago / n d ago). */
  ago: (date: string | number | Date) => string;
};

const I18nContext = createContext<I18n | null>(null);

function fmtRelative(t: I18n["t"], date: string | number | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("common.justNow");
  if (mins < 60) return t("common.minutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("common.hoursAgo", { n: hours });
  return t("common.daysAgo", { n: Math.floor(hours / 24) });
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const prefs = usePreferences();
  const lang = baseLang(prefs.language);
  const locale = prefs.language || "en-GB";
  const currency = prefs.currency || "GBP";

  useEffect(() => {
    document.documentElement.lang = lang === "en" ? locale : lang;
    document.documentElement.dataset.locale = lang;
  }, [lang, locale]);

  const i18n = useMemo<I18n>(() => {
    const t: I18n["t"] = (key, vars) => {
      let out = STRINGS[key]?.[lang] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
      }
      return out;
    };
    return {
      locale, // This is the raw locale from prefs, but we'll validate it in the d function
      currency,
      t,
      n: (value) => value.toLocaleString(locale),
      d: (date, opts) => {
        // Validate locale before using it
        const validLocale = (typeof locale === "string" && locale.length >= 2) ? locale : "en-GB";
        try {
          return new Date(date).toLocaleDateString(validLocale, opts ?? { year: "numeric", month: "short", day: "numeric" });
        } catch (e) {
          // Fallback to en-GB if the locale is invalid
          return new Date(date).toLocaleDateString("en-GB", opts ?? { year: "numeric", month: "short", day: "numeric" });
        }
      },
      dt: (date) => {
        // Validate locale before using it
        const validLocale = (typeof locale === "string" && locale.length >= 2) ? locale : "en-GB";
        try {
          return new Date(date).toLocaleString(validLocale, { dateStyle: "medium", timeStyle: "short" });
        } catch (e) {
          // Fallback to en-GB if the locale is invalid
          return new Date(date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
        }
      },
      money: (value, c) => {
        // Validate locale before using it
        const validLocale = (typeof locale === "string" && locale.length >= 2) ? locale : "en-GB";
        if (c && c !== "credits") {
          try {
            return new Intl.NumberFormat(validLocale, { style: "currency", currency: c }).format(value);
          } catch (e) {
            // Fallback to en-GB if the locale is invalid
            return new Intl.NumberFormat("en-GB", { style: "currency", currency: c }).format(value);
          }
        }
        return `${value.toLocaleString(validLocale)} ${t("common.credits")}`;
      },
      ago: (date) => fmtRelative(t, date),
    };
  }, [lang, locale, currency]);

  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Locale from the stored preferences — for plain function date/number formatting. */
export function localeFromPrefs(): string {
  try {
    const raw = window.localStorage.getItem("swapt.preferences");
    if (raw) return (JSON.parse(raw) as { language?: string }).language ?? "en-GB";
  } catch { /* ignore */ }
  return "en-GB";
}

/** Relative-time helper for non-component code (e.g. notifications). */
export function relativeTime(lang: string, date: string | number | Date): string {
  const base = baseLang(lang);
  const t: I18n["t"] = (key, vars) => {
    let out = STRINGS[key]?.[base] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
  return fmtRelative(t, date);
}

/** Safely format a date using locale from preferences, with fallback to en-GB */
export function safeFormatDate(date: string | number | Date, opts?: Intl.DateTimeFormatOptions): string {
  try {
    const lang = localeFromPrefs();
    // Basic validation: locale should be a string with reasonable length
    if (typeof lang !== "string" || lang.length < 2) {
      return new Date(date).toLocaleDateString("en-GB", opts);
    }
    return new Date(date).toLocaleDateString(lang, opts);
  } catch (e) {
    // Fallback to en-GB if anything goes wrong
    return new Date(date).toLocaleDateString("en-GB", opts);
  }
}

/** Safely format a date-time string using locale from preferences, with fallback to en-GB */
export function safeFormatDateTime(date: string | number | Date): string {
  try {
    const lang = localeFromPrefs();
    // Basic validation: locale should be a string with reasonable length
    if (typeof lang !== "string" || lang.length < 2) {
      return new Date(date).toLocaleString("en-GB");
    }
    return new Date(date).toLocaleString(lang);
  } catch (e) {
    // Fallback to en-GB if anything goes wrong
    return new Date(date).toLocaleString("en-GB");
  }
}