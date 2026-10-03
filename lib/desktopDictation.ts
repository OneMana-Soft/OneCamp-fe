/**
 * The OneCamp desktop app's on-device dictation, reached through Tauri's IPC.
 *
 * The desktop app (OneMana-Soft/OneCamp-desktop) records natively and
 * transcribes with a speech model on the person's own computer, so dictation
 * works there even when the workspace has no speech engine, and the audio never
 * leaves the machine. It grants these commands to the workspace the person
 * chose and to no other site.
 *
 * Everything here resolves to null outside the desktop app, and in a desktop
 * app too old to have dictation (the command is then not permitted), so callers
 * fall back to the server engine without special cases.
 */

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

export type DesktopDictationStatus =
  | { state: "unsupported"; reason: string }
  | { state: "absent"; download_mb: number }
  | { state: "downloading"; done: number; total: number }
  | { state: "failed"; message: string; download_mb: number }
  | { state: "ready" }
  | { state: "recording" }

function invoker(): Invoke | null {
  if (typeof window === "undefined") return null
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__
  const invoke = tauri?.core?.invoke
  return typeof invoke === "function" ? (invoke as Invoke) : null
}

/** The desktop engine's state, or null when there is no desktop engine to use. */
export async function desktopDictationStatus(): Promise<DesktopDictationStatus | null> {
  const invoke = invoker()
  if (!invoke) return null
  try {
    const status = await invoke<DesktopDictationStatus>("dictation_status")
    return status && typeof status.state === "string" ? status : null
  } catch {
    return null
  }
}

function call<T>(cmd: string): Promise<T> {
  const invoke = invoker()
  if (!invoke) return Promise.reject(new Error("Dictation on this computer needs the OneCamp desktop app."))
  // Tauri rejects with the command's error string; keep it as the message.
  return invoke<T>(cmd).catch((e: unknown) => {
    throw new Error(typeof e === "string" ? e : e instanceof Error ? e.message : "Dictation failed.")
  })
}

export const desktopDictation = {
  /** Starts the one-time model download; follow it with desktopDictationStatus. */
  install: () => call<void>("dictation_install"),
  start: () => call<void>("dictation_start"),
  /** Stops recording and resolves with the transcript ("" when nothing was said). */
  stop: () => call<string>("dictation_stop"),
  cancel: () => call<void>("dictation_cancel"),
}

/** Download progress as a whole percentage, for a status that has one. */
export function downloadPercent(status: DesktopDictationStatus | null): number | null {
  if (status?.state !== "downloading" || status.total <= 0) return null
  return Math.min(100, Math.floor((status.done / status.total) * 100))
}
