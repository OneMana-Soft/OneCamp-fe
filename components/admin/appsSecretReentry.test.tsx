import { afterEach, describe, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SWRConfig } from "swr"
import { AtAddress } from "@/lib/testing/nextAddress"
import type { ReactNode } from "react"
import { expectSecretAskedAgain } from "@/lib/testing/secretReentryKit"

// An OAuth app's stored client secret is bound to the token address it was
// given for: another address needs it entered again (hooks/useSecretReentry),
// as the server holds it. The app's editor asks before saving.

vi.mock("@/services/appService", () => ({
  listApps: vi.fn(),
  listMarketplace: vi.fn().mockResolvedValue([]),
  createApp: vi.fn(),
  updateApp: vi.fn(),
  deleteApp: vi.fn(),
  setAppEnabled: vi.fn(),
  disconnectApp: vi.fn(),
  startOAuthInstall: vi.fn(),
  getApp: vi.fn(),
  testApp: vi.fn(),
  installTemplate: vi.fn(),
  uninstallTemplate: vi.fn(),
}))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToPublic: vi.fn(), validateFiles: (f: FileList) => Array.from(f), uploadLimitMB: 10 }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))

import AppsCard from "@/components/admin/AppsCard"
import { listApps, updateApp } from "@/services/appService"

const fresh = ({ children }: { children: ReactNode }) => (
  <AtAddress url="/app/admin?tab=apps">
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
  </AtAddress>
)

const linear = {
  id: "a1",
  slug: "linear",
  name: "Linear",
  description: "Issues",
  kind: "oauth",
  is_enabled: true,
  is_connected: true,
  has_api_key: false,
  has_signing_secret: false,
  has_oauth_config: true,
  has_client_secret: true,
  oauth: { client_id: "cid", auth_url: "https://linear.app/oauth/authorize", token_url: "https://api.linear.app/oauth/token", scopes: ["read"] },
  commands: [],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("an OAuth app's stored client secret", () => {
  it("is asked for again when its token address moves to another host, and nothing is saved", async () => {
    vi.mocked(listApps).mockResolvedValue([linear] as never)
    render(<AppsCard />, { wrapper: fresh })
    fireEvent.click(await screen.findByRole("button", { name: "Edit Linear" }))
    await expectSecretAskedAgain({
      address: () => screen.getByLabelText("Token address"),
      moveTo: "https://tokens.elsewhere.example.net/oauth/token",
      secret: () => screen.getByLabelText("Client secret"),
      noun: "client secret",
      save: () => fireEvent.click(screen.getByRole("button", { name: "Save changes" })),
      sent: () => vi.mocked(updateApp).mock.calls.length,
    })
  })
})
