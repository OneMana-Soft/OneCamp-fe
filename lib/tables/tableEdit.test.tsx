import * as React from "react"
import { describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { AxiosError, AxiosHeaders } from "axios"
import { refusedAsViewer, TableEditProvider, useTableEdit } from "@/lib/tables/tableEdit"

/** A refused request, as axios rejects it. */
function refused(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError("refused", String(status), config, null, { status, statusText: "", headers: {}, config, data })
}

describe("who may edit a table's rows (V-170)", () => {
  it("edits where no table says otherwise, and not where its page says they may only view it", () => {
    expect(renderHook(() => useTableEdit()).result.current).toBe(true)
    const viewer = ({ children }: { children: React.ReactNode }) => <TableEditProvider value={false}>{children}</TableEditProvider>
    expect(renderHook(() => useTableEdit(), { wrapper: viewer }).result.current).toBe(false)
    const editor = ({ children }: { children: React.ReactNode }) => <TableEditProvider value>{children}</TableEditProvider>
    expect(renderHook(() => useTableEdit(), { wrapper: editor }).result.current).toBe(true)
  })

  it("tells a write refused because its writer may only view the table from every other refusal", () => {
    expect(refusedAsViewer(refused(403, { msg: "You can view this table", read_only: true }))).toBe(true)
    expect(refusedAsViewer(refused(403, { msg: "you don't have access to this table" }))).toBe(false)
    expect(refusedAsViewer(refused(404, { msg: "table not found", read_only: true }))).toBe(false)
    expect(refusedAsViewer(refused(403, "You can view this table"))).toBe(false)
    expect(refusedAsViewer(new Error("offline"))).toBe(false)
    expect(refusedAsViewer(undefined)).toBe(false)
  })
})
