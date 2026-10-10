import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const stored = (over: Partial<TranscriptionConfig> = {}): TranscriptionConfig => ({
  mode: "frontend",
  mode_source: "db",
  stt_provider: "openai",
  stt_provider_source: "db",
  stt_model: "",
  stt_base_url: "",
  stt_language: "",
  has_stt_api_key: false,
  stt_api_key_source: "none",
  has_google_credentials: false,
  google_source: "none",
  ...over,
})

describe("call transcription settings", () => {
  // A failed read left the mode on its default, so the card said "Browser" as
  // if that were the setting.
  it("says the settings couldn't be loaded, and shows no mode until they are", async () => {
    vi.mocked(getTranscriptionConfig).mockRejectedValueOnce(new Error("Network Error"))
    render(<TranscriptionSettingsCard />)
    expect(await screen.findByText(/Couldn't load the transcription settings/)).toBeTruthy()
    expect(screen.queryByRole("radio")).toBeNull()
    vi.mocked(getTranscriptionConfig).mockResolvedValueOnce(stored())
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    const browser = await screen.findByRole("radio", { name: "Browser" })
    expect(browser.getAttribute("aria-checked")).toBe("true")
  })

  // Off turned captions off for every call with one pick and no question.
  it("asks before turning transcription off, and turns it off only once confirmed", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored())
    vi.mocked(updateTranscriptionConfig).mockResolvedValue(stored({ mode: "off" }))
    render(<TranscriptionSettingsCard />)
    fireEvent.click(await screen.findByRole("radio", { name: "Off" }))
    expect(confirm).toHaveBeenCalledTimes(1)
    const opts = confirm.mock.calls[0][0]
    expect(opts.destructive).toBe(true)
    expect(opts.title).toMatch(/Turn off/)
    expect(opts.description).toMatch(/captions/)
    expect(updateTranscriptionConfig).not.toHaveBeenCalled()
    expect(screen.getByRole("radio", { name: "Browser" }).getAttribute("aria-checked")).toBe("true")
    opts.onConfirm()
    await waitFor(() => expect(updateTranscriptionConfig).toHaveBeenCalledWith({ mode: "off" }))
  })

  it("changes between browser and server at once, and says the mode saves as you pick it", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored())
    vi.mocked(updateTranscriptionConfig).mockResolvedValue(stored({ mode: "backend" }))
    render(<TranscriptionSettingsCard />)
    const group = await screen.findByRole("radiogroup", { name: "Mode" })
    fireEvent.click(screen.getByRole("radio", { name: "Server" }))
    expect(confirm).not.toHaveBeenCalled()
    await waitFor(() => expect(updateTranscriptionConfig).toHaveBeenCalledWith({ mode: "backend" }))
    expect(group.contains(screen.getByRole("radio", { name: "Off" }))).toBe(true)
    expect(screen.getByText("The mode saves as soon as you pick it.")).toBeTruthy()
  })

  // The card's own "Failed to update mode" replaced the server's reason.
  it("keeps the server's reason when the mode can't be changed", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored())
    vi.mocked(updateTranscriptionConfig).mockRejectedValue({ response: { data: { msg: "The demo is shared." } } })
    render(<TranscriptionSettingsCard />)
    fireEvent.click(await screen.findByRole("radio", { name: "Server" }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't change the transcription mode",
          description: "The demo is shared.",
          variant: "destructive",
        }),
      ),
    )
    expect(screen.getByRole("radio", { name: "Browser" }).getAttribute("aria-checked")).toBe("true")
  })

  // The labels sat beside their inputs with nothing tying them, so a screen
  // reader announced an unnamed text field.
  it("names every speech-to-text field", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored({ mode: "backend" }))
    render(<TranscriptionSettingsCard />)
    expect(await screen.findByLabelText("Model")).toBeTruthy()
    expect(screen.getByLabelText("Endpoint base URL")).toBeTruthy()
    expect(screen.getByLabelText("Language")).toBeTruthy()
    expect(screen.getByLabelText("API key")).toBeTruthy()
    expect(screen.getByLabelText("Provider")).toBeTruthy()
  })

  // The bundled server's note wrote its command in backticks, which showed.
  it("shows the command that starts the bundled server in code type, without backticks", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored({ mode: "backend", stt_provider: "local" }))
    render(<TranscriptionSettingsCard />)
    const command = await screen.findByText("make stt_up")
    expect(command.tagName).toBe("CODE")
    expect(document.body.textContent).not.toContain("`")
  })

  it("takes Google's service account in the shared text area", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored({ mode: "backend", stt_provider: "google" }))
    render(<TranscriptionSettingsCard />)
    const json = await screen.findByLabelText("Service account JSON")
    expect(json.tagName).toBe("TEXTAREA")
    expect(json.className).not.toMatch(/shadow-sm/)
    expect(json.className).toMatch(/focus-visible:ring-ring\/25/)
  })

  // The speech-to-text block waited for a button at its foot with no sign
  // that anything was unsaved.
  it("holds speech-to-text edits in a save bar until they are saved", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored({ mode: "backend" }))
    vi.mocked(updateTranscriptionConfig).mockResolvedValue(stored({ mode: "backend", stt_model: "whisper-large" }))
    render(<TranscriptionSettingsCard />)
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    fireEvent.change(await screen.findByLabelText("Model"), { target: { value: "whisper-large" } })
    const bar = await screen.findByRole("region", { name: "Unsaved changes" })
    fireEvent.click(bar.querySelector("button:last-child") as HTMLElement)
    await waitFor(() =>
      expect(updateTranscriptionConfig).toHaveBeenCalledWith(expect.objectContaining({ stt_model: "whisper-large" })),
    )
  })

  // The mode was a hand-made radio row that marked the choice with the page
  // colour alone (1.03:1 against its well); it is the app's one segmented control.
  it("picks the mode with the shared segmented control", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored())
    render(<TranscriptionSettingsCard />)
    const browser = await screen.findByRole("radio", { name: "Browser" })
    expect(browser.className).toContain("data-[state=checked]:bg-card")
    expect(browser.className).not.toMatch(/(^|\s)bg-background(\s|$)/)
  })

  // "The mode saves as soon as you pick it." sat under the list, outside it,
  // where no other section says how it saves; it is in the section's words now.
  it("says how the mode saves in the section's description", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored())
    render(<TranscriptionSettingsCard />)
    await screen.findByRole("radiogroup", { name: "Mode" })
    const line = screen.getByText("The mode saves as soon as you pick it.")
    const heading = screen.getByRole("heading", { level: 2, name: "Call transcription" })
    expect(heading.parentElement?.contains(line)).toBe(true)
  })

  // The provider was a 32px select 320px wide, the model and key 36px fields
  // 256px wide and the language 160px wide: their left edges were at 1062,
  // 1126 and 1222px. One height and one width now, so they start on one line.
  it("gives the speech-to-text controls one height and one width", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored({ mode: "backend" }))
    render(<TranscriptionSettingsCard />)
    const controls = [
      await screen.findByLabelText("Provider"),
      screen.getByLabelText("Model"),
      screen.getByLabelText("Endpoint base URL"),
      screen.getByLabelText("Language"),
      screen.getByLabelText("API key"),
    ]
    for (const c of controls) {
      expect(c.className, c.id).toContain("@xl:w-72")
      expect(c.className, c.id).not.toMatch(/(^|\s)(h-8|sm:w-\d+)(\s|$)/)
    }
    expect(screen.getByRole("heading", { level: 3, name: "Speech-to-text" })).toBeTruthy()
  })
})
