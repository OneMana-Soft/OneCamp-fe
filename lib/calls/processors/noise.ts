// How a microphone sounds in a call: the browser's own noise reduction
// (standard), RNNoise on this device (strong), or nothing at all (off, for
// music). RNNoise runs in an AudioWorklet on the call's own audio context,
// from this server's copy of its WebAssembly (assets.ts); it loads the first
// time someone chooses Strong. Nothing is sent anywhere.

import type { AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor } from "livekit-client"
import { RNNOISE } from "./assets"
import type { NoiseLevel } from "./effects"

type Lib = typeof import("@sapphi-red/web-noise-suppressor")
type Node = InstanceType<Lib["RnnoiseWorkletNode"]>

let lib: Promise<Lib> | null = null
let wasm: Promise<ArrayBuffer> | null = null
const worklets = new WeakMap<BaseAudioContext, Promise<void>>()

const load = (): Promise<Lib> => {
  lib ??= import("@sapphi-red/web-noise-suppressor").catch((e: unknown) => {
    lib = null
    throw e
  })
  return lib
}

/** RNNoise's WebAssembly, fetched once per page (the SIMD build where the browser has SIMD). */
function binary(m: Lib): Promise<ArrayBuffer> {
  wasm ??= m.loadRnnoise({ url: RNNOISE.wasm, simdUrl: RNNOISE.simd }).catch((e: unknown) => {
    wasm = null
    throw e
  })
  return wasm
}

/** Its worklet, added once to each audio context. */
function worklet(ctx: AudioContext): Promise<void> {
  let p = worklets.get(ctx)
  if (!p) {
    p = ctx.audioWorklet.addModule(RNNOISE.worklet).catch((e: unknown) => {
      worklets.delete(ctx)
      throw e
    })
    worklets.set(ctx, p)
  }
  return p
}

/** The processor's name on a track, to tell ours from anyone else's. */
export const STRONG_NOISE = "onecamp-strong-noise"

/**
 * RNNoise between the microphone and the call: microphone, worklet, a new
 * track the call sends. Rebuilt on the same context when LiveKit replaces
 * the microphone (a device switch), and torn down when it stops.
 */
export class StrongNoise implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = STRONG_NOISE
  processedTrack?: MediaStreamTrack
  private ctx?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private node?: Node
  private sink?: MediaStreamAudioDestinationNode
  private watch?: ReturnType<typeof setInterval>

  /** `onSilent` hears when the microphone has sound and nothing comes out: the call would be silent. */
  constructor(private readonly onSilent?: () => void) {}

  async init(opts: AudioProcessorOptions): Promise<void> {
    await this.build(opts.track, opts.audioContext)
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    this.teardown()
    await this.build(opts.track, opts.audioContext ?? this.ctx)
  }

  async destroy(): Promise<void> {
    this.teardown()
  }

  private async build(track: MediaStreamTrack, ctx: AudioContext | undefined): Promise<void> {
    if (!ctx) throw new Error("Strong noise reduction needs the call's audio, which hasn't started.")
    const m = await load()
    const [wasmBinary] = await Promise.all([binary(m), worklet(ctx)])
    // A suspended context passes no sound: the call would go silent.
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined)
    if (ctx.state !== "running") throw new Error("This browser didn't start the sound for strong noise reduction.")
    this.ctx = ctx
    this.source = ctx.createMediaStreamSource(new MediaStream([track]))
    this.node = new m.RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary })
    this.sink = ctx.createMediaStreamDestination()
    this.source.connect(this.node)
    this.node.connect(this.sink)
    this.processedTrack = this.sink.stream.getAudioTracks()[0]
    this.watchForSilence(ctx)
  }

  /**
   * For its first 4 s, compares what goes in with what comes out: a worklet
   * that failed inside (its WebAssembly refused, say) passes silence, and the
   * person would talk to a call that hears nothing.
   */
  private watchForSilence(ctx: AudioContext): void {
    if (!this.onSilent || !this.source || !this.node) return
    const tap = (n: AudioNode) => {
      const a = ctx.createAnalyser()
      a.fftSize = 512
      n.connect(a)
      return a
    }
    const input = tap(this.source)
    const output = tap(this.node)
    const level = (a: AnalyserNode) => {
      const buf = new Float32Array(a.fftSize)
      a.getFloatTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v))
      return peak
    }
    let heard = 0
    let passed = 0
    let ticks = 0
    this.watch = setInterval(() => {
      ticks++
      if (level(input) > 0.003) heard++
      if (level(output) > 0) passed++
      if (ticks < 16) return
      clearInterval(this.watch)
      input.disconnect()
      output.disconnect()
      if (heard >= 4 && passed === 0) this.onSilent?.()
    }, 250)
  }

  private teardown(): void {
    clearInterval(this.watch)
    this.source?.disconnect()
    this.node?.disconnect()
    this.node?.destroy()
    this.processedTrack?.stop()
    this.source = undefined
    this.node = undefined
    this.sink = undefined
    this.processedTrack = undefined
  }
}

/**
 * The microphone's capture for a level. Standard is LiveKit's defaults (the
 * browser's echo cancellation, noise suppression and voice isolation); strong
 * hands RNNoise the sound before the browser has cleaned it, which it does
 * better alone; off keeps echo cancellation, so a call without headphones
 * still has no echo, and nothing else. Pure.
 */
export function captureFor(level: NoiseLevel, deviceId: string | undefined): AudioCapture {
  // The room's own capture (roomOptions.ts): one channel of speech at 48 kHz.
  const base: AudioCapture = { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, sampleRate: { ideal: 48000 }, sampleSize: 16, echoCancellation: true }
  if (level === "standard") return { ...base, noiseSuppression: true, autoGainControl: true }
  if (level === "strong") return { ...base, noiseSuppression: false, autoGainControl: true, voiceIsolation: false }
  return { ...base, noiseSuppression: false, autoGainControl: false, voiceIsolation: false }
}

type AudioCapture = NonNullable<Parameters<LocalAudioTrack["restartTrack"]>[0]>

/**
 * Sets a microphone track's noise level: its capture, then RNNoise on or off.
 * Throws, in words, when strong can't run; the caller then sets standard
 * back and says so.
 */
export async function applyNoise(track: LocalAudioTrack, level: NoiseLevel, was: NoiseLevel, onSilent?: () => void): Promise<void> {
  if (level !== "strong" && track.getProcessor()?.name === STRONG_NOISE) await track.stopProcessor()
  if (level !== was) await track.restartTrack(captureFor(level, await track.getDeviceId()))
  if (level === "strong" && track.getProcessor()?.name !== STRONG_NOISE) await track.setProcessor(new StrongNoise(onSilent))
}
