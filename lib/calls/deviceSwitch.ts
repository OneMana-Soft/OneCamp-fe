// One switch at a time for a call's device (meet-18; CODE-REVIEWER-46's MF1,
// 26 Oct). The dock's buttons and keys, and push to talk, switch a device
// through its one switch. A switch asked for while another runs waits for it,
// and of the asks that waited only the last runs. livekit-client 2.16.0 gives
// up on a disable that finds no publication within 10 s, so Space let go while
// the browser still asked for the microphone left it open once allowed: the
// close now waits for the open, then runs. Pure: no React.

/** A device's one switch: asks to turn it on or off, and where it's headed. */
export interface DeviceSwitch {
  /**
   * Asks for the device on or off. Answers whether it got there: false when
   * the switch failed (said once, through `failed`) or a later ask took this
   * one's place before it ran.
   */
  to(on: boolean): Promise<boolean>
  /** Turns the device the other way from where it's headed, or from `shown` while nothing switches. */
  toggle(shown: boolean): Promise<boolean>
  /** The state a running or waiting switch takes the device to; undefined while none does. */
  heading(): boolean | undefined
}

type Answer = (reached: boolean) => void

export function deviceSwitch(set: (on: boolean) => Promise<unknown>, failed: (on: boolean, e: unknown) => void): DeviceSwitch {
  let running: boolean | undefined
  let waiting: { on: boolean; answers: Answer[] } | undefined

  const run = async (on: boolean, answers: Answer[]) => {
    running = on
    let reached = true
    try {
      await set(on)
    } catch (e) {
      reached = false
      failed(on, e)
    }
    // An ask for this same state that came in meanwhile is answered by this
    // switch: asking the browser twice would raise a second prompt or toast.
    if (waiting?.on === on) {
      answers.push(...waiting.answers)
      waiting = undefined
    }
    running = undefined
    const next = waiting
    waiting = undefined
    for (const answer of answers) answer(reached)
    if (next) void run(next.on, next.answers)
  }

  const to = (on: boolean) =>
    new Promise<boolean>((answer) => {
      if (running === undefined) {
        void run(on, [answer])
      } else if (waiting?.on === on) {
        waiting.answers.push(answer)
      } else {
        // A later ask takes the waiting one's place: only the last runs.
        for (const replaced of waiting?.answers ?? []) replaced(false)
        waiting = { on, answers: [answer] }
      }
    })

  const heading = () => waiting?.on ?? running
  return { to, toggle: (shown) => to(!(heading() ?? shown)), heading }
}

const published = new WeakMap<object, Map<string, DeviceSwitch>>()

/**
 * Lets the rest of a call's screen reach a device's one switch while the dock
 * that made it is up, so an "asked to unmute" notice's Unmute waits on the
 * dock and push to talk rather than racing them (CODE-REVIEWER-48, 26 Oct: it
 * opened the microphone on its own, the class of the push-to-talk bug).
 * Keyed by the room; answers the way to take it down.
 */
export function publishSwitch(room: object, device: string, sw: DeviceSwitch): () => void {
  let devices = published.get(room)
  if (!devices) published.set(room, (devices = new Map()))
  devices.set(device, sw)
  return () => {
    if (devices.get(device) === sw) devices.delete(device)
  }
}

/** A room's published switch for a device: the dock's, while it is up. */
export function publishedSwitch(room: object, device: string): DeviceSwitch | undefined {
  return published.get(room)?.get(device)
}
