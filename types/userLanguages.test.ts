import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { appLangList, appLanguage } from "@/types/user"

// Arabic was listed under "am", which is Amharic's code, though the
// translation behind it has always been Arabic.
describe("the languages a person can choose", () => {
  it("lists Arabic under Arabic's own code, and nothing under Amharic's", () => {
    expect(appLangList.ar).toEqual({ name: "Arabic", code: "ar" })
    expect(appLangList.am).toBeUndefined()
  })

  it("ships Arabic text under that code", () => {
    const ar = JSON.parse(readFileSync(join(process.cwd(), "lib/utils/i18n/locales/ar/ar.json"), "utf8")) as Record<string, unknown>
    const text = Object.values(ar).filter((v): v is string => typeof v === "string").join(" ")
    expect(text).toMatch(/[؀-ۿ]/)
  })

  it("still reads a saved 'am' as Arabic, so nobody loses their choice", () => {
    expect(appLanguage("am")?.name).toBe("Arabic")
    expect(appLanguage("de")?.name).toBe(appLangList.de.name)
    expect(appLanguage(undefined)).toBeUndefined()
  })

  it("keys every language by its own code", () => {
    for (const [key, lang] of Object.entries(appLangList)) expect(lang.code).toBe(key)
  })
})
