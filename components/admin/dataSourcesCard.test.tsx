import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const fetchState = vi.hoisted(() => ({ value: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() } }))
const toastSpy = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => fetchState.value }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }))
vi.mock("@/components/admin/DataSourceEditDialog", () => ({ DataSourceEditDialog: () => null }))
vi.mock("@/services/dataSourceService", async (orig) => ({
  ...(await orig<typeof import("@/services/dataSourceService")>()),
  testDataSource: vi.fn(),
  getDataSourceSchema: vi.fn(),
}))

import DataSourcesCard from "@/components/admin/DataSourcesCard"
import { testDataSource } from "@/services/dataSourceService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const source = {
  id: "d1",
  name: "Billing replica",
  engine: "postgres",
  host: "db.kestrel.studio",
  port: 5432,
  database: "billing",
  username: "reader",
  has_password: false,
  ssl_mode: "require",
  visibility: "private",
  enabled: false,
  created_by: "u1",
  can_manage: true,
  created_at: "",
  updated_at: "",
}

describe("data sources", () => {
  it("puts the title icon on the AI group's tile, and adds a source from an outline button", () => {
    fetchState.value = { data: { data: [source] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<DataSourcesCard />)
    expect(document.querySelector(".hue-dusk")).toBeTruthy()
    expect(document.querySelector("svg.text-primary")).toBeNull()
    expect(screen.getByRole("button", { name: /Add source/ }).className).not.toMatch(/\bbg-primary\b/)
  })

  // The engine was an uppercase badge and the state words were pills.
  it("says the engine, who can query it and its state in words, and names its controls", () => {
    fetchState.value = { data: { data: [source] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<DataSourcesCard />)
    expect(screen.getByText("PostgreSQL")).toBeTruthy()
    expect(screen.getByText("Only you and admins")).toBeTruthy()
    expect(screen.getByText("Turned off")).toBeTruthy()
    expect(screen.getByText("No password")).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Use Billing replica" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Test Billing replica" })).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/\buppercase\b/)
  })

  // A test that threw left nothing on screen: no catch at all.
  it("says why a connection test couldn't run", async () => {
    fetchState.value = { data: { data: [source] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    vi.mocked(testDataSource).mockRejectedValueOnce({ response: { data: { msg: "The server refused the connection." } } })
    render(<DataSourcesCard />)
    fireEvent.click(screen.getByRole("button", { name: "Test Billing replica" }))
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't connect to Billing replica", description: "The server refused the connection." }),
      ),
    )
  })
})
