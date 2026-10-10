import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { AppLanguageCombobox } from "@/components/dialog/appLanguageCombobox"

afterEach(cleanup)

// The language field sits in the profile's grid of text inputs, so it is
// drawn at an input's own height: 44px on a phone, 36px from md up.
describe("the language field", () => {
  it("is an input's height", () => {
    render(<AppLanguageCombobox userLang="en" onLangChange={() => {}} />)
    const trigger = screen.getByRole("combobox")
    expect(trigger.className).toMatch(/(^|\s)h-11(\s|$)/)
    expect(trigger.className).toContain("md:h-9")
  })

  it("shows a language saved under its old code by its name", () => {
    render(<AppLanguageCombobox userLang="am" onLangChange={() => {}} />)
    expect(screen.getByRole("combobox").textContent).toContain("Arabic")
  })
})
