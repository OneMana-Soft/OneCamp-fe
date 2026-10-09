import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
let serverMax: number | undefined = 5 * 1024 ** 3
vi.mock("@/hooks/useFetch", () => ({ useFetch: (url: string) => ({ data: url && serverMax ? { max_bytes: serverMax } : undefined }) }))

const { ImportConnectDialog } = await import("./ImportConnectDialog")
const { peopleLine } = await import("./ImportPlanDialog")
const { pauseLine } = await import("./ImportJobRow")
const { SlackImportUploadDialog, exportLimit } = await import("./SlackImportUploadDialog")

afterEach(cleanup)

describe("the import screens' words and limits", () => {
  // trello.com/app-key no longer hands out keys; a Power-Up does.
  it("sends Trello people to the Power-Up page and says what to copy", () => {
    render(<ImportConnectDialog provider="trello" open onOpenChange={() => {}} onConnected={() => {}} />)
    expect(screen.getByRole("link", { name: "Where to find them" }).getAttribute("href")).toBe("https://trello.com/power-ups/admin")
    expect(screen.getByText(/Trello gives API keys to Power-Ups now/)).toBeTruthy()
  })

  // A scoped Jira token is refused by the API the import uses.
  it("tells Jira people to use a classic API token", () => {
    render(<ImportConnectDialog provider="jira" open onOpenChange={() => {}} onConnected={() => {}} />)
    expect(screen.getByText(/Use a classic API token/)).toBeTruthy()
  })

  it("says how many people only when the provider counted who is new", () => {
    expect(peopleLine({ user_count: 12, user_new: 0, user_merge: 0 })).toBe("12")
    expect(peopleLine({ user_count: 12, user_new: 9, user_merge: 3 })).toBe("12 (9 new, 3 already here)")
  })

  it("says why a running import is waiting, and when it carries on", () => {
    const now = Date.parse("2026-10-09T08:00:00Z")
    const line = pauseLine({ progress: { paused_until: "2026-10-09T14:00:00Z", pause_reason: "monday.com daily API limit for this plan is used up" } }, now)
    expect(line).toMatch(/^Waiting: monday\.com daily API limit for this plan is used up\. It carries on by itself around /)
    expect(pauseLine({ progress: { paused_until: "2026-10-09T07:00:00Z" } }, now)).toBeNull()
    expect(pauseLine({ progress: { paused_until: null } }, now)).toBeNull()
    expect(pauseLine({}, now)).toBeNull()
  })

  // The dialog said 50 GB while the server refused anything over 5 GB.
  it("says the server's own export limit", () => {
    expect(exportLimit(5 * 1024 ** 3)).toBe(5 * 1024 ** 3)
    expect(exportLimit(200 * 1024 ** 3)).toBe(50 * 1024 ** 3)
    expect(exportLimit(undefined)).toBe(50 * 1024 ** 3)
    render(<SlackImportUploadDialog open onOpenChange={() => {}} onUploaded={() => {}} />)
    expect(screen.getByText(/up to 5 GB on this server/)).toBeTruthy()
  })
})
