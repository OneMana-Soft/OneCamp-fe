import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enLang from "./locales/en/en.json"

// The app's words.
//
// English comes with the first screen: it is the language every screen
// starts in, and 2 KB of gzip. Every other language is a chunk of its own,
// fetched when someone picks it (loadLanguage). Until 17 Oct 2026 all 23 came
// with every signed-in page, 60 KB of gzip on each, for an app that only ever
// showed English. languages.test.ts keeps it that way, and keeps every
// language on disk reachable through its own file (Estonian was loading the
// Spanish one).

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

const resources = {
    en: {
        translation: enLang
    },
};

i18n
    .use(initReactI18next) // passes i18n down to react-i18next
    .init({
        resources,
        fallbackLng: 'en',
        lng: "en", // language to use, more information here: https://www.i18next.com/overview/configuration-options#languages-namespaces-resources
        // you can use the i18n.changeLanguage function to change the language manually: https://www.i18next.com/overview/api#changelanguage
        // if you're using a language detector, do not define the lng option
        // Treat empty string returns from t() as missing so the
        // configured fallback / parseMissingKeyHandler kicks in.
        returnEmptyString: false,
        // Last-resort safety net: if a key is missing in BOTH the
        // active language and the fallback ('en'), render a humanised
        // version of the camelCase key instead of the raw key. This
        // prevents `t("myTasks")` from rendering as the literal
        // "myTasks" if someone forgets to add the translation.
        parseMissingKeyHandler: (key: string) => {
            // Split camelCase / PascalCase / snake_case into words and
            // Title Case the result.
            const spaced = key
                .replace(/[_-]+/g, " ")
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .trim()
            return spaced
                ? spaced.charAt(0).toUpperCase() + spaced.slice(1)
                : key
        },

        interpolation: {
            escapeValue: false // react already safes from xss
        }
    });
