import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { InstallSlot } from "@/components/admin/MarketplaceCard"
import type { MarketplaceItem } from "@/types/app"

// An installed app that can't answer yet says so, with the way to finish:
// twenty directory apps showed "Installed" with no address for their
// commands, which then answered nobody (SA-BUG-8). The server decides
// needs_setup; the slot says "Needs setup" and Set up opens the editor.

afterEach(cleanup)

const jira = {
  slug: "jira", name: "Jira", description: "", category: "Productivity", kind: "oauth", featured: false,
  commands: ["jira"], installed: true, enabled: true, needs_setup: true, is_connected: true, app_id: "a1",
} as unknown as MarketplaceItem

describe("an installed app that needs setup", () => {
  it("says Needs setup, and Set up opens the editor", () => {
    const onConfigure = vi.fn()
    render(<InstallSlot item={jira} busy={false} fresh={false} onInstall={vi.fn()} onConfigure={onConfigure} />)
    expect(screen.getByText("Needs setup")).toBeTruthy()
    expect(screen.queryByText("Installed")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Set up Jira" }))
    expect(onConfigure).toHaveBeenCalledTimes(1)
  })

  it("says Installed once it is set up", () => {
    render(<InstallSlot item={{ ...jira, needs_setup: false }} busy={false} fresh={false} onInstall={vi.fn()} onConfigure={vi.fn()} />)
    expect(screen.getByText("Installed")).toBeTruthy()
    expect(screen.queryByText("Needs setup")).toBeNull()
  })
})
