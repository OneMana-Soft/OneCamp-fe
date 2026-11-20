import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { PICKER_CONTROLS } from "./pickerControls"

vi.mock("@/lib/calls/processors/backdrops", () => ({ backdropUrl: vi.fn(async (id: string) => `blob:${id}`) }))
vi.mock("@/lib/calls/processors/background", () => ({ backgroundUnavailable: async () => null }))
vi.mock("@/components/livekit/callSurface", () => ({ callToast: vi.fn() }))

const control = () => ({
  effects: { background: { kind: "none" }, noise: "standard", touchUp: "off", lowLight: false },
  setBackground: vi.fn(),
  setNoise: vi.fn(),
  setTouchUp: vi.fn(),
  setLowLight: vi.fn(),
  busy: null,
  unavailable: async () => null,
})

beforeEach(() => vi.resetModules())
afterEach(() => {
  cleanup()
  vi.doUnmock("./EffectsChooser")
})

// The chooser itself is ONE lazy entry that every surface shares (chooserPart.tsx, MAIN RULING 11 Nov), so its code is
// one chunk, not a copy in each surface's. Each surface warms it as it mounts; while it comes, its place holds; a chunk
// that can't come says so in that place, with Try again, and never takes the surface with it.
describe("the chooser's chunk", () => {
  /** The chooser's part, with its chunk answering as `chunk` does. */
  async function part(chunk: () => unknown) {
    vi.doMock("./EffectsChooser", chunk as never)
    return (await import("./chooserPart")).chooser
  }

  it("holds the chooser's place while it loads, and says so to a screen reader", async () => {
    const chooser = await part(() => new Promise(() => {}))
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} />)
    expect((await screen.findByRole("status")).textContent).toBe("Loading…")
    expect(document.querySelector("[data-effects-loading]")?.getAttribute("aria-busy")).toBe("true")
    expect(screen.queryByRole("radio")).toBeNull()
  })

  it("draws the chooser at once where a surface warmed it as it mounted", async () => {
    const chooser = await part(() => vi.importActual("./EffectsChooser"))
    expect(await chooser.warm()).toBe(true)
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} />)
    expect(screen.getByRole("radio", { name: "Strong blur" })).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says it couldn't load in its own place, and asks again on Try again", async () => {
    let asked = 0
    const chooser = await part(() => {
      asked++
      if (asked === 1) throw new Error("Failed to load chunk")
      return vi.importActual("./EffectsChooser")
    })
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} />)
    expect((await screen.findByRole("alert")).textContent).toBe("Backgrounds and sound couldn't load. Check your connection, then try again.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("radio", { name: "Strong blur" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(asked).toBe(2)
  })

  it("asks again by itself when the browser is back online", async () => {
    let asked = 0
    const chooser = await part(() => {
      asked++
      if (asked === 1) throw new Error("Failed to load chunk")
      return vi.importActual("./EffectsChooser")
    })
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} />)
    await screen.findByRole("alert")
    window.dispatchEvent(new Event("online"))
    expect(await screen.findByRole("radio", { name: "Strong blur" })).toBeTruthy()
  })
})
