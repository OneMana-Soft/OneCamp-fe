import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// Backgrounds and sound in a call: they cost nothing until someone turns one
// on, they go on as the camera and microphone publish, and the picker offers
// every choice in words.

const runner = vi.hoisted(() => ({ made: 0, ctx: null as null | { lightened: () => void }, camera: vi.fn(async () => undefined), noise: vi.fn(async () => undefined), watch: vi.fn(() => () => undefined) }))
vi.mock("./effectsRunner", () => ({
  makeRunner: (ctx: { lightened: () => void }) => {
    runner.made++
    runner.ctx = ctx
    return { camera: runner.camera, noise: runner.noise, watch: runner.watch }
  },
}))

const { useCallEffects } = await import("./useCallEffects")
const { EffectsPicker } = await import("./EffectsPicker")

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  runner.made = 0
  vi.clearAllMocks()
})

/** A room whose local participant has a camera and a microphone, and can publish more. */
function fakeRoom(published: { source: string; track: object }[] = []) {
  const listeners: ((pub: unknown) => void)[] = []
  const pubs = new Map(published.map((p, i) => [String(i), p]))
  return {
    room: {
      localParticipant: {
        on: (_: string, f: (pub: unknown) => void) => listeners.push(f),
        off: () => undefined,
        trackPublications: pubs,
        getTrackPublication: (source: string) => [...pubs.values()].find((p) => p.source === source),
      },
    } as never,
    publish: (pub: { source: string; track: object }) => listeners.forEach((f) => f(pub)),
  }
}

describe("a call's effects", () => {
  it("load nothing in a call with none chosen", async () => {
    const { room, publish } = fakeRoom()
    renderHook(() => useCallEffects(room))
    await act(async () => publish({ source: "camera", track: {} }))
    await act(async () => publish({ source: "microphone", track: {} }))
    expect(runner.made).toBe(0)
  })

  it("go on as the camera and microphone publish, when chosen on this device", async () => {
    window.localStorage.setItem("onecamp.call.effects", JSON.stringify({ background: { kind: "blur", strength: "light" }, noise: "strong" }))
    const camera = {}
    const mic = {}
    const { room, publish } = fakeRoom()
    renderHook(() => useCallEffects(room))
    await act(async () => publish({ source: "camera", track: camera }))
    await act(async () => publish({ source: "microphone", track: mic }))
    expect(runner.made).toBe(1)
    expect(runner.camera).toHaveBeenCalledWith(camera, { background: { kind: "blur", strength: "light" }, touchUp: "off", lowLight: false })
    expect(runner.noise).toHaveBeenCalledWith(mic, "strong")
    // And the strain watch runs while they are on.
    expect(runner.watch).toHaveBeenCalled()
  })

  it("say while the computer's strain has made them lighter, until the person chooses again", async () => {
    window.localStorage.setItem("onecamp.call.effects", JSON.stringify({ background: { kind: "none" }, noise: "strong" }))
    const { room } = fakeRoom([{ source: "microphone", track: {} }])
    const { result } = renderHook(() => useCallEffects(room))
    await act(async () => undefined)
    expect(result.current.lightened).toBe(false)
    await act(async () => runner.ctx?.lightened())
    expect(result.current.lightened).toBe(true)
    await act(async () => result.current.setNoise("strong"))
    expect(result.current.lightened).toBe(false)
  })

  it("are put on the live camera when chosen in the call, and remembered", async () => {
    const camera = {}
    const { room } = fakeRoom([{ source: "camera", track: camera }])
    const { result } = renderHook(() => useCallEffects(room))
    expect(runner.made).toBe(0)
    await act(async () => result.current.setBackground({ kind: "backdrop", id: "lake" }))
    expect(runner.camera).toHaveBeenCalledWith(camera, { background: { kind: "backdrop", id: "lake" }, touchUp: "off", lowLight: false })
    expect(JSON.parse(window.localStorage.getItem("onecamp.call.effects")!)).toMatchObject({ background: { kind: "backdrop", id: "lake" } })
    expect(result.current.effects.background).toEqual({ kind: "backdrop", id: "lake" })
  })

  it("put a touch-up and low light on the live camera as one look with its background, remembered, and watched", async () => {
    const camera = {}
    const mic = {}
    const { room } = fakeRoom([
      { source: "camera", track: camera },
      { source: "microphone", track: mic },
    ])
    const { result } = renderHook(() => useCallEffects(room))
    await act(async () => result.current.setTouchUp("smooth"))
    expect(runner.made).toBe(1)
    expect(runner.camera).toHaveBeenLastCalledWith(camera, { background: { kind: "none" }, touchUp: "smooth", lowLight: false })
    await act(async () => result.current.setLowLight(true))
    expect(runner.camera).toHaveBeenLastCalledWith(camera, { background: { kind: "none" }, touchUp: "smooth", lowLight: true })
    // The camera's look changed, not the sound: the microphone is left alone.
    expect(runner.noise).not.toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem("onecamp.call.effects")!)).toMatchObject({ touchUp: "smooth", lowLight: true })
    expect(result.current.effects).toMatchObject({ touchUp: "smooth", lowLight: true })
    // The strain watch runs while they are on.
    expect(runner.watch).toHaveBeenCalled()
  })

  it("put a touch-up chosen on this device on as the camera publishes, with no background", async () => {
    window.localStorage.setItem("onecamp.call.effects", JSON.stringify({ touchUp: "subtle", lowLight: true }))
    const camera = {}
    const { room, publish } = fakeRoom()
    renderHook(() => useCallEffects(room))
    await act(async () => publish({ source: "camera", track: camera }))
    expect(runner.camera).toHaveBeenCalledWith(camera, { background: { kind: "none" }, touchUp: "subtle", lowLight: true })
  })
})

describe("the call route's first load", () => {
  // A dynamic import() is a chunk of its own, loaded when it runs; only the
  // static imports below a call's page are its first load.
  const HEAVY = ["@livekit/track-processors", "@mediapipe/tasks-vision", "@sapphi-red/web-noise-suppressor"]
  const LAZY = [
    "lib/calls/processors/effects", "lib/calls/processors/background", "lib/calls/processors/noise", "lib/calls/processors/backdrops", "lib/calls/processors/picture", "lib/calls/processors/strain", "lib/calls/onePeerConnection",
    "components/call/effects/CallEffects", "components/call/effects/GreenRoomEffects", "components/call/effects/useCallEffects", "components/call/effects/useGreenRoomEffects", "components/call/effects/effectsRunner", "components/call/effects/EffectsPicker", "components/call/effects/EffectsChooser", "components/call/effects/CallEffectsPanel",
    "components/livekit/CallPeoplePanel", "components/livekit/PersonMenuItems",
    // Hands (CALLS-3a): what changes your hand, its badge, the signs that stay, and the unmute notice.
    "lib/calls/hands", "components/livekit/handsRunner", "components/livekit/HandBadge", "components/livekit/FeedbackRow", "components/livekit/unmuteToast",
    // The lobby (CALLS-2): its list and notice for whoever lets people in, and the guest's wait.
    "lib/calls/lobby", "components/livekit/KnockBar", "components/livekit/CallLobbySection", "components/guest/GuestLobby", "components/guest/waitToBeLetIn", "services/guestKnock",
  ]
  const ENTRIES = ["app/app/meet/ch/[channelId]/page.tsx", "app/app/meet/m/[meetingId]/page.tsx", "app/app/meet/instant/page.tsx", "app/guest/m/[token]/page.tsx", "app/r/[slug]/page.tsx", "app/app/channel/[channel-id]/page.tsx"]
  const importRe = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm
  const root = path.join(__dirname, "..", "..", "..")
  const resolve = (spec: string, from: string): string | null => {
    const base = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : spec.startsWith(".") ? path.join(path.dirname(from), spec) : null
    if (!base) return null
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (existsSync(c) && /\.tsx?$/.test(c)) return c
    return null
  }

  it("reaches none of the effects' code, MediaPipe or RNNoise, nor anything opened by a click", () => {
    for (const entry of ENTRIES) {
      const seen = new Set<string>([path.join(root, entry)])
      const queue = [...seen]
      const found: string[] = []
      while (queue.length) {
        const file = queue.shift()!
        const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
        for (const m of src.matchAll(importRe)) {
          if (HEAVY.some((h) => m[1] === h || m[1].startsWith(`${h}/`))) found.push(`${m[1]} from ${path.relative(root, file)}`)
          const next = resolve(m[1], file)
          if (!next || seen.has(next)) continue
          const rel = path.relative(root, next).replace(/\.tsx?$/, "")
          if (LAZY.includes(rel)) found.push(`${rel} from ${path.relative(root, file)}`)
          seen.add(next)
          queue.push(next)
        }
      }
      expect(found, entry).toEqual([])
    }
  })
})

describe("the picker", () => {
  const picker = (over: Partial<Parameters<typeof EffectsPicker>[0]> = {}) => {
    const props = {
      effects: { background: { kind: "none" as const }, noise: "standard" as const, touchUp: "off" as const, lowLight: false },
      onBackground: vi.fn(),
      onNoise: vi.fn(),
      onTouchUp: vi.fn(),
      onLowLight: vi.fn(),
      backdrop: vi.fn(async (id: string) => `blob:${id}`),
      picture: { url: null, onChoose: vi.fn(), onForget: vi.fn() },
      ...over,
    }
    render(<EffectsPicker {...props} />)
    return props
  }

  it("offers every background and noise level in words, and says it all runs on this device", () => {
    picker()
    const backgrounds = screen.getByRole("radiogroup", { name: "Background" })
    for (const name of ["No effect", "Light blur", "Strong blur", "Meadow", "Sunrise", "Lagoon", "Open sky", "Dusk", "Berry", "Add a picture of your own"]) {
      expect(backgrounds.querySelector(`[aria-label="${name}"]`), name).toBeTruthy()
    }
    const noise = screen.getByRole("radiogroup", { name: "Noise reduction" })
    expect([...noise.querySelectorAll('[role="radio"]')].map((r) => r.textContent)).toEqual([
      "StandardYour browser's own noise reduction",
      "StrongRemoves typing, traffic and fans, on this device",
      "OffYour sound as it is, for music",
    ])
    expect(screen.getByText("Effects run on this device. Nothing you show or say is sent anywhere to make them.")).toBeTruthy()
  })

  it("hands on what is picked", () => {
    const p = picker()
    fireEvent.click(screen.getByRole("radio", { name: "Strong blur" }))
    expect(p.onBackground).toHaveBeenCalledWith({ kind: "blur", strength: "strong" })
    fireEvent.click(screen.getByRole("radio", { name: "Lagoon" }))
    expect(p.onBackground).toHaveBeenCalledWith({ kind: "backdrop", id: "lake" })
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Noise reduction" })).getByRole("radio", { name: /^Strong/ }))
    expect(p.onNoise).toHaveBeenCalledWith("strong")
  })

  it("offers a touch-up in three levels and low light as a switch, both off at first, between the background and the sound", () => {
    picker()
    const touchUp = screen.getByRole("radiogroup", { name: "Touch-up" })
    expect(within(touchUp).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([
      ["Off", "true"],
      ["Subtle", "false"],
      ["Smooth", "false"],
    ])
    expect(screen.getByText("Softens skin. Your eyes and edges stay sharp.")).toBeTruthy()
    const low = screen.getByRole("switch", { name: "Low light" })
    expect(low.getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText("Brightens you when your room is dark.")).toBeTruthy()
    const headings = screen.getAllByRole("heading").map((h) => h.textContent)
    expect(headings).toEqual(["Background", "Touch-up and light", "Noise reduction"])
  })

  it("hands on a touch-up level and low light", () => {
    const p = picker()
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Touch-up" })).getByRole("radio", { name: "Smooth" }))
    expect(p.onTouchUp).toHaveBeenCalledWith("smooth")
    fireEvent.click(screen.getByRole("switch", { name: "Low light" }))
    expect(p.onLowLight).toHaveBeenCalledWith(true)
  })

  it("shows the touch-up and low light chosen, as the CPU watch leaves them", () => {
    picker({ effects: { background: { kind: "none" }, noise: "standard", touchUp: "subtle", lowLight: true }, note: "Lighter for now: this device is busy." })
    expect(within(screen.getByRole("radiogroup", { name: "Touch-up" })).getByRole("radio", { name: "Subtle" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("switch", { name: "Low light" }).getAttribute("aria-checked")).toBe("true")
  })

  it("says why backgrounds can't run here, and still offers the noise levels", () => {
    picker({ unavailable: "This browser can't change your background." })
    expect(screen.getByText("This browser can't change your background.")).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Light blur" }).hasAttribute("disabled")).toBe(true)
    // The touch-up and low light run the same way, so they can't either.
    expect(within(screen.getByRole("radiogroup", { name: "Touch-up" })).getByRole("radio", { name: "Smooth" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("switch", { name: "Low light" }).hasAttribute("disabled") || screen.getByRole("switch", { name: "Low light" }).getAttribute("aria-disabled") === "true").toBe(true)
    expect(within(screen.getByRole("radiogroup", { name: "Noise reduction" })).getByRole("radio", { name: /^Off/ }).hasAttribute("disabled")).toBe(false)
  })

  it("draws four tiles to a row where it's wide, and says, quietly, when the effects were made lighter", () => {
    picker({ columns: 4, note: "Lighter for now: this device is busy." })
    expect(screen.getByRole("radiogroup", { name: "Background" }).className).toContain("grid-cols-4")
    expect(screen.getByRole("status").textContent).toBe("Lighter for now: this device is busy.")
  })

  it("rings the chosen tile outside its edge, so a pale backdrop's choice still shows", () => {
    picker({ effects: { background: { kind: "backdrop", id: "lake" }, noise: "standard", touchUp: "off", lowLight: false } })
    const lagoon = screen.getByRole("radio", { name: "Lagoon" })
    expect(lagoon.getAttribute("aria-checked")).toBe("true")
    expect(lagoon.className).toContain("ring-offset-2")
    expect(lagoon.className).not.toContain("ring-inset")
  })

  it("offers to change or remove one's own picture once there is one", () => {
    const p = picker({ effects: { background: { kind: "picture" }, noise: "standard", touchUp: "off", lowLight: false }, picture: { url: "data:image/jpeg;base64,AAAA", onChoose: vi.fn(), onForget: vi.fn() } })
    expect(screen.getByRole("radio", { name: "Your picture" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }))
    expect(p.picture.onForget).toHaveBeenCalled()
  })
})
