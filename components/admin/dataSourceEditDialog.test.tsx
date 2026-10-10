import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/services/dataSourceService", async (orig) => ({
  ...(await orig<typeof import("@/services/dataSourceService")>()),
  createDataSource: vi.fn(),
  updateDataSource: vi.fn(),
  testDataSource: vi.fn(),
  testDataSourceConfig: vi.fn(),
}))

import { DataSourceEditDialog } from "@/components/admin/DataSourceEditDialog"
import { createDataSource, testDataSourceConfig } from "@/services/dataSourceService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("the data source dialog", () => {
  it("puts its title icon on the AI group's tile, not in the accent", () => {
    render(<DataSourceEditDialog source={null} open onClose={() => {}} onSaved={() => {}} />)
    const title = screen.getByRole("heading", { name: "Add a data source" })
    expect(title.querySelector(".hue-dusk")).toBeTruthy()
    expect(title.querySelector(".text-primary")).toBeNull()
  })

  // "Name, host and database are required." sat at the foot, tied to none of them.
  it("says each missing field under it, and puts the cursor on the first", async () => {
    render(<DataSourceEditDialog source={null} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Add source" }))
    const name = screen.getByLabelText("Name")
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"))
    expect(screen.getByLabelText("Host").getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByLabelText("Database").getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(name)
    expect(createDataSource).not.toHaveBeenCalled()
  })

  // The test had no catch: a request that threw left nothing on screen.
  it("says why a connection test couldn't run", async () => {
    vi.mocked(testDataSourceConfig).mockRejectedValueOnce({ response: { data: { msg: "Host not reachable from this server." } } })
    render(<DataSourceEditDialog source={null} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "db.internal" } })
    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "analytics" } })
    fireEvent.click(screen.getByRole("button", { name: /Test connection/ }))
    expect(await screen.findByText(/Host not reachable from this server/)).toBeTruthy()
  })

  it("ties the switch to its label", () => {
    render(<DataSourceEditDialog source={null} open onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByRole("switch", { name: "Use this source" })).toBeTruthy()
  })
})
