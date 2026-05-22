import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import amLang from "./locales/am/am.json"
import beLang from "./locales/be/be.json"
import bgLang from "./locales/bg/bg.json"
import caLang from "./locales/ca/ca.json"
import csLang from "./locales/cs/cs.json"
import daLang from "./locales/da/da.json"
import deLang from "./locales/de/de.json"
import elLang from "./locales/el/el.json"
import enAuLang from "./locales/en-AU/en-AU.json"
import esLang from "./locales/es/es.json"
import etLang from "./locales/es/es.json"
import euLang from "./locales/eu/eu.json"
import fiLang from "./locales/fi/fi.json"
import heLang from "./locales/he/he.json"
import hiLang from "./locales/hi/hi.json"
import itLang from "./locales/it/it.json"
import jaLang from "./locales/ja/ja.json"
import nlLang from "./locales/nl/nl.json"
import ptLang from "./locales/pt/pt.json"
import ruLang from "./locales/ru/ru.json"
import svLang from "./locales/sv/sv.json"
import enLang from "./locales/en/en.json"
import frLang from "./locales/fr/fr.json"


// the translations
// (tip move them in a JSON file and import them,
// or even better, manage them separated from your code: https://react.i18next.com/guides/multiple-translation-files)
const resources = {
    am: {
        translation: amLang
    },
    be: {
        translation: beLang
    },
    bg: {
        translation: bgLang
    },
    ca: {
        translation: caLang
    },
    cs: {
        translation: csLang
    },
    da: {
        translation: daLang
    },
    de: {
        translation: deLang
    },
    el: {
        translation: elLang
    },
    en: {
        translation: enLang
    },
    "en-AU":{
        translation: enAuLang
    },
    es: {
        translation: esLang
    },
    et: {
        translation: etLang
    },
    eu: {
        translation: euLang
    },
    fi: {
        translation: fiLang
    },
    fr: {
        translation: frLang
    },
    he: {
        translation: heLang
    },
    hi: {
        translation: hiLang
    },
    it: {
        translation: itLang
    },
    ja: {
        translation: jaLang
    },
    nl: {
        translation: nlLang
    },
    pt: {
        translation: ptLang
    },
    ru: {
        translation: ruLang
    },
    sv: {
        translation: svLang
    }
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

export default i18n;