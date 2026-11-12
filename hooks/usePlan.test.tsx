import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, renderHook, screen } from "@testing-library/react"

afterEach(cleanup)

const fetchState: { data: unknown; urls: string[] } = { data: undefined, urls: [] }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    fetchState.urls.push(url)
    return { data: url ? fetchState.data : undefined, mutate: vi.fn() }
  },
}))

import { usePlan } from "@/hooks/usePlan"
import { PlanLockedNotice } from "@/components/admin/PlanLockedNotice"

const LINKS = {
  licence: "https://shop.example/buy?plan=lifetime",
  cloud: "https://shop.example/buy?plan=cloud",
  account: "https://shop.example/account",
  pricing: "https://shop.example/pricing",
}
const FREE = {
  data: {
    plan: "free",
    used: 14,
    limit: 25,
    free_plan: true,
    locked: ["sso", "ldap", "scim", "audit_export"],
    controls: [
      { key: "sso", included: false },
      { key: "ldap", included: false },
      { key: "scim", included: false },
      { key: "audit_export", included: false },
    ],
    release: { running: "v2.79.0", edition: "v2" },
    managed: false,
    hosting: "self",
    upgrade_url: "https://shop.example/buy",
    links: LINKS,
  },
}

describe("usePlan", () => {
  it("locks nothing while loading or when the call fails, so a licensed workspace never loses a control", () => {
    fetchState.data = undefined
    const { result } = renderHook(() => usePlan())
    expect(result.current.known).toBe(false)
    expect(result.current.freePlan).toBe(false)
    expect(result.current.isLocked("scim")).toBe(false)
    expect(result.current.limit).toBe(0)
    expect(result.current.upgradeUrl).toBeUndefined()
  })

  // Three screens read /admin/seats and each typed its own idea of the
  // answer; now every reader asks one key and gets one shape.
  it("one request feeds every reader: /admin/plan, read whole", () => {
    fetchState.data = FREE
    fetchState.urls = []
    const a = renderHook(() => usePlan()).result.current
    const b = renderHook(() => usePlan()).result.current
    expect(new Set(fetchState.urls)).toEqual(new Set(["/admin/plan"]))
    expect(a).toMatchObject({ known: true, plan: "free", used: 14, limit: 25, freePlan: true, managed: false, hosting: "self" })
    expect(a.release).toEqual({ running: "v2.79.0", edition: "v2" })
    expect(a.links).toEqual(LINKS)
    expect(a.controls.map((c) => c.key)).toEqual(["sso", "ldap", "scim", "audit_export"])
    expect(a.isLocked("audit_export")).toBe(true)
    expect(b.used).toBe(a.used)
  })

  it("sends an admin to the licence the server names", () => {
    fetchState.data = FREE
    expect(renderHook(() => usePlan()).result.current.upgradeUrl).toBe(LINKS.licence)
  })

  it("locks nothing on a licensed workspace", () => {
    fetchState.data = { data: { ...FREE.data, plan: "licensed", used: 40, limit: 0, free_plan: false, locked: [] } }
    const { result } = renderHook(() => usePlan())
    expect(result.current.isLocked("sso")).toBe(false)
    expect(result.current.plan).toBe("licensed")
  })

  it("asks nothing until it's wanted (a dialog that isn't open)", () => {
    fetchState.urls = []
    renderHook(() => usePlan({ enabled: false }))
    expect(fetchState.urls).toEqual([""])
  })
})

describe("PlanLockedNotice", () => {
  it("names the control, what the free plan leaves out, and where to get it", () => {
    render(<PlanLockedNotice what="SCIM provisioning" upgradeUrl="https://licence.example/buy" />)
    expect(screen.getByRole("note")).toHaveTextContent("SCIM provisioning needs a OneCamp licence.")
    expect(screen.getByRole("note")).toHaveTextContent("single sign-on, LDAP, SCIM and audit export")
    // One way to company controls, in the same words everywhere (ADMIN-01).
    expect(screen.getByRole("link", { name: "Unlock company controls" })).toHaveAttribute("href", "https://licence.example/buy")
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
