import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// QA SH-10 (14 Oct 2026): a member who opened /app/admin found a lone lock
// and grey text in the middle of an empty sheet, with no way on and the tab
// titled "OneCamp". Settings' locked card instead: the page's header, one
// sentence with its lock, and Back to app.

vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1", user_is_admin: false } }, isLoading: false, isError: false }),
}))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("@/components/navigationBar/desktop/SettingsNav", () => ({ lastAppRoute: () => "/app/channel/eng" }))

const { default: AdminGate } = await import("./layout")

afterEach(cleanup)

describe("Admin, for someone who isn't one", () => {
  it("says so in the settings locked card, under the page's own name, with the way back", async () => {
    render(<AdminGate><p>secret</p></AdminGate>)
    expect(screen.queryByText("secret")).toBeNull()
    expect(screen.getByRole("heading", { level: 1, name: "Admin" })).toBeTruthy()
    expect(screen.getByRole("note").textContent).toContain("Only workspace admins can open Admin.")
    expect((await screen.findByRole("link", { name: "Back to app" })).getAttribute("href")).toBe("/app/channel/eng")
  })
})
