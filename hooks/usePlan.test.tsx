import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, renderHook, screen } from "@testing-library/react"

afterEach(cleanup)

const fetchState: { data: unknown } = { data: undefined }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: fetchState.data }) }))

import { usePlan } from "@/hooks/usePlan"
import { PlanLockedNotice } from "@/components/admin/PlanLockedNotice"

describe("usePlan", () => {
  it("locks nothing while loading or when the call fails, so a licensed workspace never loses a control", () => {
    fetchState.data = undefined
    const { result } = renderHook(() => usePlan())
    expect(result.current.freePlan).toBe(false)
    expect(result.current.isLocked("scim")).toBe(false)
    expect(result.current.upgradeUrl).toBeUndefined()
  })

  it("reads the free plan's locked controls from /admin/seats", () => {
    fetchState.data = { data: { used: 3, limit: 25, free_plan: true, locked: ["sso", "ldap", "scim", "audit_export"], upgrade_url: "https://licence.example/buy" } }
    const { result } = renderHook(() => usePlan())
    expect(result.current.freePlan).toBe(true)
    expect(result.current.isLocked("audit_export")).toBe(true)
  })

  it("locks nothing on a licensed workspace", () => {
    fetchState.data = { data: { used: 40, limit: 0, free_plan: false, locked: [] } }
    const { result } = renderHook(() => usePlan())
    expect(result.current.isLocked("sso")).toBe(false)
  })
})

describe("PlanLockedNotice", () => {
  it("names the control, what the free plan leaves out, and where to get it", () => {
    render(<PlanLockedNotice what="SCIM provisioning" upgradeUrl="https://licence.example/buy" />)
    expect(screen.getByRole("note")).toHaveTextContent("SCIM provisioning needs a OneCamp licence.")
    expect(screen.getByRole("note")).toHaveTextContent("single sign-on, LDAP, SCIM and audit export")
    expect(screen.getByRole("link", { name: "See the licence" })).toHaveAttribute("href", "https://licence.example/buy")
    // What to do after paying, or an admin pays and sees nothing change.
    expect(screen.getByRole("note")).toHaveTextContent("re-run your install command")
  })
})

describe("PlanLockedNotice without an upgrade address", () => {
  it("offers no link when the server named none", () => {
    render(<PlanLockedNotice what="LDAP sign-in" />)
    expect(screen.queryByRole("link")).toBeNull()
  })
})
