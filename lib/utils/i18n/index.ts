import { useSyncExternalStore } from "react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enLang from "./locales/en/en.json"

// The app's words, read through this module only (languages.test.ts): it sets
// i18next up as it loads, so they come with the first component that reads
// them (the task views, the profile card), never with every first screen
// (fluid-15). English comes with them; the rest: ./languages.

/** The app's words, for a component: set up before they can be read. */
export { useTranslation } from "react-i18next";

const language = () => i18n.language;
const onLanguage = (f: () => void) => (i18n.on("languageChanged", f), () => i18n.off("languageChanged", f));

/** `key` in the reader's language, else `fallback`: the one i18n, not useTranslation's copy a mount (fluid-17). */
export const useWord = (key: string, fallback: string): string =>
    useSyncExternalStore(onLanguage, language, language) && key ? i18n.t(key, { defaultValue: fallback }) : fallback;

i18n.use(initReactI18next).init({
    resources: { en: { translation: enLang } },
    fallbackLng: "en",
    lng: "en",
    // An empty string is missing, so the fallback below applies.
    returnEmptyString: false,
    // A key missing in English too draws as words ("myTasks" as "My tasks"), never as itself.
    parseMissingKeyHandler: (key: string) => {
        const spaced = key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim()
        return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key
    },
    interpolation: { escapeValue: false }, // React escapes what it draws.
});
