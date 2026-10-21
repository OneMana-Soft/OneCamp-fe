import { afterEach, describe, expect, it, vi } from "vitest"

const axiosMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), delete: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: axiosMock, OWN_ERRORS: { suppressErrorToast: true } }))

const { copyPublishedPage, pageAddress, pagePath, publishLink, settingsOf, tidySlug, unlockPage, unpublishLink } = await import("@/lib/publish/publish")

const link = { id: "g-1", capability: "view" as const, expires_at: null, created_at: "", mine: true, slug: "launch-notes", indexable: false, allow_copies: true, has_password: true }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const f of Object.values(axiosMock)) f.mockReset()
})

describe("a published link", () => {
  it("is sent back whole, with a change to some of it", () => {
    expect(settingsOf(link)).toEqual({ slug: "launch-notes", indexable: false, allow_copies: true })
    expect(settingsOf(link, { indexable: true })).toEqual({ slug: "launch-notes", indexable: true, allow_copies: true })
    expect(settingsOf(link, { password: "" })).toEqual({ slug: "launch-notes", indexable: false, allow_copies: true, password: "" })
  })

  it("tidies an address as the server keeps it", () => {
    for (const [typed, want] of [
      ["  Launch Notes 2026 ", "launch-notes-2026"], ["Q4/plan_v2.final", "q4-plan-v2-final"], ["--a--b--", "a-b"],
      ["Café ☕ menu", "caf-menu"], ["!!!", ""], ["ab".repeat(40), "ab".repeat(32)],
    ]) {
      expect(tidySlug(typed)).toBe(want)
    }
  })

  it("is reached by its address or its link's token", () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://api.example.test/")
    expect(pagePath({ slug: "launch-notes" })).toBe("/public/p/launch-notes")
    expect(pagePath({ token: "a/b" })).toBe("/public/d/a%2Fb")
    expect(pageAddress({ slug: "launch-notes" }, "3.99 sig")).toBe("https://api.example.test/public/p/launch-notes?k=3.99%20sig")
    expect(pageAddress({ token: "tok" })).toBe("https://api.example.test/public/d/tok")
  })
})

describe("the calls", () => {
  it("publish, unpublish and copy through the link's routes", async () => {
    axiosMock.put.mockResolvedValue({ data: { data: link } })
    expect(await publishLink("g/1", { indexable: true, allow_copies: false })).toEqual(link)
    expect(axiosMock.put).toHaveBeenCalledWith("/guest/links/g%2F1/publish", { indexable: true, allow_copies: false }, { suppressErrorToast: true })
    axiosMock.delete.mockResolvedValue({ data: { data: { ...link, slug: undefined } } })
    await unpublishLink("g-1")
    expect(axiosMock.delete).toHaveBeenCalledWith("/guest/links/g-1/publish", { suppressErrorToast: true })
    axiosMock.post.mockResolvedValue({ data: { doc_uuid: "copy-1" } })
    expect(await copyPublishedPage({ slug: "launch-notes" }, "3.99.sig")).toBe("copy-1")
    expect(axiosMock.post).toHaveBeenCalledWith("/guest/links/copy", { slug: "launch-notes", k: "3.99.sig" }, { suppressErrorToast: true })
  })

  it("unlock a page with no session and no cookie, by address or token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { token: "t", url: "u", expires_in: 1 } }), headers: new Headers() })
    vi.stubGlobal("fetch", fetchMock)
    expect(await unlockPage({ slug: "launch-notes" }, "open sesame")).toEqual({ ok: true, data: { token: "t", url: "u", expires_in: 1 } })
    await unlockPage({ token: "tok" }, "open sesame")
    const [first, init] = fetchMock.mock.calls[0]
    expect(String(first)).toMatch(/\/public\/p\/launch-notes\/unlock$/)
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/public\/d\/tok\/unlock$/)
    expect(init.credentials).toBe("omit")
    expect(JSON.parse(init.body)).toEqual({ password: "open sesame" })
  })
})
