import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { PICKER_CONTROLS } from "./pickerControls"

// Backgrounds made from words (meet-09): the person describes one, the
// workspace's own model writes a recipe for it, this browser paints it, and
// "Use this" puts it behind them, kept on this device. The call never waits
// on the model: the picker stays usable and the camera keeps what it has.

const net = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: net.fetch } }))
const painted = vi.hoisted(() => ({ scenes: [] as unknown[] }))
vi.mock("@/lib/calls/processors/backdrops", async (orig) => {
  const real = await orig<typeof import("@/lib/calls/processors/backdrops")>()
  return {
    ...real,
    // A painted scene, as the canvas would hand it over (jsdom has none).
    drawScene: vi.fn(async (scene: unknown) => {
      painted.scenes.push(scene)
      return new Blob(["jpeg"], { type: "image/jpeg" })
    }),
    backdropUrl: vi.fn(async (id: string) => `blob:${id}`),
  }
})
vi.mock("@/lib/calls/processors/background", () => ({ backgroundUnavailable: async () => null }))
vi.mock("@/components/livekit/callSurface", () => ({ callToast: vi.fn() }))

const { default: AiBackground } = await import("./AiBackground")
const { default: EffectsChooser } = await import("./EffectsChooser")
const { default: Composer } = await import("./madePart")
const { EffectsPicker } = await import("./EffectsPicker")
const { drawScene, sceneFromRecipe } = await import("@/lib/calls/processors/backdrops")
/** The chooser's drawing, as it hands it to the composer (ComposerProps.paint). */
const paint = (recipe: Parameters<typeof sceneFromRecipe>[0]) => drawScene(sceneFromRecipe(recipe))

const RECIPE = { palette: ["#0B1D3A", "#1E3A6B", "#2A4B7C", "#14284F", "#F4E3B1"], layout: "moss", extras: ["stars", "moon"] }
const MODEL = { name: "qwen3:4b-instruct", label: "Qwen3 4B Instruct", provider: "ollama", local: true }
/** The server's answer, as the app's client hands it back (every status but 401 is read, not thrown). */
const answer = (status: number, body: unknown) => ({ status, data: body })
const made = () => net.fetch.mockResolvedValue(answer(200, { msg: "ok", data: { recipe: RECIPE, model: MODEL } }))
/** A model still working: the request ends only when it is cancelled. */
const working = () =>
  net.fetch.mockImplementation(
    (_: string, __: unknown, init: { signal: AbortSignal }) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("The user aborted a request.", "AbortError")))),
  )

beforeEach(() => {
  painted.scenes.length = 0
  URL.createObjectURL = vi.fn(() => "blob:made")
  URL.revokeObjectURL = vi.fn()
  // keepPicture's drawing (picture.ts), faked: the kept scene comes out as this.
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1280, height: 720, close: () => undefined })))
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: () => undefined } as never)
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,SCENE")
})
afterEach(async () => {
  cleanup()
  const { forgetPicture } = await import("@/lib/calls/processors/picture")
  forgetPicture("scene")
  forgetPicture("own")
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  net.fetch.mockReset()
})

const describeIt = () => fireEvent.change(screen.getByLabelText("Describe a background"), { target: { value: "Misty pine forest at dawn" } })
const makeIt = () => fireEvent.click(screen.getByRole("button", { name: "Make it" }))

describe("the composer", () => {
  it("starts with examples to borrow, takes 200 characters, and says the workspace's model makes it", () => {
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    const words = screen.getByLabelText("Describe a background") as HTMLInputElement
    expect(words.maxLength).toBe(200)
    for (const example of ["Misty pine forest at dawn", "Warm library with lamps", "Night sky over quiet hills"]) expect(screen.getByRole("button", { name: example })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Warm library with lamps" }))
    expect(words.value).toBe("Warm library with lamps")
    expect(screen.getByText("Your workspace's model makes it from your words.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Make it" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("sends only the words to the workspace's server, says it's making one, and Cancel stops it with nothing said", async () => {
    working()
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    describeIt()
    makeIt()
    expect(await screen.findByText("Making your background…")).toBeTruthy()
    const [path, sent, init] = net.fetch.mock.calls[0]
    expect(path).toBe("/ai/call-background")
    expect(sent).toEqual({ words: "Misty pine forest at dawn" })
    expect(init.signal.aborted).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(init.signal.aborted).toBe(true)
    await waitFor(() => expect(screen.queryByText("Making your background…")).toBeNull())
    expect(screen.queryByRole("alert")).toBeNull()
    expect((screen.getByLabelText("Describe a background") as HTMLInputElement).value).toBe("Misty pine forest at dawn")
    expect(screen.getByRole("button", { name: "Make it" })).toBeTruthy()
  })

  it("stops asking when it closes", async () => {
    working()
    const { unmount } = render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    describeIt()
    makeIt()
    await screen.findByText("Making your background…")
    unmount()
    expect(net.fetch.mock.calls[0][2].signal.aborted).toBe(true)
  })

  it("paints the model's recipe here, says who made it and that OneCamp doesn't save the words, and Use this hands the picture on", async () => {
    made()
    const onUse = vi.fn()
    render(<AiBackground paint={paint} onUse={onUse} onClose={vi.fn()} />)
    describeIt()
    makeIt()
    const preview = (await screen.findByRole("img", { name: "Your background, made from your words" })) as HTMLImageElement
    expect(preview.getAttribute("src")).toBe("blob:made")
    expect(painted.scenes).toEqual([sceneFromRecipe(RECIPE)])
    expect(screen.getByText("Made by Qwen3 4B Instruct, your workspace's model. OneCamp doesn't save your words.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Use this" }))
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(onUse.mock.calls[0][0]).toBeInstanceOf(Blob)
  })

  it("asks again with the same words on Try again", async () => {
    made()
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    describeIt()
    makeIt()
    await screen.findByRole("button", { name: "Use this" })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(net.fetch).toHaveBeenCalledTimes(2))
    expect(net.fetch.mock.calls[1][1]).toEqual({ words: "Misty pine forest at dawn" })
    await screen.findByRole("button", { name: "Use this" })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:made")
  })

  it("says plainly when the model couldn't make one, or ran out of time, and that the background hasn't changed", async () => {
    net.fetch.mockResolvedValue(answer(503, { msg: "Couldn't make one just now." }))
    const onUse = vi.fn()
    render(<AiBackground paint={paint} onUse={onUse} onClose={vi.fn()} />)
    describeIt()
    makeIt()
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't make one just now. Your background hasn't changed.")
    expect(onUse).not.toHaveBeenCalled()
    // A request that never reached the server reads the same.
    net.fetch.mockRejectedValue(new TypeError("Failed to fetch"))
    makeIt()
    await waitFor(() => expect(net.fetch).toHaveBeenCalledTimes(2))
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't make one just now. Your background hasn't changed.")
  })

  it("passes on the server's own words for what the person can change", async () => {
    net.fetch.mockResolvedValue(answer(400, { msg: "Keep it to 200 characters." }))
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    describeIt()
    makeIt()
    expect((await screen.findByRole("alert")).textContent).toBe("Keep it to 200 characters.")
  })

  it("is off while offline, and says making one needs the workspace's server", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false)
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    describeIt()
    expect((screen.getByRole("button", { name: "Make it" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("You're offline. Making one needs your workspace's server.")).toBeTruthy()
    makeIt()
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it("won't send no words", () => {
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    expect((screen.getByRole("button", { name: "Make it" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("Describe a background"), { target: { value: "   " } })
    expect((screen.getByRole("button", { name: "Make it" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("the scene's tile in the picker", () => {
  const base = {
    controls: PICKER_CONTROLS,
    effects: { background: { kind: "none" as const }, noise: "standard" as const, touchUp: "off" as const, lowLight: false },
    onNoise: vi.fn(),
    onTouchUp: vi.fn(),
    onLowLight: vi.fn(),
    backdrop: vi.fn(async (id: string) => `blob:${id}`),
    picture: { url: null, onChoose: vi.fn(), onForget: vi.fn() },
  }

  it("offers to make one where none is kept, opening the composer rather than choosing", () => {
    const onBackground = vi.fn()
    const onMake = vi.fn()
    render(<EffectsPicker {...base} onBackground={onBackground} scene={{ url: null, onMake, onForget: vi.fn() }} />)
    const tile = screen.getByRole("radio", { name: "Make a background from words" })
    expect(tile.textContent).toContain("Make one")
    fireEvent.click(tile)
    expect(onMake).toHaveBeenCalledTimes(1)
    expect(onBackground).not.toHaveBeenCalled()
  })

  it("chooses a kept scene, offers another and to remove it, and only removing when the workspace's AI is off", () => {
    const onBackground = vi.fn()
    const onForget = vi.fn()
    const { rerender } = render(<EffectsPicker {...base} onBackground={onBackground} scene={{ url: "data:image/jpeg;base64,SCENE", onMake: vi.fn(), onForget }} />)
    fireEvent.click(screen.getByRole("radio", { name: "Your scene" }))
    expect(onBackground).toHaveBeenCalledWith({ kind: "scene" })
    expect(screen.getByRole("button", { name: "Make another" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remove your scene" }))
    expect(onForget).toHaveBeenCalled()
    rerender(<EffectsPicker {...base} onBackground={onBackground} scene={{ url: "data:image/jpeg;base64,SCENE", onForget }} />)
    expect(screen.getByRole("radio", { name: "Your scene" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Make another" })).toBeNull()
    expect(screen.getByRole("button", { name: "Remove your scene" })).toBeTruthy()
  })

  it("isn't there without a scene to make or one kept", () => {
    render(<EffectsPicker {...base} onBackground={vi.fn()} />)
    expect(screen.queryByRole("radio", { name: "Make a background from words" })).toBeNull()
    expect(screen.queryByRole("radio", { name: "Your scene" })).toBeNull()
  })
})

describe("the chooser, with a scene made from words", () => {
  const control = (background: { kind: string } = { kind: "none" }) => ({
    effects: { background, noise: "standard", touchUp: "off", lowLight: false },
    setBackground: vi.fn(),
    setNoise: vi.fn(),
    setTouchUp: vi.fn(),
    setLowLight: vi.fn(),
    busy: null,
    unavailable: async () => null,
  })

  it("makes one inline, keeps the other choices usable meanwhile, and Use this keeps it on this device and puts it on, live", async () => {
    working()
    const c = control()
    render(<EffectsChooser control={c as never} controls={PICKER_CONTROLS} Composer={Composer} />)
    fireEvent.click(screen.getByRole("radio", { name: "Make a background from words" }))
    // The composer is a chunk of its own.
    await screen.findByLabelText("Describe a background")
    describeIt()
    makeIt()
    await screen.findByText("Making your background…")
    // The call doesn't wait: another background can be chosen while the model works.
    fireEvent.click(screen.getByRole("radio", { name: "Lagoon" }))
    expect(c.setBackground).toHaveBeenCalledWith({ kind: "backdrop", id: "lake" })
    expect(screen.getByText("Making your background…")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    made()
    makeIt()
    fireEvent.click(await screen.findByRole("button", { name: "Use this" }))
    await waitFor(() => expect(c.setBackground).toHaveBeenLastCalledWith({ kind: "scene", at: expect.any(Number) }))
    expect(window.localStorage.getItem("onecamp.call.scene")).toBe("data:image/jpeg;base64,SCENE")
    expect(window.localStorage.getItem("onecamp.call.picture")).toBeNull()
    // The composer closes, and the tile shows the scene.
    expect(screen.queryByLabelText("Describe a background")).toBeNull()
    const tile = screen.getByRole("radio", { name: "Your scene" })
    expect(tile.querySelector("img")?.getAttribute("src")).toBe("data:image/jpeg;base64,SCENE")
  })

  it("keeps a scene's tile, without making, where the workspace's AI is off; and shows none where nothing is kept", async () => {
    const { unmount } = render(<EffectsChooser control={control() as never} controls={PICKER_CONTROLS} />)
    expect(screen.queryByRole("radio", { name: "Make a background from words" })).toBeNull()
    expect(screen.queryByRole("radio", { name: "Your scene" })).toBeNull()
    unmount()
    window.localStorage.setItem("onecamp.call.scene", "data:image/jpeg;base64,KEPT")
    const c = control({ kind: "scene" })
    render(<EffectsChooser control={c as never} controls={PICKER_CONTROLS} />)
    expect(screen.getByRole("radio", { name: "Your scene" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.queryByRole("button", { name: "Make another" })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove your scene" })))
    expect(c.setBackground).toHaveBeenCalledWith({ kind: "none" })
    expect(window.localStorage.getItem("onecamp.call.scene")).toBeNull()
  })
})

describe("on a touch screen (meet-09, a3f70a869; B64 T1)", () => {
  it("hands the focus to Make it, never to the words, when a step takes the focused button away: their keyboard would cover the sheet", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: coarse)", media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }))
    working()
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    describeIt()
    screen.getByRole("button", { name: "Make it" }).focus()
    makeIt()
    const cancel = await screen.findByRole("button", { name: "Cancel" })
    cancel.focus()
    fireEvent.click(cancel)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Make it" })))
    expect(document.activeElement).not.toBe(screen.getByLabelText("Describe a background"))
  })
})

// DB-135 F4: the composer comes in place of its loading frame (EffectsChooser's lazy chunk). Focus the frame held
// went with it, to the page: the composer takes it, as a step's own control would. Focus elsewhere stays there.
describe("as it lands where its loading frame was", () => {
  it("takes the focus from the page to the words, and leaves focus that is elsewhere where it is", () => {
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByLabelText("Describe a background"))
    cleanup()
    const tile = document.body.appendChild(document.createElement("button"))
    tile.focus()
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    expect(document.activeElement).toBe(tile)
    tile.remove()
  })

  it("on a touch screen, with no words to make one from, takes it to its Close: never to the words, whose keyboard would cover the sheet", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: coarse)", media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }))
    render(<AiBackground paint={paint} onUse={vi.fn()} onClose={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close making one" }))
  })
})
