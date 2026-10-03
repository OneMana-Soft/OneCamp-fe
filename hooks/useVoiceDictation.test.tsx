import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

vi.mock("@/services/aiService", () => ({
  getVoiceInputAvailable: vi.fn(async () => false),
  transcribeAudio: vi.fn(async () => ""),
}))

import { getVoiceInputAvailable } from "@/services/aiService"
import { dictationLabel, useVoiceDictation } from "@/hooks/useVoiceDictation"
import { desktopDictation, desktopDictationStatus, downloadPercent } from "@/lib/desktopDictation"

type Handler = (cmd: string) => unknown
function desktopApp(handler: Handler) {
  const invoke = vi.fn(async (cmd: string) => {
    const out = handler(cmd)
    if (out instanceof Error) throw out.message
    return out
  })
  ;(window as unknown as { __TAURI__: unknown }).__TAURI__ = { core: { invoke } }
  return invoke
}

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__
  vi.mocked(getVoiceInputAvailable).mockClear().mockResolvedValue(false)
  vi.useRealTimers()
})

describe("desktop dictation bridge", () => {
  it("is absent in a browser", async () => {
    expect(await desktopDictationStatus()).toBeNull()
    await expect(desktopDictation.start()).rejects.toThrow(/desktop app/)
  })

  it("is absent in a desktop app too old to grant the command", async () => {
    desktopApp(() => new Error("dictation_status not allowed"))
    expect(await desktopDictationStatus()).toBeNull()
  })

  it("passes the desktop's own error text through", async () => {
    desktopApp((cmd) => (cmd === "dictation_start" ? new Error("No microphone found.") : undefined))
    await expect(desktopDictation.start()).rejects.toThrow("No microphone found.")
  })

  it("reports download progress as a whole percentage", () => {
    expect(downloadPercent({ state: "downloading", done: 345, total: 1000 })).toBe(34)
    expect(downloadPercent({ state: "downloading", done: 0, total: 0 })).toBeNull()
    expect(downloadPercent({ state: "ready" })).toBeNull()
  })
})

describe("useVoiceDictation", () => {
  it("offers nothing in a browser when the workspace has no speech engine", async () => {
    const { result } = renderHook(() => useVoiceDictation({ onText: vi.fn() }))
    await waitFor(() => expect(getVoiceInputAvailable).toHaveBeenCalled())
    expect(result.current.available).toBe(false)
  })

  it("uses the server engine in a browser when the workspace has one", async () => {
    vi.mocked(getVoiceInputAvailable).mockResolvedValue(true)
    const { result } = renderHook(() => useVoiceDictation({ onText: vi.fn() }))
    await waitFor(() => expect(result.current.engine).toBe("server"))
    expect(result.current.setup.needed).toBe(false)
  })

  it("falls back to the server engine where the desktop cannot run the model", async () => {
    desktopApp(() => ({ state: "unsupported", reason: "Intel Mac" }))
    vi.mocked(getVoiceInputAvailable).mockResolvedValue(true)
    const { result } = renderHook(() => useVoiceDictation({ onText: vi.fn() }))
    await waitFor(() => expect(result.current.engine).toBe("server"))
  })

  it("on the desktop, sets up first, then dictates on this computer", async () => {
    let status: unknown = { state: "absent", download_mb: 690 }
    const invoke = desktopApp((cmd) => {
      if (cmd === "dictation_status") return status
      if (cmd === "dictation_install") {
        status = { state: "downloading", done: 500, total: 1000 }
        return undefined
      }
      if (cmd === "dictation_stop") return "  ship it tonight  "
      return undefined
    })
    const onText = vi.fn()
    const { result } = renderHook(() => useVoiceDictation({ onText }))
    await waitFor(() => expect(result.current.engine).toBe("desktop"))
    expect(getVoiceInputAvailable).not.toHaveBeenCalled()
    expect(result.current.setup).toEqual({ needed: true, sizeMb: 690, progress: null })
    expect(dictationLabel(result.current)).toBe("Set up dictation (690 MB, runs on this computer)")

    await act(async () => result.current.toggle())
    expect(invoke).toHaveBeenCalledWith("dictation_install")
    await waitFor(() => expect(result.current.setup.progress).toBe(50))
    expect(dictationLabel(result.current)).toBe("Downloading speech model… 50%")

    status = { state: "ready" }
    await waitFor(() => expect(result.current.setup.needed).toBe(false))
    expect(dictationLabel(result.current)).toBe("Dictate")

    await act(async () => result.current.toggle())
    expect(invoke).toHaveBeenCalledWith("dictation_start")
    expect(result.current.recording).toBe(true)
    expect(dictationLabel(result.current)).toBe("Stop & insert")

    await act(async () => result.current.toggle())
    expect(invoke).toHaveBeenCalledWith("dictation_stop")
    expect(onText).toHaveBeenCalledWith("ship it tonight")
    expect(result.current.recording).toBe(false)
  })

  it("says so when nothing was heard", async () => {
    desktopApp((cmd) => (cmd === "dictation_status" ? { state: "ready" } : cmd === "dictation_stop" ? "" : undefined))
    const onText = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceDictation({ onText, onError }))
    await waitFor(() => expect(result.current.engine).toBe("desktop"))
    await act(async () => result.current.toggle())
    await act(async () => result.current.toggle())
    expect(onText).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith("Didn't catch that. Try again.")
  })

  it("closes the desktop microphone when the surface goes away mid-recording", async () => {
    const invoke = desktopApp((cmd) => (cmd === "dictation_status" ? { state: "ready" } : undefined))
    const { result, unmount } = renderHook(() => useVoiceDictation({ onText: vi.fn() }))
    await waitFor(() => expect(result.current.engine).toBe("desktop"))
    await act(async () => result.current.toggle())
    unmount()
    expect(invoke).toHaveBeenCalledWith("dictation_cancel")
  })
})
