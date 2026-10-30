import i18n from "i18next";
// Set up first: a language is added to the words this sets up.
import "./index";

// Every language but English, each a chunk of its own, fetched when someone
// picks one (loadLanguage). Until 17 Oct 2026 all 23 came with every
// signed-in page, 60 KB of gzip on each, for an app that only ever showed
// English. languages.test.ts keeps it that way, and keeps every language on
// disk reachable through its own file (Estonian was loading the Spanish one).
// Its own module (21 Oct 2026): what reads the words carries ./index alone.

type Words = Record<string, unknown>

/** Every language but English, each its own chunk, by its code. */
export const LANGUAGE_LOADERS: Record<string, () => Promise<{ default: Words }>> = {
    ar: () => import("./locales/ar/ar.json"),
    be: () => import("./locales/be/be.json"),
    bg: () => import("./locales/bg/bg.json"),
    ca: () => import("./locales/ca/ca.json"),
    cs: () => import("./locales/cs/cs.json"),
    da: () => import("./locales/da/da.json"),
    de: () => import("./locales/de/de.json"),
    el: () => import("./locales/el/el.json"),
    "en-AU": () => import("./locales/en-AU/en-AU.json"),
    es: () => import("./locales/es/es.json"),
    et: () => import("./locales/et/et.json"),
    eu: () => import("./locales/eu/eu.json"),
    fi: () => import("./locales/fi/fi.json"),
    fr: () => import("./locales/fr/fr.json"),
    he: () => import("./locales/he/he.json"),
    hi: () => import("./locales/hi/hi.json"),
    it: () => import("./locales/it/it.json"),
    ja: () => import("./locales/ja/ja.json"),
    nl: () => import("./locales/nl/nl.json"),
    pt: () => import("./locales/pt/pt.json"),
    ru: () => import("./locales/ru/ru.json"),
    sv: () => import("./locales/sv/sv.json"),
}

/**
 * Switches the app's words to `lng`, fetching them first if this tab hasn't.
 * False, and nothing changes, for a language the app doesn't have.
 */
export async function loadLanguage(lng: string): Promise<boolean> {
    if (lng !== "en" && !i18n.hasResourceBundle(lng, "translation")) {
        const load = LANGUAGE_LOADERS[lng]
        if (!load) return false
        const words = (await load()).default
        i18n.addResourceBundle(lng, "translation", words, true, true)
    }
    await i18n.changeLanguage(lng)
    return true
}
