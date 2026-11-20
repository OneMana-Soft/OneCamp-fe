import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { PICKER_CONTROLS } from "./pickerControls"

// The made background's composer (meet-09) is a lazy chunk of its own, in the made part every picker draws (madePart):
// while it loads, its frame holds the composer's place; if it can't load, the frame says so and still closes.
// One failed fetch (offline for a moment) never sticks: Make one, Try again, or the browser back online asks again,
// without a reload, which would leave the call (CR-B64 F1, DB-135 F3).

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

/** The chooser, with the composer's chunk answering as `chunk` does. */
async function chooser(chunk: () => unknown) {
  vi.doMock("./AiBackground", chunk as never)
  const { default: EffectsChooser } = await import("./EffectsChooser")
  const { default: Composer } = await import("./madePart")
  render(<EffectsChooser control={control() as never} controls={PICKER_CONTROLS} Composer={Composer} />)
  fireEvent.click(screen.getByRole("radio", { name: "Make a background from words" }))
}

/** A chunk that fails its first ask (offline for a moment), then comes: the composer, as a box for its words. */
function failsOnce() {
  let asked = 0
  return {
    asked: () => asked,
    load: () => {
      asked++
      if (asked === 1) throw new Error("Failed to load chunk")
      return { default: () => <textarea aria-label="Describe a background" /> }
    },
  }
}

beforeEach(() => vi.resetModules())
afterEach(() => {
  cleanup()
  vi.doUnmock("./AiBackground")
  vi.doUnmock("./EffectsChooser")
})

describe("the composer's chunk", () => {
  it("holds the composer's place in its frame while it loads", async () => {
    await chooser(() => new Promise(() => {}))
    const frame = (await screen.findByText("Describe a background")).closest("[data-made-background]")
    expect(frame?.getAttribute("aria-busy")).toBe("true")
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("says it couldn't, in the composer's words, if it can't load, and Close still closes it", async () => {
    await chooser(() => {
      throw new Error("Failed to load chunk")
    })
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't make one just now. Your background hasn't changed.")
    fireEvent.click(screen.getByRole("button", { name: "Close making one" }))
    expect(document.querySelector("[data-made-background]")).toBeNull()
    expect(screen.getByRole("radio", { name: "Make a background from words" })).toBeTruthy()
  })

  it("says it's loading, to a screen reader too, and its Close closes it, handing the focus back to Make one", async () => {
    await chooser(() => new Promise(() => {}))
    expect((await screen.findByRole("status")).textContent).toBe("Loading…")
    fireEvent.click(screen.getByRole("button", { name: "Close making one" }))
    expect(document.querySelector("[data-made-background]")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Make a background from words" })))
  })

  // CR-B64's probe (review-b64/h4b/probe-retry.test.tsx): it fails once, then could load.
  it("asks for it again when Make one opens it again after it couldn't load, and the composer comes", async () => {
    const chunk = failsOnce()
    await chooser(chunk.load)
    await screen.findByRole("alert")
    fireEvent.click(screen.getByRole("button", { name: "Close making one" }))
    window.dispatchEvent(new Event("online"))
    fireEvent.click(screen.getByRole("radio", { name: "Make a background from words" }))
    expect(await screen.findByRole("textbox", { name: "Describe a background" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(chunk.asked()).toBe(2)
  })

  it("asks for it again on Try again, beside its Close, keeping the composer's words for what happened", async () => {
    const chunk = failsOnce()
    await chooser(chunk.load)
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't make one just now. Your background hasn't changed.")
    expect(screen.getByRole("button", { name: "Close making one" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("textbox", { name: "Describe a background" })).toBeTruthy()
    expect(chunk.asked()).toBe(2)
  })

  it("asks for it again by itself when the browser is back online", async () => {
    const chunk = failsOnce()
    await chooser(chunk.load)
    await screen.findByRole("alert")
    window.dispatchEvent(new Event("online"))
    expect(await screen.findByRole("textbox", { name: "Describe a background" })).toBeTruthy()
  })

  // DB-135 F4: the loading frame's Close held the focus and went as the composer came; the composer takes it.
  it("takes the focus into the composer as it lands, when the loading frame's Close held it", async () => {
    let land = () => {}
    const landed = new Promise<void>((r) => (land = r))
    await chooser(async () => {
      await landed
      return vi.importActual("./AiBackground")
    })
    screen.getByRole("button", { name: "Close making one" }).focus()
    land()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Describe a background")))
  })
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
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} made />)
    expect((await screen.findByRole("status")).textContent).toBe("Loading…")
    expect(document.querySelector("[data-effects-loading]")?.getAttribute("aria-busy")).toBe("true")
    expect(screen.queryByRole("radio")).toBeNull()
  })

  it("draws the chooser at once where a surface warmed it as it mounted", async () => {
    const chooser = await part(() => vi.importActual("./EffectsChooser"))
    expect(await chooser.warm()).toBe(true)
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} made />)
    expect(screen.getByRole("radio", { name: "Make a background from words" })).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says it couldn't load in its own place, and asks again on Try again", async () => {
    let asked = 0
    const chooser = await part(() => {
      asked++
      if (asked === 1) throw new Error("Failed to load chunk")
      return vi.importActual("./EffectsChooser")
    })
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} made />)
    expect((await screen.findByRole("alert")).textContent).toBe("Backgrounds and sound couldn't load. Check your connection, then try again.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("radio", { name: "Make a background from words" })).toBeTruthy()
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

describe("the made part's chunk", () => {
  /** The chooser's part, with the chooser and the composer at hand and the made part's chunk answering as `chunk` does. */
  async function part(chunk: () => unknown) {
    vi.doMock("./EffectsChooser", () => vi.importActual("./EffectsChooser"))
    vi.doMock("./AiBackground", () => ({ default: () => <textarea aria-label="Describe a background" /> }))
    vi.doMock("./madePart", chunk as never)
    return (await import("./chooserPart")).chooser
  }
  afterEach(() => vi.doUnmock("./madePart"))

  it("says it couldn't load in the composer's place, keeps the chooser, and asks again on Try again", async () => {
    let asked = 0
    const chooser = await part(() => {
      asked++
      if (asked === 1) throw new Error("Failed to load chunk")
      return vi.importActual("./madePart")
    })
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} made />)
    fireEvent.click(await screen.findByRole("radio", { name: "Make a background from words" }))
    expect((await screen.findByRole("alert")).textContent).toBe("Making a background couldn't load. Check your connection, then try again.")
    expect(screen.getByRole("radio", { name: "Strong blur" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("textbox", { name: "Describe a background" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(asked).toBe(2)
  })

  it("puts its place away on Close making one, beside Try again, handing the focus back to Make one", async () => {
    const chooser = await part(() => {
      throw new Error("Failed to load chunk")
    })
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} made />)
    fireEvent.click(await screen.findByRole("radio", { name: "Make a background from words" }))
    await screen.findByRole("alert")
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Close making one" }))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Make a background from words" })))
  })

  it("is never asked for where no one may make one (a guest, or the workspace's AI off)", async () => {
    let asked = 0
    const chooser = await part(() => {
      asked++
      return vi.importActual("./madePart")
    })
    expect(await chooser.warm()).toBe(true)
    render(<chooser.Part control={control() as never} controls={PICKER_CONTROLS} />)
    expect(screen.getByRole("radio", { name: "Strong blur" })).toBeTruthy()
    expect(screen.queryByRole("radio", { name: "Make a background from words" })).toBeNull()
    expect(asked).toBe(0)
  })
})
