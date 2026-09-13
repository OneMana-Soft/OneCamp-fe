import { describe, expect, it, afterEach, beforeEach, vi } from "vitest"
// fireEvent rather than user-event: the latter is not a dependency of this repo.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import AdminAuditLog from "@/components/admin/AdminAuditLog"
import type { AuditVerifyResult } from "@/services/settingsService"

vi.mock("@/services/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/settingsService")>()
  return {
    ...actual,
    verifyAuditLog: vi.fn(),
    getAuditLog: vi.fn().mockResolvedValue({ entries: [], categories: [] }),
    exportAuditLog: vi.fn(),
    exportEvidencePack: vi.fn(),
  }
})

import { verifyAuditLog } from "@/services/settingsService"

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const windowed = (): AuditVerifyResult => ({
  ok: true, checked: 500, message: "the last 500 entries verify, from entry 1204 onwards",
  partial: true, from_seq: 1204,
})
const whole = (): AuditVerifyResult => ({
  ok: true, checked: 1703, message: "audit chain intact", partial: false,
})

const clickVerify = async () => {
  const btn = await screen.findByRole("button", { name: /^verify$/i })
  await act(async () => { fireEvent.click(btn) })
}

describe("audit log verification scope", () => {
  // The log only grows. A full walk is instant on a fresh install and a gateway
  // timeout on a year-old workspace, which is exactly when the answer matters.
  it("asks for the bounded check by default", async () => {
    vi.mocked(verifyAuditLog).mockResolvedValue(windowed())
    render(<AdminAuditLog />)
    await clickVerify()
    expect(vi.mocked(verifyAuditLog).mock.calls[0]?.[0]).toBe("recent")
  })

  // "The last 500 verify" and "the log has not been altered" are different claims.
  it("does not let a windowed result read as the whole chain", async () => {
    vi.mocked(verifyAuditLog).mockResolvedValue(windowed())
    const { container } = render(<AdminAuditLog />)
    await clickVerify()
    await screen.findByText(/not the whole log/i)

    const text = (container.textContent || "").replace(/\s+/g, " ")
    expect(text).toMatch(/Recent verified/i)
    expect(text).not.toMatch(/Whole chain verified/i)
    expect(text).toContain("#1204")
  })

  it("says whole chain when the check actually covered it", async () => {
    vi.mocked(verifyAuditLog).mockResolvedValue(whole())
    const { container } = render(<AdminAuditLog />)
    await clickVerify()

    const text = (container.textContent || "").replace(/\s+/g, " ")
    expect(text).toMatch(/Whole chain verified/i)
    expect(text).not.toMatch(/not the whole log/i)
  })

  // The fast answer must not be the only one available, or the bound becomes a
  // ceiling on what anyone can ever prove.
  it("offers the full walk after a windowed pass, and asks for it explicitly", async () => {
    vi.mocked(verifyAuditLog).mockResolvedValue(windowed())
    render(<AdminAuditLog />)
    await clickVerify()

    const full = await screen.findByRole("button", { name: /check the whole chain/i })
    vi.mocked(verifyAuditLog).mockResolvedValue(whole())
    await act(async () => { fireEvent.click(full) })
    expect(vi.mocked(verifyAuditLog).mock.calls[1]?.[0]).toBe("full")
  })

  // A failure must never be carried by colour alone.
  it("states tampering in words, not just in red", async () => {
    vi.mocked(verifyAuditLog).mockResolvedValue({
      ok: false, checked: 12, message: "audit chain broken", partial: true, first_bad_seq: 13,
    })
    const { container } = render(<AdminAuditLog />)
    await clickVerify()

    expect(await screen.findByText(/tampering detected/i)).toBeTruthy()
    // And no offer to "check the whole chain" dressed as reassurance on a failure.
    expect(screen.queryByRole("button", { name: /check the whole chain/i })).toBeNull()
    expect(container.querySelector('[class*="text-red-"]')).toBeNull()
  })
})
