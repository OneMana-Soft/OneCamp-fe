import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SWRConfig } from "swr"

const get = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: (...a: unknown[]) => get(...a), post: vi.fn() },
  OWN_ERRORS: {},
}))

import { useWorkspaceSettings } from "@/services/settingsService"

afterEach(() => {
  cleanup()
  get.mockReset()
})

function Reader({ name }: { name: string }) {
  const { settings } = useWorkspaceSettings()
  return <p>{settings ? `${name}: ${settings.upload_limit_mb} MB` : `${name}: loading`}</p>
}

// General's workspace card, its read receipts card, Security's guest access and
// Email's sending card each fetched /admin/settings on their own: four requests
// for one answer, and a save in one left the others showing the old values.
describe("the workspace's settings", () => {
  it("are read once for every card that shows a part of them", async () => {
    get.mockResolvedValue({ data: { data: { upload_limit_mb: 250, allowed_users: [], read_receipts_enabled: true } } })
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 60_000 }}>
        <Reader name="workspace" />
        <Reader name="receipts" />
        <Reader name="guests" />
        <Reader name="email" />
      </SWRConfig>,
    )
    expect(await screen.findByText("email: 250 MB")).toBeTruthy()
    expect(screen.getByText("workspace: 250 MB")).toBeTruthy()
    const settingsCalls = get.mock.calls.filter(([url]) => String(url).includes("/admin/settings"))
    expect(settingsCalls).toHaveLength(1)
  })
})
