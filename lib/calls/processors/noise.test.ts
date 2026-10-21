import { afterEach, describe, expect, it, vi } from "vitest"

// Strong noise reduction: RNNoise between the microphone and the call, on
// the call's own audio context, from this server's files. Never a silent call.

const made: { worklet: FakeNode | null } = { worklet: null }
class FakeNode {
  connected: unknown[] = []
  destroyed = false
  connect(n: unknown) {
    this.connected.push(n)
    return n
  }
  disconnect() {
    this.connected = []
  }
  destroy() {
    this.destroyed = true
  }
}
vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  loadRnnoise: vi.fn(async () => new ArrayBuffer(8)),
  RnnoiseWorkletNode: class extends FakeNode {
    constructor(_ctx: unknown, public opts: { maxChannels: number; wasmBinary: ArrayBuffer }) {
      super()
      made.worklet = this
    }
  },
}))

const lib = await import("@sapphi-red/web-noise-suppressor")
const { StrongNoise, applyNoise, STRONG_NOISE } = await import("./noise")
const { RNNOISE } = await import("./assets")

class FakeTrack {
  stopped = false
  stop() {
    this.stopped = true
  }
}
class FakeContext {
  state: "running" | "suspended" = "running"
  modules: string[] = []
  audioWorklet = { addModule: vi.fn(async (u: string) => void this.modules.push(u)) }
  resume = vi.fn(async () => undefined)
  createMediaStreamSource = vi.fn(() => new FakeNode())
  createMediaStreamDestination = vi.fn(() => Object.assign(new FakeNode(), { stream: { getAudioTracks: () => [new FakeTrack()] } }))
  createAnalyser = vi.fn(() => Object.assign(new FakeNode(), { fftSize: 0, getFloatTimeDomainData: (b: Float32Array) => b.fill(0.2) }))
}
vi.stubGlobal("MediaStream", class {
  constructor(public tracks: unknown[]) {}
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

const opts = (ctx: FakeContext) => ({ kind: "audio", track: {} as MediaStreamTrack, audioContext: ctx as unknown as AudioContext }) as never

describe("strong noise reduction", () => {
  it("puts RNNoise between the microphone and the call, from this server's files", async () => {
    const ctx = new FakeContext()
    const p = new StrongNoise()
    await p.init(opts(ctx))
    expect(lib.loadRnnoise).toHaveBeenCalledWith({ url: RNNOISE.wasm, simdUrl: RNNOISE.simd })
    expect(ctx.modules).toEqual([RNNOISE.worklet])
    expect(made.worklet).toBeTruthy()
    expect(p.processedTrack).toBeInstanceOf(FakeTrack)
    expect(p.name).toBe(STRONG_NOISE)
    await p.destroy()
    expect(made.worklet!.destroyed).toBe(true)
    expect(p.processedTrack).toBeUndefined()
  })

  it("adds its worklet to a context once, and builds again on the same one when the microphone changes", async () => {
    const ctx = new FakeContext()
    const p = new StrongNoise()
    await p.init(opts(ctx))
    const first = made.worklet
    await p.restart({ kind: "audio", track: {} as MediaStreamTrack } as never)
    expect(first!.destroyed).toBe(true)
    expect(made.worklet).not.toBe(first)
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1)
    await p.destroy()
  })

  it("refuses to run where the sound can't start, rather than send silence", async () => {
    const ctx = new FakeContext()
    ctx.state = "suspended"
    await expect(new StrongNoise().init(opts(ctx))).rejects.toThrow("didn't start the sound")
    expect(ctx.resume).toHaveBeenCalled()
  })

  it("says so when the microphone has sound and nothing comes out", async () => {
    vi.useFakeTimers()
    const ctx = new FakeContext()
    let call = 0
    // The input has sound; the worklet's output is silent.
    ctx.createAnalyser = vi.fn(() => {
      const quiet = call++ === 1
      return Object.assign(new FakeNode(), { fftSize: 0, getFloatTimeDomainData: (b: Float32Array) => b.fill(quiet ? 0 : 0.2) })
    })
    const silent = vi.fn()
    const p = new StrongNoise(silent)
    await p.init(opts(ctx))
    vi.advanceTimersByTime(4100)
    expect(silent).toHaveBeenCalledTimes(1)
    await p.destroy()
  })

  it("stays quiet about a call that sounds", async () => {
    vi.useFakeTimers()
    const silent = vi.fn()
    const p = new StrongNoise(silent)
    await p.init(opts(new FakeContext()))
    vi.advanceTimersByTime(4100)
    expect(silent).not.toHaveBeenCalled()
    await p.destroy()
  })
})

describe("a microphone's level", () => {
  const track = () => {
    let processor: { name: string } | undefined
    return {
      restartTrack: vi.fn(async () => undefined),
      getDeviceId: vi.fn(async () => "mic-2"),
      getProcessor: () => processor,
      setProcessor: vi.fn(async (p: { name: string }) => void (processor = p)),
      stopProcessor: vi.fn(async () => void (processor = undefined)),
    }
  }

  it("turns strong on with the browser's own reduction off underneath, and back", async () => {
    const t = track()
    await applyNoise(t as never, "strong", "standard")
    expect(t.restartTrack).toHaveBeenCalledWith(expect.objectContaining({ noiseSuppression: false, deviceId: { exact: "mic-2" } }))
    expect(t.setProcessor).toHaveBeenCalledWith(expect.objectContaining({ name: STRONG_NOISE }))
    await applyNoise(t as never, "standard", "strong")
    expect(t.stopProcessor).toHaveBeenCalled()
    expect(t.restartTrack).toHaveBeenLastCalledWith(expect.objectContaining({ noiseSuppression: true }))
  })

  it("leaves a microphone alone when nothing changes", async () => {
    const t = track()
    await applyNoise(t as never, "standard", "standard")
    expect(t.restartTrack).not.toHaveBeenCalled()
    expect(t.setProcessor).not.toHaveBeenCalled()
  })
})
