import { afterEach, describe, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { expectSecretAskedAgain } from "@/lib/testing/secretReentryKit"

// A custom AI endpoint's stored key is bound to the address it was given for:
// another host needs it entered again (hooks/useSecretReentry), as the server
// holds it. The provider's row asks before saving.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/components/admin/ai/ModelInstaller", () => ({ ModelInstaller: () => null }))
vi.mock("@/components/admin/ai/ModelCatalog", () => ({ ModelCatalog: () => null }))
vi.mock("@/services/aiModelService", async (orig) => ({
  ...(await orig<typeof import("@/services/aiModelService")>()),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  testConnection: vi.fn(),
}))

import { ProviderEditor } from "@/components/admin/ai/ProviderEditor"
import { updateProvider, type ProviderView } from "@/services/aiModelService"

const custom: ProviderView = {
  id: "p1",
  kind: "openai_compatible",
  label: "Our vLLM",
  base_url: "https://models.example.com/v1",
  has_api_key: true,
  enabled: true,
  is_builtin: false,
  insecure_tls: false,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("a custom AI endpoint's stored key", () => {
  it("is asked for again when the endpoint moves to another host, and nothing is saved", async () => {
    render(
      <ProviderEditor
        provider={custom}
        models={[]}
        modelsLoading={false}
        stats={null}
        onEnsureModels={async () => {}}
        onDeleteModel={async () => {}}
        onChanged={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Configure/ }))
    const address = screen.getByDisplayValue("https://models.example.com/v1")
    await expectSecretAskedAgain({
      address: () => address,
      moveTo: "https://models.elsewhere.example.net/v1",
      secret: () => document.querySelector<HTMLElement>('input[type="password"]')!,
      noun: "API key",
      save: () => fireEvent.click(screen.getByRole("button", { name: "Save" })),
      sent: () => vi.mocked(updateProvider).mock.calls.length,
    })
  })
})
