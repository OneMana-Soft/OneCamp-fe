/**
 * The microphone, camera and speaker picked in the green room, remembered for
 * the call that follows (and the next one). In localStorage, read in
 * try/catch: a private window simply uses the defaults.
 */
export interface DevicePrefs {
  audioinput?: string
  videoinput?: string
  audiooutput?: string
}

const KEY = "onecamp.call.devices"

export function readDevicePrefs(): DevicePrefs {
  try {
    const raw = window.localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : null
    return v && typeof v === "object" ? (v as DevicePrefs) : {}
  } catch {
    return {}
  }
}

export function writeDevicePref(kind: keyof DevicePrefs, id: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readDevicePrefs(), [kind]: id }))
  } catch {
    /* the default device, then */
  }
}
