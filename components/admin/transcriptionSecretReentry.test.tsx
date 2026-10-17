import { afterEach, describe, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { expectSecretAskedAgain } from "@/lib/testing/secretReentryKit"

// The speech-to-text provider's stored key is bound to the endpoint it was
// given for: another address needs it entered again (hooks/useSecretReentry),
// as the server holds it. The card asks before saving.

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

const stored: TranscriptionConfig = {
  mode: "backend",
  mode_source: "db",
  stt_provider: "openai",
  stt_provider_source: "db",
  stt_model: "whisper-1",
  stt_base_url: "https://stt.example.com/v1",
  stt_language: "",
  has_stt_api_key: true,
  stt_api_key_source: "db",
  has_google_credentials: false,
  google_source: "none",
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("the speech-to-text provider's stored key", () => {
  it("is asked for again when its endpoint moves to another host, and nothing is saved", async () => {
    vi.mocked(getTranscriptionConfig).mockResolvedValue(stored)
    render(<TranscriptionSettingsCard />)
    await screen.findByDisplayValue("https://stt.example.com/v1")
    await expectSecretAskedAgain({
      address: () => document.getElementById("stt-base-url")!,
      moveTo: "https://stt.elsewhere.example.net/v1",
      secret: () => document.getElementById("stt-api-key")!,
      noun: "API key",
      save: () => fireEvent.click(screen.getByRole("button", { name: "Save" })),
      sent: () => vi.mocked(updateTranscriptionConfig).mock.calls.length,
    })
  })
})
