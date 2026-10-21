import { afterEach, describe, expect, it } from "vitest"
import { BACKDROP_IDS, NO_EFFECTS, readBackground, readEffects, readNoise, sameBackground, writeEffects } from "./effects"
import { BACKDROPS, backgroundName } from "./effectsCopy"
import { BACKDROP_INKS, paintBackdrop, type Paint2D } from "./backdrops"
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

  it("is remembered on this device, and starts with none where it can't be", () => {
    expect(readEffects()).toEqual(NO_EFFECTS)
    writeEffects({ background: { kind: "backdrop", id: "dusk" }, noise: "strong" })
    expect(readEffects()).toEqual({ background: { kind: "backdrop", id: "dusk" }, noise: "strong" })
    window.localStorage.setItem("onecamp.call.effects", "{not json")
    expect(readEffects()).toEqual(NO_EFFECTS)
  })
})

describe("a busy computer", () => {
  it("gets a lighter blur first, then the browser's own noise reduction, and never loses a background on its own", () => {
    const step1 = lighter({ background: { kind: "blur", strength: "strong" }, noise: "strong" })
    expect(step1?.next).toEqual({ background: { kind: "blur", strength: "light" }, noise: "strong" })
    expect(step1?.said).toContain("lighter")
    const step2 = lighter(step1!.next)
    expect(step2?.next).toEqual({ background: { kind: "blur", strength: "light" }, noise: "standard" })
    // A backdrop may be what keeps a room private: it is never taken away unasked.
    expect(lighter(step2!.next)).toBeNull()
    expect(lighter({ background: { kind: "backdrop", id: "sky" }, noise: "standard" })).toBeNull()
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
