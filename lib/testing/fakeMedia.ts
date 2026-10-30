// A browser's camera and microphone for tests, as jsdom has neither: what the
// green room reads of getUserMedia, MediaStream, a <video> and LiveKit's
// camera track.
import { vi } from "vitest"

/** A live track of the kind, from a device of its own. */
export function fakeTrack(kind: "audio" | "video"): MediaStreamTrack {
  return {
    kind,
    id: `${kind}-${Math.random().toString(36).slice(2, 10)}`,
    readyState: "live",
    enabled: true,
    muted: false,
    stop: vi.fn(),
    getSettings: () => ({ deviceId: `${kind}-device` }),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as MediaStreamTrack
}

class FakeMediaStream {
  private readonly tracks: MediaStreamTrack[]
  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks]
  }
  getTracks() {
    return [...this.tracks]
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio")
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video")
  }
}

/**
 * The device's camera and microphone: getUserMedia answers each kind it is
 * asked for with a live track ("tracks"), or never answers ("never": a camera
 * still opening). A <video> plays what it is given. Returns the getUserMedia
 * mock; undo with vi.unstubAllGlobals and vi.restoreAllMocks.
 */
export function fakeMedia(answer: "tracks" | "never") {
  const getUserMedia = vi.fn((constraints: MediaStreamConstraints) =>
    answer === "never"
      ? new Promise<MediaStream>(() => {})
      : Promise.resolve(new FakeMediaStream([...(constraints.audio ? [fakeTrack("audio")] : []), ...(constraints.video ? [fakeTrack("video")] : [])]) as unknown as MediaStream),
  )
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices: vi.fn(async () => []), addEventListener: () => {}, removeEventListener: () => {} },
  })
  vi.stubGlobal("MediaStream", FakeMediaStream)
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  return getUserMedia
}

/** LiveKit's camera track over a track the test made: what it was given, and where it is shown. */
export class FakeLocalVideoTrack {
  static made: FakeLocalVideoTrack[] = []
  source?: string
  mediaStream?: MediaStream
  readonly shownIn: HTMLMediaElement[] = []
  constructor(
    readonly mediaStreamTrack: MediaStreamTrack,
    readonly constraints?: MediaTrackConstraints,
    readonly userProvidedTrack?: boolean,
  ) {
    FakeLocalVideoTrack.made.push(this)
  }
  attach(el: HTMLMediaElement) {
    this.shownIn.push(el)
    return el
  }
  detach(el: HTMLMediaElement) {
    this.shownIn.splice(this.shownIn.indexOf(el), 1)
    return el
  }
  stop() {
    this.mediaStreamTrack.stop()
  }
  getProcessor() {
    return undefined
  }
}
