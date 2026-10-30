import { mediaFailureKind } from "@/lib/media/mediaFailure"

export type MediaKind = "audio" | "video"

/** One kind's track, asked for with its constraints. */
export type MediaAsk = (kind: MediaKind, constraints: MediaTrackConstraints | true) => Promise<MediaStreamTrack>

type Ask = {
  kind: MediaKind
  constraints: MediaTrackConstraints | true
  resolve: (track: MediaStreamTrack) => void
  reject: (error: unknown) => void
}

const PERMISSION: Record<MediaKind, string> = { audio: "microphone", video: "camera" }

const refusal = () => new DOMException("Permission denied", "NotAllowedError")

/** Whether this site may not use the kind at all, so asking would only fail (or prompt again). */
async function refusedHere(kind: MediaKind): Promise<boolean> {
  try {
    return (await navigator.permissions?.query({ name: PERMISSION[kind] as PermissionName }))?.state === "denied"
  } catch {
    // A browser that can't say for this kind (Firefox before 131): ask, as alone.
    return false
  }
}

async function request(asks: Ask[]): Promise<void> {
  const constraints: MediaStreamConstraints = {}
  for (const a of asks) constraints[a.kind] = a.constraints
  try {
    const media = navigator.mediaDevices
    if (!media?.getUserMedia) throw new DOMException("This browser can't open a camera or microphone here", "NotSupportedError")
    const stream = await media.getUserMedia(constraints)
    for (const a of asks) {
      const track = a.kind === "audio" ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0]
      if (track) a.resolve(track)
      else a.reject(new DOMException(`No ${PERMISSION[a.kind]}`, "NotFoundError"))
    }
  } catch (error) {
    // A prompt answered no refuses all it asked for. Anything else is one
    // device's doing (missing, busy): each kind is asked alone, which prompts
    // for nothing new.
    if (asks.length === 1 || mediaFailureKind(error) === "denied") for (const a of asks) a.reject(error)
    else await Promise.all(asks.map((a) => request([a])))
  }
}

/**
 * getUserMedia for what a screen opens with, asked as one: the kinds asked for
 * in the same moment (a green room's camera and its microphone's meter, as it
 * mounts) go in one request, so the browser asks once for both. What one kind
 * can't have doesn't cost the other: a kind this site may not use isn't asked
 * for (it fails at once, as it would alone), and a request that fails for
 * anything but a refusal is asked again kind by kind, so a missing or busy
 * microphone leaves the camera on. A kind asked for twice in one moment (an
 * effect run again at once) answers its last ask; the earlier one is aborted.
 * Each answer is that kind's track, for the caller to stop.
 */
export function mediaAsker(): MediaAsk {
  let batch: Ask[] = []
  const flush = async () => {
    const asks = batch
    batch = []
    const refused = await Promise.all(asks.map((a) => refusedHere(a.kind)))
    for (const [i, a] of asks.entries()) if (refused[i]) a.reject(refusal())
    const rest = asks.filter((_, i) => !refused[i])
    if (rest.length) await request(rest)
  }
  return (kind, constraints) =>
    new Promise((resolve, reject) => {
      const earlier = batch.find((a) => a.kind === kind)
      if (earlier) {
        batch = batch.filter((a) => a !== earlier)
        earlier.reject(new DOMException("Asked again", "AbortError"))
      }
      batch.push({ kind, constraints, resolve, reject })
      if (batch.length === 1 && !earlier) queueMicrotask(() => void flush())
    })
}
