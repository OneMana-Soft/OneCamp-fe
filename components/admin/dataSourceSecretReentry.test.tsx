import { afterEach, describe, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { expectSecretAskedAgain } from "@/lib/testing/secretReentryKit"

// A data source's stored password is bound to the server it was given for:
// another host needs it entered again (hooks/useSecretReentry), as the server
// holds it. The dialog asks before saving.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/services/dataSourceService", async (orig) => ({
  ...(await orig<typeof import("@/services/dataSourceService")>()),
  createDataSource: vi.fn(),
  updateDataSource: vi.fn(),
  testDataSource: vi.fn(),
  testDataSourceConfig: vi.fn(),
}))

import { DataSourceEditDialog } from "@/components/admin/DataSourceEditDialog"
import { updateDataSource, type DataSource } from "@/services/dataSourceService"

const saved: DataSource = {
  id: "ds1",
  name: "Warehouse",
  engine: "postgres",
  host: "db.example.com",
  port: 5432,
  database: "analytics",
  username: "readonly",
  has_password: true,
  ssl_mode: "require",
  visibility: "private",
  enabled: true,
  created_by: "u1",
  can_manage: true,
  created_at: "",
  updated_at: "",
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("a data source's stored password", () => {
  it("is asked for again when the source moves to another host, and nothing is saved", async () => {
    render(<DataSourceEditDialog source={saved} open onClose={() => {}} onSaved={() => {}} />)
    await expectSecretAskedAgain({
      address: () => screen.getByLabelText("Host"),
      moveTo: "db.elsewhere.example.net",
      secret: () => screen.getByLabelText("Password"),
      noun: "password",
      save: () => fireEvent.click(screen.getByRole("button", { name: "Save changes" })),
      sent: () => vi.mocked(updateDataSource).mock.calls.length,
    })
  })
})
