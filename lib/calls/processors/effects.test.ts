import { afterEach, describe, expect, it } from "vitest"
import { BACKDROP_IDS, NO_EFFECTS, cameraOn, lookOf, readBackground, readEffects, readNoise, readTouchUp, sameBackground, sameLook, writeEffects, type CallEffects } from "./effects"
import { BACKDROPS, TOUCH_UPS, backgroundName } from "./effectsCopy"
import { BACKDROP_INKS, BUILT_IN, EXTRAS, paintBackdrop, paintScene, sceneFromRecipe, type Paint2D, type Scene } from "./backdrops"
import { coverCrop } from "./picture"
import { FRAME_BUDGET_MS, STRAIN_QUIET_MS, lighter, watchStrain } from "./strain"
import { captureFor } from "./noise"

// Media Processors (#55): what someone chose to look and sound like, kept on
// their device, and the pieces that run it, read without a browser.

afterEach(() => window.localStorage.clear())

describe("a background and a noise level, read from anywhere", () => {
  it("keeps what it knows and makes anything else none or standard", () => {
    expect(readBackground({ kind: "blur", strength: "strong" })).toEqual({ kind: "blur", strength: "strong" })
    expect(readBackground({ kind: "backdrop", id: "lake" })).toEqual({ kind: "backdrop", id: "lake" })
    expect(readBackground({ kind: "picture" })).toEqual({ kind: "picture" })
    for (const junk of [null, undefined, "blur", { kind: "blur", strength: "max" }, { kind: "backdrop", id: "space" }, { kind: "video" }]) {
      expect(readBackground(junk)).toEqual({ kind: "none" })
    }
    expect(readNoise("strong")).toBe("strong")
    expect(readNoise("off")).toBe("off")
    expect(readNoise("loud")).toBe("standard")
  })

  it("names each choice in words, and tells two choices apart", () => {
    expect(backgroundName({ kind: "none" })).toBe("No effect")
    expect(backgroundName({ kind: "blur", strength: "light" })).toBe("Light blur")
    expect(backgroundName({ kind: "backdrop", id: "moss" })).toBe("Meadow")
    expect(sameBackground({ kind: "blur", strength: "light" }, { kind: "blur", strength: "light" })).toBe(true)
    expect(sameBackground({ kind: "blur", strength: "light" }, { kind: "blur", strength: "strong" })).toBe(false)
    expect(sameBackground({ kind: "backdrop", id: "sun" }, { kind: "backdrop", id: "sky" })).toBe(false)
  })

  it("reads a scene made from words, names it, and counts a newly kept picture or scene as a new choice", () => {
    expect(readBackground({ kind: "scene" })).toEqual({ kind: "scene" })
    expect(readBackground({ kind: "scene", at: 1731130000000, words: "a forest" })).toEqual({ kind: "scene", at: 1731130000000 })
    expect(readBackground({ kind: "picture", at: "soon" })).toEqual({ kind: "picture" })
    expect(backgroundName({ kind: "scene" })).toBe("Your scene")
    // "Use this" on another scene, or another picture of one's own, while that slot is chosen: the camera must take the new one.
    expect(sameBackground({ kind: "scene", at: 1 }, { kind: "scene", at: 2 })).toBe(false)
    expect(sameBackground({ kind: "picture", at: 1 }, { kind: "picture" })).toBe(false)
    expect(sameBackground({ kind: "scene", at: 1 }, { kind: "scene", at: 1 })).toBe(true)
    expect(sameBackground({ kind: "scene" }, { kind: "picture" })).toBe(false)
    writeEffects({ ...NO_EFFECTS, background: { kind: "scene", at: 5 } })
    expect(readEffects().background).toEqual({ kind: "scene", at: 5 })
  })

  it("is remembered on this device, and starts with none where it can't be", () => {
    expect(readEffects()).toEqual(NO_EFFECTS)
    writeEffects({ ...NO_EFFECTS, background: { kind: "backdrop", id: "dusk" }, noise: "strong" })
    expect(readEffects()).toEqual({ background: { kind: "backdrop", id: "dusk" }, noise: "strong", touchUp: "off", lowLight: false })
    window.localStorage.setItem("onecamp.call.effects", "{not json")
    expect(readEffects()).toEqual(NO_EFFECTS)
  })
})

describe("a touch-up and low light, read from anywhere", () => {
  it("start off, keep what they know, and read a choice saved before they existed as off", () => {
    expect(NO_EFFECTS).toMatchObject({ touchUp: "off", lowLight: false })
    expect(readTouchUp("subtle")).toBe("subtle")
    expect(readTouchUp("smooth")).toBe("smooth")
    for (const junk of [null, undefined, "max", 2, true]) expect(readTouchUp(junk)).toBe("off")
    // Saved by the picker before touch-up and low light were in it.
    window.localStorage.setItem("onecamp.call.effects", JSON.stringify({ background: { kind: "blur", strength: "light" }, noise: "strong" }))
    expect(readEffects()).toEqual({ background: { kind: "blur", strength: "light" }, noise: "strong", touchUp: "off", lowLight: false })
    // Low light is on only when it says so.
    window.localStorage.setItem("onecamp.call.effects", JSON.stringify({ touchUp: "smooth", lowLight: "yes" }))
    expect(readEffects()).toMatchObject({ touchUp: "smooth", lowLight: false })
    writeEffects({ ...NO_EFFECTS, touchUp: "subtle", lowLight: true })
    expect(readEffects()).toEqual({ ...NO_EFFECTS, touchUp: "subtle", lowLight: true })
  })

  it("are one look on the camera with its background, which is on when any of the three is", () => {
    const e: CallEffects = { background: { kind: "none" }, noise: "strong", touchUp: "off", lowLight: false }
    expect(lookOf(e)).toEqual({ background: { kind: "none" }, touchUp: "off", lowLight: false })
    expect(cameraOn(lookOf(e))).toBe(false)
    expect(cameraOn(lookOf({ ...e, touchUp: "subtle" }))).toBe(true)
    expect(cameraOn(lookOf({ ...e, lowLight: true }))).toBe(true)
    expect(cameraOn(lookOf({ ...e, background: { kind: "picture" } }))).toBe(true)
    expect(sameLook(lookOf(e), lookOf({ ...e, noise: "off" }))).toBe(true)
    expect(sameLook(lookOf(e), lookOf({ ...e, touchUp: "smooth" }))).toBe(false)
    expect(sameLook(lookOf(e), lookOf({ ...e, lowLight: true }))).toBe(false)
    expect(sameLook(lookOf({ ...e, background: { kind: "blur", strength: "light" } }), lookOf({ ...e, background: { kind: "blur", strength: "strong" } }))).toBe(false)
  })

  it("name each touch-up level in words, in the picker's order", () => {
    expect(TOUCH_UPS.map((t) => [t.level, t.name])).toEqual([
      ["off", "Off"],
      ["subtle", "Subtle"],
      ["smooth", "Smooth"],
    ])
  })
})

describe("a busy computer", () => {
  it("gets a lighter blur first, then the browser's own noise reduction, and never loses a background on its own", () => {
    const step1 = lighter({ ...NO_EFFECTS, background: { kind: "blur", strength: "strong" }, noise: "strong" })
    expect(step1?.next).toEqual({ ...NO_EFFECTS, background: { kind: "blur", strength: "light" }, noise: "strong" })
    expect(step1?.said).toContain("lighter")
    const step2 = lighter(step1!.next)
    expect(step2?.next).toEqual({ ...NO_EFFECTS, background: { kind: "blur", strength: "light" }, noise: "standard" })
    // A backdrop may be what keeps a room private: it is never taken away unasked.
    expect(lighter(step2!.next)).toBeNull()
    expect(lighter({ ...NO_EFFECTS, background: { kind: "backdrop", id: "sky" } })).toBeNull()
  })

  it("takes the touch-up down before the blur, keeps low light to the last, and still never a background", () => {
    const steps: CallEffects[] = []
    const said: string[] = []
    let e: CallEffects = { background: { kind: "blur", strength: "strong" }, noise: "strong", touchUp: "smooth", lowLight: true }
    for (let step = lighter(e); step; step = lighter(e)) {
      e = step.next
      steps.push(e)
      said.push(step.said)
    }
    expect(steps).toEqual([
      { background: { kind: "blur", strength: "strong" }, noise: "strong", touchUp: "subtle", lowLight: true },
      { background: { kind: "blur", strength: "strong" }, noise: "strong", touchUp: "off", lowLight: true },
      { background: { kind: "blur", strength: "light" }, noise: "strong", touchUp: "off", lowLight: true },
      { background: { kind: "blur", strength: "light" }, noise: "standard", touchUp: "off", lowLight: true },
      { background: { kind: "blur", strength: "light" }, noise: "standard", touchUp: "off", lowLight: false },
    ])
    expect(said).toEqual([
      "Your computer is busy, so your touch-up is subtler for now.",
      "Your computer is busy, so touch-up is off for now.",
      "Your computer is busy, so your background blur is lighter for now.",
      "Your computer is busy, so strong noise reduction is off for now. Your browser's own is on.",
      "Your computer is busy, so low light is off for now.",
    ])
  })

  it("counts as struggling after three slow checks, says so once a minute, and stops when asked", () => {
    let t = 0
    const said: number[] = []
    // Stopped at once, it says nothing.
    watchStrain(() => said.push(t), () => FRAME_BUDGET_MS * 2, () => t)()
    expect(said).toEqual([])
    // The checks themselves, driven by hand: three over budget in a row.
    const tick = makeTicker()
    const stop2 = tick.watch(() => said.push(t), () => FRAME_BUDGET_MS + 10, () => t)
    tick.run(3)
    expect(said).toEqual([0])
    t = STRAIN_QUIET_MS - 1
    tick.run(3)
    expect(said).toEqual([0])
    t = STRAIN_QUIET_MS + 1
    tick.run(3)
    expect(said).toEqual([0, STRAIN_QUIET_MS + 1])
    stop2()
  })

  it("reads the CPU's pressure where the browser reports it", () => {
    const observers: { cb: (r: { state: string }[]) => void; disconnected: boolean }[] = []
    class FakePressure {
      disconnected = false
      constructor(public cb: (r: { state: string }[]) => void) {
        observers.push(this)
      }
      observe() {
        return Promise.resolve()
      }
      disconnect() {
        this.disconnected = true
      }
    }
    ;(globalThis as { PressureObserver?: unknown }).PressureObserver = FakePressure
    let strained = 0
    const stop = watchStrain(() => strained++)
    const o = observers[0]
    o.cb([{ state: "serious" }])
    o.cb([{ state: "nominal" }])
    o.cb([{ state: "critical" }])
    o.cb([{ state: "serious" }])
    expect(strained).toBe(0)
    o.cb([{ state: "critical" }])
    expect(strained).toBe(1)
    stop()
    expect(o.disconnected).toBe(true)
    delete (globalThis as { PressureObserver?: unknown }).PressureObserver
  })
})

/** watchStrain's frame checks, run by hand rather than every 2 s. */
function makeTicker() {
  let fn: (() => void) | null = null
  const real = globalThis.setInterval
  return {
    watch(onStrain: () => void, frames: () => number | null, now: () => number) {
      globalThis.setInterval = ((f: () => void) => {
        fn = f
        return 1 as unknown as ReturnType<typeof setInterval>
      }) as typeof setInterval
      try {
        return watchStrain(onStrain, frames, now)
      } finally {
        globalThis.setInterval = real
      }
    },
    run(n: number) {
      for (let i = 0; i < n; i++) fn?.()
    },
  }
}

describe("the backdrops, drawn in the camp palette", () => {
  it("names each one, in the picker's order", () => {
    expect(BACKDROPS.map((b) => b.id)).toEqual(BACKDROP_IDS)
  })

  it("draws each one, in its own hue, and leaves the drawing as it found it", () => {
    for (const id of BACKDROP_IDS) {
      const g = fakePaint()
      paintBackdrop(id, g)
      const inks = new Set(g.colours.map((c) => c.toUpperCase().slice(0, 7)))
      // Its hue is in it (the base, the deep or the tint), and it covers the frame.
      const hue = BACKDROP_INKS[id]
      expect([hue.base, hue.deep, hue.tint].some((c) => inks.has(c.toUpperCase())), id).toBe(true)
      expect(g.calls).toContain("fillRect(0,0,1280,720)")
      expect(g.globalAlpha, id).toBe(1)
    }
  })
})

// meet-09's generated backgrounds: the six built-ins are scenes (data) one
// painter draws, and the workspace's model writes a recipe (a palette, one of
// those layouts, a few extras) that this browser builds a scene from.
describe("a scene, painted by the one painter", () => {
  const RECIPE = { palette: ["#0B1D3A", "#1E3A6B", "#2A4B7C", "#14284F", "#F4E3B1"], layout: "moss", extras: [] as string[] }
  /** The colours a drawing used, as #RRGGBB (a glow's fading stop ends in 00). */
  const inksOf = (g: { colours: string[] }) => new Set(g.colours.map((c) => c.toUpperCase().slice(0, 7)))
  const painted = (scene: Scene) => {
    const g = fakePaint()
    paintScene(scene, g)
    return g
  }

  it("draws each built-in from its scene: its own hues, five colours at most, the whole frame, and the drawing left as found", () => {
    for (const id of BACKDROP_IDS) {
      const scene = BUILT_IN[id]
      expect(scene.palette.length, id).toBeLessThanOrEqual(5)
      for (const c of scene.palette) expect(c, id).toMatch(/^#[0-9A-F]{6}$/)
      const g = painted(scene)
      const hue = BACKDROP_INKS[id]
      expect([hue.base, hue.deep, hue.tint].some((c) => inksOf(g).has(c.toUpperCase())), id).toBe(true)
      expect(g.calls, id).toContain("fillRect(0,0,1280,720)")
      expect(g.globalAlpha, id).toBe(1)
      // The backdrop is its scene, drawn by the same painter.
      const b = fakePaint()
      paintBackdrop(id, b)
      expect(b.calls, id).toEqual(g.calls)
      expect(b.colours, id).toEqual(g.colours)
    }
  })

  it("builds a recipe on its layout's composition, in the recipe's colours only", () => {
    const scene = sceneFromRecipe(RECIPE)
    expect(scene.palette).toEqual(RECIPE.palette)
    expect(scene.shapes).toEqual(BUILT_IN.moss.shapes)
    const inks = inksOf(painted(scene))
    expect([...inks].sort()).toEqual([...RECIPE.palette].sort())
    for (const own of BUILT_IN.moss.palette) if (!RECIPE.palette.includes(own)) expect(inks.has(own), own).toBe(false)
  })

  it("fills the colours a recipe left out, or that aren't #RRGGBB, from its layout's own", () => {
    const scene = sceneFromRecipe({ palette: ["#0b1d3a", "red", "#FFF"], layout: "lake", extras: [] })
    expect(scene.palette).toEqual(["#0B1D3A", ...BUILT_IN.lake.palette.slice(1)])
  })

  it("falls back to the first built-in for a layout it doesn't know", () => {
    for (const layout of ["space", "", undefined, 7]) {
      expect(sceneFromRecipe({ palette: RECIPE.palette, layout, extras: [] } as never).shapes, String(layout)).toEqual(BUILT_IN[BACKDROP_IDS[0]].shapes)
    }
  })

  it("adds the extras' shapes in the recipe's light: each once, three at most, unknown ones dropped, mist in front of the land", () => {
    const plain = sceneFromRecipe({ ...RECIPE, layout: "sun" })
    const night = sceneFromRecipe({ ...RECIPE, layout: "sun", extras: ["stars", "moon", "stars", "lasers", "mist", "sun"] })
    // The sky first, the stars and moon behind the land, the mist in front of it; "sun" came fourth, so it isn't there.
    expect(night.shapes).toEqual([plain.shapes[0], ...EXTRAS.stars, ...EXTRAS.moon, ...plain.shapes.slice(1), ...EXTRAS.mist])
    for (const extra of Object.keys(EXTRAS) as (keyof typeof EXTRAS)[]) {
      expect(EXTRAS[extra].length, extra).toBeGreaterThan(0)
      for (const s of EXTRAS[extra]) expect(s.ink, extra).toBe(4)
    }
    // They draw: more paths than the layout alone, in the recipe's light.
    const g = painted(night)
    expect(g.calls.filter((c) => c === "beginPath").length).toBeGreaterThan(painted(plain).calls.filter((c) => c === "beginPath").length)
    expect(inksOf(g).has(RECIPE.palette[4])).toBe(true)
  })

  it("draws nothing for a shape it doesn't know or a colour the palette hasn't got", () => {
    const g = painted({ palette: ["#FFFFFF"], shapes: [{ kind: "image" } as never, { kind: "glow", ink: 3, x: 0.5, y: 0.5, r: 100, alpha: 1 }] })
    expect(g.calls).toEqual([])
    expect(g.globalAlpha).toBe(1)
  })
})

/** A drawing surface that writes down what it's asked to draw. */
function fakePaint(): Paint2D & { calls: string[]; colours: string[] } {
  const calls: string[] = []
  const colours: string[] = []
  const gradient = () => ({ addColorStop: (_: number, c: string) => colours.push(c) })
  const g = {
    calls,
    colours,
    globalAlpha: 1,
    set fillStyle(v: unknown) {
      if (typeof v === "string") colours.push(v)
    },
    get fillStyle() {
      return ""
    },
    fillRect: (...a: number[]) => calls.push(`fillRect(${a.join(",")})`),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => undefined,
    lineTo: () => undefined,
    bezierCurveTo: () => undefined,
    arc: () => undefined,
    ellipse: () => undefined,
    closePath: () => undefined,
    fill: () => calls.push("fill"),
    createLinearGradient: gradient,
    createRadialGradient: gradient,
  }
  return g as unknown as Paint2D & { calls: string[]; colours: string[] }
}

describe("a picture of one's own", () => {
  it("is cut to the frame's shape from its middle", () => {
    expect(coverCrop(1280, 720)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 })
    // A tall phone photo: its middle band.
    expect(coverCrop(3000, 4000)).toEqual({ sx: 0, sy: 1156, sw: 3000, sh: 1688 })
    // A panorama: its middle.
    expect(coverCrop(4000, 1000)).toEqual({ sx: 1111, sy: 0, sw: 1778, sh: 1000 })
  })
})

describe("the microphone's capture for each level", () => {
  it("keeps the room's own capture, and cancels echo always", () => {
    for (const level of ["standard", "strong", "off"] as const) {
      expect(captureFor(level, "mic-2")).toMatchObject({ deviceId: { exact: "mic-2" }, channelCount: 1, echoCancellation: true })
    }
    expect(captureFor("standard", undefined)).not.toHaveProperty("deviceId")
  })

  it("leaves the browser's noise reduction to it on standard, and hands strong the sound before the browser cleans it", () => {
    expect(captureFor("standard", undefined)).toMatchObject({ noiseSuppression: true, autoGainControl: true })
    expect(captureFor("strong", undefined)).toMatchObject({ noiseSuppression: false, voiceIsolation: false, autoGainControl: true })
    expect(captureFor("off", undefined)).toMatchObject({ noiseSuppression: false, voiceIsolation: false, autoGainControl: false })
  })
})
