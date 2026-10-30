// The app's languages: kept apart from the user's types, which every page
// reaches through the store, since only the language picker reads them.

export interface langInterface {
    name: string
    code: string
}

interface langListInterface {
    [code: string]: langInterface;
}

export const appLangList:langListInterface = {
    // Arabic is "ar". It was listed as "am", which is Amharic, though the
    // translation behind it has always been Arabic.
    'ar': {
        name: "Arabic",
        code: "ar"
    },
    'be': {
        name: "Belarusian",
        code: "be"
    },
    'bg': {
        name: "Bulgarian",
        code: "bg"
    },
    'ca': {
        name: "Catalan",
        code: "ca"
    },
    'cs': {
        name: "Czech",
        code: "cs"
    },
    'da': {
        name: "Danish",
        code: "da"
    },
    'de': {
        name: "German",
        code: "de"
    },
    'el': {
        name: "Greek",
        code: "el"
    },
    'en-AU': {
        name: "English (Australia)",
        code: "en-AU"
    },
    'en': {
        name: "English (US)",
        code: "en"
    },
    'es': {
        name: "Spanish",
        code: "es"
    },
    'et': {
        name: "Estonian",
        code: "et"
    },
    'eu': {
        name: "Basque",
        code: "eu"
    },
    'fi': {
        name: "Finnish",
        code: "fi"
    },
    'fr': {
        name: "French",
        code: "fr"
    },
    'he': {
        name: "Hebrew",
        code: "he"
    },
    'hi': {
        name: "Hindi",
        code: "hi"
    },
    'it': {
        name: "Italian",
        code: "it"
    },
    'ja': {
        name: "Japanese",
        code: "ja"
    },
    'nl': {
        name: "Dutch",
        code: "nl"
    },
    'pt': {
        name: "Portuguese",
        code: "pt"
    },
    'ru': {
        name: "Russian",
        code: "ru"
    },
    'sv': {
        name: "Swedish",
        code: "sv"
    }
}

/**
 * Codes saved before a language's code was corrected, and the code they mean
 * now: someone who chose Arabic when it was listed as "am" still has Arabic.
 */
export const LANG_ALIASES: Record<string, string> = { am: "ar" }

/** The language a saved code means, reading an old code as its new one. */
export function appLanguage(code?: string | null): langInterface | undefined {
    if (!code) return undefined
    return appLangList[code] ?? appLangList[LANG_ALIASES[code] ?? ""]
}
