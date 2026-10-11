import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// The first run's steps 2 and 3 (design v3, admin.md E2, E3). Step 2's
// colour is the person's own theme, kept by the existing theme provider in
// this browser (no API); Skip leaves whatever was there. Step 3 turns a
// pasted list into one invitation each and opens OneCamp.

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }))
const invite = vi.hoisted(() => vi.fn(async () => ({ ok: true, answer: {} })))
vi.mock("@/services/invitationService", () => ({ invite }))

import { ActiveThemeProvider } from "@/components/activeTheme/activeTheme"
import { TeamStep, ThemeStep } from "@/components/auth/FirstRun"

beforeEach(() => {
  localStorage.clear()
  invite.mockClear()
})
afterEach(cleanup)

const themeStep = (onDone = vi.fn(), onPreview = vi.fn()) =>
  render(
    <ActiveThemeProvider>
      <ThemeStep onDone={onDone} onPreview={onPreview} />
    </ActiveThemeProvider>,
  )

describe("make it yours", () => {
  it("offers nine colours and keeps the one chosen through the theme provider", () => {
    const onDone = vi.fn()
    themeStep(onDone)
    const swatches = within(screen.getByRole("radiogroup", { name: "Colour" })).getAllByRole("radio")
    expect(swatches).toHaveLength(9)
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }))
    expect(localStorage.getItem("onecamp-theme-color")).toBe("blue")
    expect(document.body.classList.contains("theme-blue")).toBe(true)
    expect(screen.getByRole("radio", { name: "Blue" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(onDone).toHaveBeenCalled()
  })

  it("leaves the default as it was on Skip", () => {
    const onDone = vi.fn()
    themeStep(onDone)
    fireEvent.click(screen.getByRole("button", { name: "Skip" }))
    expect(onDone).toHaveBeenCalled()
    expect(localStorage.getItem("onecamp-theme-color")).toBeNull()
    expect(screen.getByRole("radio", { name: "Camp" }).getAttribute("aria-checked")).toBe("true")
  })

  it("previews a colour under the pointer and lets it go on leaving", () => {
    const onPreview = vi.fn()
    themeStep(vi.fn(), onPreview)
    fireEvent.mouseEnter(screen.getByRole("radio", { name: "Violet" }))
    expect(onPreview).toHaveBeenLastCalledWith("violet")
    fireEvent.mouseLeave(screen.getByRole("radiogroup", { name: "Colour" }))
    expect(onPreview).toHaveBeenLastCalledWith(null)
  })
})

describe("who's coming", () => {
  it("turns a pasted list into chips, counts them on the button and sends one invitation each", async () => {
    const onPeople = vi.fn()
    const onFinish = vi.fn()
    render(<TeamStep onPeople={onPeople} onFinish={onFinish} />)
    const field = screen.getByLabelText("Email addresses")
    fireEvent.paste(field, { clipboardData: { getData: () => "ana@x.io, ben@x.io\nnot-an-address" } })
    expect(onPeople).toHaveBeenLastCalledWith(["ana@x.io", "ben@x.io"])
    expect(screen.getByTitle("This isn't an email address")).toBeTruthy()
    const send = screen.getByRole("button", { name: "Send 2 invitations and open OneCamp" })
    await act(async () => void fireEvent.click(send))
    expect(invite).toHaveBeenCalledTimes(2)
    expect(invite).toHaveBeenCalledWith("ana@x.io", true)
    expect(onFinish).toHaveBeenCalled()
  })

  it("can be left for later", () => {
    const onFinish = vi.fn()
    render(<TeamStep onPeople={vi.fn()} onFinish={onFinish} />)
    fireEvent.click(screen.getByRole("button", { name: "I'll do this later" }))
    expect(onFinish).toHaveBeenCalled()
    expect(invite).not.toHaveBeenCalled()
  })
})
