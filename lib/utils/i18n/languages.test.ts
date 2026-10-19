import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import i18n from "i18next"
import { afterEach, describe, expect, it } from "vitest"

import { LANGUAGE_LOADERS, loadLanguage } from "./index"

// The app's words on the first screen (17 Oct 2026). Every signed-in page
// carried all 23 languages, 60 KB of gzip, though the app only ever showed
// English. English stays on the first screen and the rest are chunks of
// their own, fetched by loadLanguage when someone picks one.

const HERE = __dirname
const SOURCE = readFileSync(join(HERE, "index.ts"), "utf8")
const ON_DISK = readdirSync(join(HERE, "locales"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

afterEach(async () => {
  await i18n.changeLanguage("en")
})

describe("the app's words", () => {
  it("bring only English with the first screen", () => {
    // A static import of a locale is the only way one rides in with the page.
    const statics = [...SOURCE.matchAll(/^\s*import\s+\w+\s+from\s+["'](\.\/locales\/[^"']+)["']/gm)].map((m) => m[1])
    expect(statics).toEqual(["./locales/en/en.json"])
  })

  it("can fetch every other language on disk, each from its own file", () => {
    expect(Object.keys(LANGUAGE_LOADERS).sort()).toEqual(ON_DISK.filter((c) => c !== "en"))
    for (const code of ON_DISK.filter((c) => c !== "en")) {
      // Estonian once loaded the Spanish file: each loader names its own.
      expect(SOURCE, code).toContain(`import("./locales/${code}/${code}.json")`)
    }
  })

  it("switches to a language once its words have come", async () => {
    const fr = JSON.parse(readFileSync(join(HERE, "locales", "fr", "fr.json"), "utf8")) as Record<string, unknown>
    const en = JSON.parse(readFileSync(join(HERE, "locales", "en", "en.json"), "utf8")) as Record<string, unknown>
    // A key whose French differs from its English, so the switch shows.
    const key = Object.keys(fr).find((k) => typeof fr[k] === "string" && fr[k] !== en[k])
    expect(key, "fr.json has a word that differs from English").toBeTruthy()
    expect(i18n.hasResourceBundle("fr", "translation")).toBe(false)

    expect(await loadLanguage("fr")).toBe(true)
    expect(i18n.language).toBe("fr")
    expect(i18n.t(key!)).toBe(fr[key!])

    expect(await loadLanguage("en")).toBe(true)
    expect(i18n.t(key!)).toBe(en[key!])
  })

  it("refuses a language it doesn't have, and stays where it was", async () => {
    expect(await loadLanguage("xx")).toBe(false)
    expect(i18n.language).toBe("en")
  })
})
