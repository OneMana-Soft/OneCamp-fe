import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// zoom-09 C2: call audio leaves this server only on an admin's acknowledgement.
// The card says where it goes today; choosing the browser or a provider asks
// first, naming where, and the save carries the acknowledgement. The server
// has the last word: 409 asks again for where it says, 503 saved nothing.

const { toast, confirm } = vi.hoisted(() => ({ toast: vi.fn(), confirm: vi.fn() }))

vi.mock("@/services/settingsService", async (orig) => ({
  ...(await orig<typeof import("@/services/settingsService")>()),
  getTranscriptionConfig: vi.fn(),
  updateTranscriptionConfig: vi.fn(),
  testTranscriptionConfig: vi.fn(),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))

import TranscriptionSettingsCard from "@/components/admin/TranscriptionSettingsCard"
import { getTranscriptionConfig, updateTranscriptionConfig, type TranscriptionConfig } from "@/services/settingsService"

const onServer: TranscriptionConfig = {
  mode: "backend",
  mode_source: "default",
  stt_provider: "local",
  stt_provider_source: "default",
  stt_model: "",
  stt_base_url: "",
  stt_language: "",
  has_stt_api_key: false,
  stt_api_key_source: "none",
  has_google_credentials: false,
  google_source: "none",
  where: "server",
  audio_leaves_server: false,
  acknowledged_where: "",
  needs_acknowledgement: false,
  captions_off_reason: "",
}

type Asked = { title: string; description: string; confirmText?: string; onConfirm: () => unknown }
const asked = (i = 0) => confirm.mock.calls[i]?.[0] as Asked
const refusal = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data } })

async function card(c: Partial<TranscriptionConfig> = {}) {
  vi.mocked(getTranscriptionConfig).mockResolvedValue({ ...onServer, ...c })
  render(<TranscriptionSettingsCard />)
  await screen.findByRole("radio", { name: "Browser" })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe("where call audio goes (zoom-09 C2)", () => {
  it("says where it goes today, in plain words", async () => {
    await card()
    expect(screen.getByText("Call audio stays on this server.")).toBeTruthy()
    cleanup()
    await card({ mode: "frontend", where: "browser", audio_leaves_server: true, acknowledged_where: "browser" })
    expect(screen.getByText(/Call audio leaves this server: each person's browser sends their speech to Google/)).toBeTruthy()
  })

  it("asks before the browser takes it, naming where, and the save carries the acknowledgement", async () => {
    await card()
    fireEvent.click(screen.getByRole("radio", { name: "Browser" }))
    expect(updateTranscriptionConfig).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(asked().description).toMatch(/leaves this server/)
    expect(asked().confirmText).toBe("Send call audio to Google or Microsoft")
    vi.mocked(updateTranscriptionConfig).mockResolvedValue({ ...onServer, mode: "frontend", where: "browser", acknowledged_where: "browser" })
    await act(async () => { await asked().onConfirm() })
    expect(updateTranscriptionConfig).toHaveBeenCalledWith({ mode: "frontend", acknowledge_where: "browser" })
  })

  it("does not ask again for where the admin already said yes to", async () => {
    await card({ acknowledged_where: "browser" })
    vi.mocked(updateTranscriptionConfig).mockResolvedValue({ ...onServer, mode: "frontend", where: "browser", acknowledged_where: "browser" })
    fireEvent.click(screen.getByRole("radio", { name: "Browser" }))
    expect(confirm).not.toHaveBeenCalled()
    expect(updateTranscriptionConfig).toHaveBeenCalledWith({ mode: "frontend" })
  })

  it("asks again, for where the server says, when it answers acknowledgement_required", async () => {
    await card({ stt_provider: "deepgram", mode: "frontend", where: "browser", acknowledged_where: "browser" })
    vi.mocked(updateTranscriptionConfig).mockRejectedValueOnce(refusal(409, { code: "acknowledgement_required", where: "custom" }))
    fireEvent.click(screen.getByRole("radio", { name: "Server" }))
    expect(asked().confirmText).toBe("Send call audio to Deepgram")
    vi.useFakeTimers()
    await act(async () => { await asked().onConfirm() })
    await act(async () => { vi.runAllTimers() })
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(asked(1).confirmText).toBe("Send call audio to your endpoint")
    // The second yes carries the same change: the mode switch isn't dropped on the re-ask.
    vi.mocked(updateTranscriptionConfig).mockResolvedValue({ ...onServer, stt_provider: "deepgram", where: "custom", acknowledged_where: "custom" })
    await act(async () => { await asked(1).onConfirm() })
    expect(updateTranscriptionConfig).toHaveBeenCalledTimes(2)
    expect(updateTranscriptionConfig).toHaveBeenLastCalledWith({ mode: "backend", acknowledge_where: "custom" })
  })

  it("says the choice was not saved when the acknowledgement can't be recorded (503), and keeps the confirm open", async () => {
    await card()
    vi.mocked(updateTranscriptionConfig).mockRejectedValueOnce(refusal(503, { msg: "Could not record the acknowledgement." }))
    fireEvent.click(screen.getByRole("radio", { name: "Browser" }))
    await expect(Promise.resolve(asked().onConfirm())).rejects.toThrow(/wasn't saved.*Try again/)
    expect(screen.getByRole("radio", { name: "Server" }).getAttribute("aria-checked")).toBe("true")
  })

  it("asks once for an install whose environment already sends audio away, posting only the acknowledgement", async () => {
    await card({ mode: "frontend", mode_source: "env", where: "browser", audio_leaves_server: true, needs_acknowledgement: true })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(asked().confirmText).toBe("Send call audio to Google or Microsoft")
    vi.mocked(updateTranscriptionConfig).mockResolvedValue({ ...onServer, mode: "frontend", where: "browser", acknowledged_where: "browser" })
    await act(async () => { await asked().onConfirm() })
    expect(updateTranscriptionConfig).toHaveBeenCalledWith({ acknowledge_where: "browser" })
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it("says the transcriber isn't running and gives the one command to start it, with Copy", async () => {
    await card({ captions_off_reason: "transcriber_not_running", agent: { running: false } } as Partial<TranscriptionConfig>)
    expect(screen.getByText(/Captions are off: the transcriber isn't running/)).toBeTruthy()
    expect(screen.getAllByText("make stt_up")).toHaveLength(1)
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy()
  })

  it("says why captions are off once: the transcriber's row keeps its state and points up to the command", async () => {
    await card({ captions_off_reason: "transcriber_not_running", agent: { running: false } } as Partial<TranscriptionConfig>)
    expect(screen.getAllByText(/Start it on the server/)).toHaveLength(1)
    expect(screen.getAllByText(/isn't running|no captions/i)).toHaveLength(1)
    expect(screen.getByText("Transcriber: Not running.")).toBeTruthy()
    expect(screen.getByText("Captions are off until it starts; the command is above.")).toBeTruthy()
    expect(screen.queryByText(/transcription agent/i)).toBeNull()
  })

  // The server has the last word on a save that asked nothing, too: another
  // tab can move the acknowledgement, since acknowledged_where holds only the
  // latest place, and an env endpoint can outlive a cleared field.
  it("asks for where the server says when a mode save that asked nothing is refused, and the yes clears the refusal under the label", async () => {
    await card({ acknowledged_where: "browser" })
    const said = "Call audio would leave this server: acknowledge where it goes."
    vi.mocked(updateTranscriptionConfig).mockRejectedValueOnce(refusal(409, { code: "acknowledgement_required", where: "browser", msg: said }))
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "Browser" })) })
    expect(updateTranscriptionConfig).toHaveBeenCalledWith({ mode: "frontend" })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(asked().confirmText).toBe("Send call audio to Google or Microsoft")
    expect(await screen.findByText(said)).toBeTruthy()
    vi.mocked(updateTranscriptionConfig).mockResolvedValue({ ...onServer, mode: "frontend", where: "browser", acknowledged_where: "browser" })
    await act(async () => { await asked().onConfirm() })
    expect(updateTranscriptionConfig).toHaveBeenLastCalledWith({ mode: "frontend", acknowledge_where: "browser" })
    expect(screen.queryByText(said)).toBeNull()
    expect(screen.getByRole("radio", { name: "Browser" }).getAttribute("aria-checked")).toBe("true")
  })

  it("asks for where the server says when a speech-to-text save that asked nothing is refused, and the yes posts that save with it", async () => {
    await card({ stt_provider: "openai", stt_base_url: "https://stt.example.com/v1", where: "custom", acknowledged_where: "openai" })
    vi.mocked(updateTranscriptionConfig).mockRejectedValueOnce(refusal(409, { code: "acknowledgement_required", where: "custom" }))
    fireEvent.change(screen.getByLabelText("Endpoint base URL"), { target: { value: "" } })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })) })
    const req = { stt_provider: "openai", stt_model: "", stt_language: "", stt_base_url: "" }
    expect(updateTranscriptionConfig).toHaveBeenCalledWith(req)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(asked().confirmText).toBe("Send call audio to your endpoint")
    vi.mocked(updateTranscriptionConfig).mockResolvedValue({ ...onServer, stt_provider: "openai", where: "custom", acknowledged_where: "custom" })
    await act(async () => { await asked().onConfirm() })
    expect(updateTranscriptionConfig).toHaveBeenLastCalledWith({ ...req, acknowledge_where: "custom" })
  })

  it("asks before a speech-to-text save sends audio to a new provider, and the yes posts the whole save with the acknowledgement", async () => {
    await card({ stt_provider: "local" })
    fireEvent.click(screen.getByRole("radio", { name: "Provider" }))
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "dg-test-key" } })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })) })
    expect(updateTranscriptionConfig).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(asked().confirmText).toBe("Send call audio to Deepgram")
    vi.mocked(updateTranscriptionConfig).mockResolvedValue({ ...onServer, stt_provider: "deepgram", has_stt_api_key: true, where: "deepgram", audio_leaves_server: true, acknowledged_where: "deepgram" })
    await act(async () => { await asked().onConfirm() })
    expect(updateTranscriptionConfig).toHaveBeenCalledTimes(1)
    expect(updateTranscriptionConfig).toHaveBeenLastCalledWith({
      stt_provider: "deepgram", stt_model: "", stt_language: "", stt_base_url: "", stt_api_key: "dg-test-key", acknowledge_where: "deepgram",
    })
    expect(toast).toHaveBeenCalledWith({ title: "Speech-to-text settings saved" })
  })

  it("asks for your endpoint, not OpenAI, before an OpenAI-compatible save that points somewhere else", async () => {
    await card({ stt_provider: "openai", where: "openai", audio_leaves_server: true, acknowledged_where: "openai" })
    fireEvent.change(screen.getByLabelText("Endpoint base URL"), { target: { value: "https://stt.example.com/v1" } })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })) })
    expect(updateTranscriptionConfig).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(asked().confirmText).toBe("Send call audio to your endpoint")
    vi.mocked(updateTranscriptionConfig).mockResolvedValue({ ...onServer, stt_provider: "openai", stt_base_url: "https://stt.example.com/v1", where: "custom", audio_leaves_server: true, acknowledged_where: "custom" })
    await act(async () => { await asked().onConfirm() })
    expect(updateTranscriptionConfig).toHaveBeenLastCalledWith({
      stt_provider: "openai", stt_model: "", stt_language: "", stt_base_url: "https://stt.example.com/v1", acknowledge_where: "custom",
    })
  })

  it("asks again from the card's button after the load-time ask was cancelled, and the yes posts only the acknowledgement", async () => {
    await card({ mode: "frontend", mode_source: "env", where: "browser", audio_leaves_server: true, needs_acknowledgement: true })
    expect(confirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Review where call audio goes" }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(asked(1).confirmText).toBe("Send call audio to Google or Microsoft")
    vi.mocked(updateTranscriptionConfig).mockResolvedValue({ ...onServer, mode: "frontend", where: "browser", acknowledged_where: "browser" })
    await act(async () => { await asked(1).onConfirm() })
    expect(updateTranscriptionConfig).toHaveBeenCalledWith({ acknowledge_where: "browser" })
    expect(screen.queryByRole("button", { name: "Review where call audio goes" })).toBeNull()
  })
})
