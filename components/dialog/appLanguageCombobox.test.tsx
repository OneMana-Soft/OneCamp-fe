import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { AppLanguageCombobox } from "@/components/dialog/appLanguageCombobox"

afterEach(cleanup)

// The language field sits in the profile's grid of text inputs, so it is
// drawn at an input's own height: 44px on a phone, 32px from md up (design
// v3's field; it was 36 beside 32px fields, critic 11 Oct).
describe("the language field", () => {
  it("is an input's height", () => {
    render(<AppLanguageCombobox userLang="en" onLangChange={() => {}} />)
    const trigger = screen.getByRole("combobox")
    expect(trigger.className).toMatch(/(^|\s)h-11(\s|$)/)
    expect(trigger.className).toContain("md:h-8")
  })

  // Keyed by code, the list put "Australian English" between Greek and
  // English-US (DESIGN-BUILD-2, 18 Oct): by name, the two Englishes sit together.
  it("lists the languages by their names, the two Englishes together", () => {
    render(<AppLanguageCombobox userLang="en" onLangChange={() => {}} />)
    fireEvent.click(screen.getByRole("combobox"))
    const names = screen.getAllByRole("option").map((o) => o.textContent ?? "")
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(names.indexOf("English (US)") - names.indexOf("English (Australia)")).toBe(1)
  })

  it("shows a language saved under its old code by its name", () => {
    render(<AppLanguageCombobox userLang="am" onLangChange={() => {}} />)
    expect(screen.getByRole("combobox").textContent).toContain("Arabic")
  })
})
