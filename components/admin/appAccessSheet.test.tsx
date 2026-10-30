import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// An installed app's access, in Admin › Apps (platform P-API, §3.1): the user
// it acts as, what it may do, where it may reach, and its tokens, made,
// rotated and revoked here, each shown once.

const { answers, get, put, post, del, toast, confirm, search, makeRequest, sheetMode } = vi.hoisted(() => {
  const search = vi.fn()
  return {
    answers: {} as Record<string, unknown>,
    // The server's answer now: what the sheet's read holds, unless a test says another admin changed it since.
    get: vi.fn(),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(),
    del: vi.fn(async () => ({ data: {} })),
    toast: vi.fn(),
    confirm: vi.fn(),
    search,
    makeRequest: (o: { payload: { global_search_text: string } }) => search(o.payload.global_search_text),
    sheetMode: { on: false },
  }
})
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => answers[url] ?? { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() },
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: (...a: unknown[]) => get(...(a as [])),
    put: (...a: unknown[]) => put(...(a as [])),
    post: (...a: unknown[]) => post(...(a as [])),
    delete: (...a: unknown[]) => del(...(a as [])),
  },
}))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))
// A phone's rule (components/ui/overlayMode), and the phone sheet's code, which loads when one first opens.
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => sheetMode.on }))
vi.mock("next/dynamic", async () => {
  const React = await import("react")
  return {
    default: (load: () => Promise<{ default: React.ComponentType }>) =>
      function Lazy(props: Record<string, unknown>) {
        const [C, setC] = React.useState<React.ComponentType | null>(null)
        React.useEffect(() => void load().then((m) => setC(() => m.default)), [])
        return C ? React.createElement(C, props) : null
      },
  }
})

import AppAccessSheet from "@/components/admin/AppAccessSheet"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()
Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } })

const APP = "3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const DOC = "7d1e5c2a-9b3f-4a6e-8c1d-2f4b6a8e0c3d"
const DOC2 = "8e2f6d3b-0c4a-4b7f-9d2e-3a5c7b9f1d4e"
const TABLE = "0b9e6a52-1c3d-4f7e-8a2b-5c6d7e8f9a0b"
const TABLE2 = "1c0f7b63-2d4e-4a8f-9b3c-6d7e8f9a0b1c"
const mutate = vi.fn()

const identity = (over: Record<string, unknown> = {}) => ({
  app_id: APP,
  slug: "deploys",
  name: "Deploys",
  enabled: true,
  bot_user_id: "5b8f2c1e-3d4a-4e6f-9a0b-1c2d3e4f5a6b",
  access_version: "v1",
  scopes: ["docs:read", "tasks:read"],
  audience: {
    places: [
      { kind: "doc", id: DOC, title: "Launch notes", app_opens: true },
      { kind: "doc", id: DOC2, app_opens: false },
      { kind: "table", id: TABLE },
    ],
    public: false,
  },
  ...over,
})
const token = { id: "t1", name: "Production server", token_prefix: "oc_app_9f2c", scopes: ["tasks:read"], created_at: "2026-10-08T14:03:22Z", expires_at: "2027-01-06T14:03:22Z" }

/** A change's put config: the version it was made from (If-Match, an entity tag) and no toast of its own, since the sheet says a failure. */
const madeFrom = (version: string) => ({ suppressErrorToast: true, headers: { "If-Match": `"${version}"` } })
/** The server's refusal of a change made from a version the app no longer has. */
const stale = () =>
  Object.assign(new Error("Request failed with status code 412"), {
    isAxiosError: true,
    response: { status: 412, data: { msg: "Someone changed what this app may do since you opened it." } },
  })

function answer(id = identity(), tokens: unknown[] = [token]) {
  answers[`/admin/apps/${APP}/identity`] = { data: { data: { identity: id, tokens } }, isLoading: false, isError: undefined, mutate }
}

beforeEach(() => {
  answer()
  answers["/api-tokens/scopes"] = { data: { data: ["tasks:read", "tasks:write", "docs:read"] }, isLoading: false }
  answers["/tables"] = { data: { data: [{ id: TABLE, name: "Vendors" }, { id: TABLE2, name: "Hiring" }] }, isLoading: false }
  get.mockImplementation(async (url: string) => ({ data: (answers[url] as { data: unknown }).data }))
})
afterEach(() => {
  cleanup()
  for (const f of [get, put, post, del, toast, confirm, search, mutate]) f.mockReset()
  put.mockImplementation(async () => ({ data: {} }))
  del.mockImplementation(async () => ({ data: {} }))
  sheetMode.on = false
})

const open = () => render(<AppAccessSheet appId={APP} appName="Deploys" onClose={() => {}} />)
const places = () => within(screen.getByRole("list", { name: "Where Deploys may reach" }))

describe("an app's access", () => {
  it("says who it acts as, what it may do, where it may reach and its tokens", () => {
    open()
    expect(screen.getByText("Deploys acts as its own user")).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Read documents" }).getAttribute("data-state")).toBe("checked")
    expect(screen.getByRole("checkbox", { name: "Create and update tasks" }).getAttribute("data-state")).toBe("unchecked")
    const rows = places().getAllByRole("listitem")
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Launch notes"),
      expect.stringContaining("A doc you can't open"),
      expect.stringContaining("Vendors"),
    ])
    expect(rows[0].textContent).toContain("Its user can open it")
    expect(rows[1].textContent).toContain("Its user can't open it")
    // Nothing decides a table yet, so its row says nothing of it.
    expect(rows[2].textContent).not.toMatch(/Its user/)
    expect(within(screen.getByRole("list", { name: "Tokens for Deploys" })).getByText("Production server")).toBeTruthy()
  })

  it("saves what it may do, keeping where it may reach, and says what its tokens lost", async () => {
    open()
    fireEvent.click(screen.getByRole("checkbox", { name: "Read documents" }))
    await act(async () => screen.getByRole("button", { name: "Save scopes" }).click())
    expect(put).toHaveBeenCalledWith(`/admin/apps/${APP}/access`, {
      scopes: ["tasks:read"],
      audience: { places: [{ kind: "doc", id: DOC }, { kind: "doc", id: DOC2 }, { kind: "table", id: TABLE }], public: false },
    }, madeFrom("v1"))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Scopes saved", description: "Its tokens lost read documents just now." }))
    expect(mutate).toHaveBeenCalled()
  })

  it("takes a place away", async () => {
    open()
    await act(async () => screen.getByRole("button", { name: "Remove Launch notes from where Deploys may reach" }).click())
    expect(put).toHaveBeenCalledWith(`/admin/apps/${APP}/access`, expect.objectContaining({
      audience: { places: [{ kind: "doc", id: DOC2 }, { kind: "table", id: TABLE }], public: false },
    }), madeFrom("v1"))
  })

  it("changes the app as it is now: a place another admin took away stays away when scopes are saved", async () => {
    open()
    // Since this sheet read the app, another admin took Launch notes and the second doc away.
    get.mockResolvedValueOnce({ data: { data: { identity: identity({ audience: { places: [{ kind: "table", id: TABLE }], public: false } }), tokens: [] } } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Read documents" }))
    await act(async () => screen.getByRole("button", { name: "Save scopes" }).click())
    expect(put).toHaveBeenCalledWith(`/admin/apps/${APP}/access`, { scopes: ["tasks:read"], audience: { places: [{ kind: "table", id: TABLE }], public: false } }, madeFrom("v1"))
  })

  // Two admins at once: between this change's read and its put, another took
  // the second doc away. The put made from the older read is refused (412),
  // and the change is made again on the app as it is now, so that removal stays.
  it("makes a change again on the app as it is now when another landed between its read and its put", async () => {
    open()
    get
      .mockResolvedValueOnce({ data: { data: { identity: identity(), tokens: [] } } })
      .mockResolvedValueOnce({ data: { data: { identity: identity({ access_version: "v2", audience: { places: [{ kind: "doc", id: DOC }, { kind: "table", id: TABLE }], public: false } }), tokens: [] } } })
    put.mockRejectedValueOnce(stale())
    await act(async () => screen.getByRole("button", { name: "Remove Launch notes from where Deploys may reach" }).click())
    expect(put).toHaveBeenCalledTimes(2)
    expect(put).toHaveBeenLastCalledWith(`/admin/apps/${APP}/access`, expect.objectContaining({ audience: { places: [{ kind: "table", id: TABLE }], public: false } }), madeFrom("v2"))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Removed Launch notes", tone: "success" }))
  })

  it("says a change refused again, once it was made on the app as it is now", async () => {
    open()
    put.mockRejectedValueOnce(stale()).mockRejectedValueOnce(stale())
    await act(async () => screen.getByRole("button", { name: "Remove Launch notes from where Deploys may reach" }).click())
    expect(put).toHaveBeenCalledTimes(2)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't change where it may reach", description: "Someone changed what this app may do since you opened it.", variant: "destructive" }))
  })

  it("makes one change at a time: while a place is taken away, nothing else changes where it may reach", async () => {
    let answerPut = () => {}
    put.mockImplementationOnce(() => new Promise((r) => (answerPut = () => r({ data: {} }))))
    open()
    const removing = screen.getByRole("button", { name: "Remove Launch notes from where Deploys may reach" })
    await act(async () => removing.click())
    // The place being taken away is busy with it; the others wait, disabled (busyWith).
    expect(removing.getAttribute("aria-busy")).toBe("true")
    const removes = places().getAllByRole("button", { name: /^Remove / }) as HTMLButtonElement[]
    expect(removes.filter((b) => b !== removing).map((b) => b.disabled)).toEqual([true, true])
    expect((screen.getByRole("button", { name: "Add a doc or table" }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => answerPut())
    expect((screen.getByRole("button", { name: "Add a doc or table" }) as HTMLButtonElement).disabled).toBe(false)
    expect(put).toHaveBeenCalledTimes(1)
  })

  it("adds a table from the admin's own list, and not one it has already", async () => {
    open()
    fireEvent.click(screen.getByRole("button", { name: "Add a doc or table" }))
    fireEvent.click(screen.getByRole("radio", { name: "Tables" }))
    expect(screen.getByRole("option", { name: "Vendors" }).getAttribute("aria-disabled")).toBe("true")
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Hiring" })))
    expect(put).toHaveBeenCalledWith(`/admin/apps/${APP}/access`, expect.objectContaining({
      audience: expect.objectContaining({ places: expect.arrayContaining([{ kind: "table", id: TABLE2 }]) }),
    }), madeFrom("v1"))
  })

  // Two picks before the first was saved each read the app and sent its list,
  // so the second could drop the first's place, and both said Added (CR-15).
  it("adds one place at a time: a second pick while the first saves sends nothing", async () => {
    const BUDGETS = "2d1a8c74-3e5f-4b9a-8c4d-7e8f9a0b1c2d"
    answers["/tables"] = { data: { data: [{ id: TABLE, name: "Vendors" }, { id: TABLE2, name: "Hiring" }, { id: BUDGETS, name: "Budgets" }] }, isLoading: false }
    let answerPut = () => {}
    put.mockImplementationOnce(() => new Promise((r) => (answerPut = () => r({ data: {} }))))
    open()
    fireEvent.click(screen.getByRole("button", { name: "Add a doc or table" }))
    fireEvent.click(screen.getByRole("radio", { name: "Tables" }))
    // Both in one frame, before the sheet draws the first as under way.
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "Hiring" }))
      fireEvent.click(screen.getByRole("option", { name: "Budgets" }))
    })
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("option", { name: "Budgets" }).getAttribute("aria-disabled")).toBe("true")
    await act(async () => answerPut())
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith(`/admin/apps/${APP}/access`, expect.objectContaining({
      audience: expect.objectContaining({ places: expect.arrayContaining([{ kind: "table", id: TABLE }, { kind: "table", id: TABLE2 }]) }),
    }), madeFrom("v1"))
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Added Hiring" }))
  })

  it("finds a doc to add through the workspace search", async () => {
    search.mockResolvedValue({ page: [{ type: "doc", doc: { doc_uuid: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", doc_title: "Vendor contracts" } }] })
    open()
    fireEvent.click(screen.getByRole("button", { name: "Add a doc or table" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Find a doc" }), { target: { value: "vendor" } })
    const found = await screen.findByRole("option", { name: "Vendor contracts" })
    expect(search).toHaveBeenCalledWith("vendor")
    await act(async () => fireEvent.click(found))
    expect(put).toHaveBeenCalledWith(`/admin/apps/${APP}/access`, expect.objectContaining({
      audience: expect.objectContaining({ places: expect.arrayContaining([{ kind: "doc", id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" }]) }),
    }), madeFrom("v1"))
  })
})

describe("an app's tokens", () => {
  it("are made with a name, a life and some of its scopes, and shown once", async () => {
    post.mockResolvedValue({ data: { data: { token: { ...token, id: "t2", name: "CI" }, plaintext: "oc_app_secretvalue" } } })
    open()
    fireEvent.click(screen.getByRole("button", { name: "New token" }))
    const dialog = screen.getByRole("dialog", { name: "New token for Deploys" })
    // A token needs a name first.
    await act(async () => within(dialog).getByRole("button", { name: "Make token" }).click())
    expect(within(dialog).getByText("Give the token a name.")).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "CI" } })
    fireEvent.click(within(within(dialog).getByRole("radiogroup", { name: "Lasts" })).getByRole("radio", { name: "30 d" }))
    await act(async () => within(dialog).getByRole("button", { name: "Make token" }).click())
    expect(post).toHaveBeenCalledWith(`/admin/apps/${APP}/tokens`, { name: "CI", scopes: ["docs:read", "tasks:read"], expires_in_days: 30 })
    expect(screen.getByText("oc_app_secretvalue")).toBeTruthy()
    // Closing before copying asks: it can't be shown again.
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Close without copying?" }))
  })

  it("are rotated after asking, and the new secret is shown once", async () => {
    post.mockResolvedValue({ data: { data: { plaintext: "oc_app_rotatedvalue" } } })
    open()
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Production server" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rotate…" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rotate the token "Production server"?' }))
    expect(post).not.toHaveBeenCalled()
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    expect(post).toHaveBeenCalledWith(`/admin/apps/${APP}/tokens/t1/rotate`)
    expect(screen.getByRole("dialog", { name: "New secret for Production server" })).toBeTruthy()
    expect(screen.getByText("oc_app_rotatedvalue")).toBeTruthy()
  })

  it("are revoked after asking", async () => {
    open()
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Production server" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Revoke…" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Revoke the token "Production server"?', destructive: true }))
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    expect(del).toHaveBeenCalledWith(`/admin/apps/${APP}/tokens/t1`)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Token revoked" }))
  })

  it("can't be made while the app is off, or holds three, and says why", () => {
    answer(identity({ enabled: false }))
    open()
    expect((screen.getByRole("button", { name: "New token" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("Turn Deploys on to make it a token.")).toBeTruthy()
    cleanup()
    answer(identity(), [token, { ...token, id: "t2" }, { ...token, id: "t3" }])
    open()
    expect((screen.getByRole("button", { name: "New token" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/It has 3 tokens, the most an app holds/)).toBeTruthy()
  })
})

describe("on a phone", () => {
  it("a new token's dialog is the shared sheet", async () => {
    sheetMode.on = true
    open()
    fireEvent.click(screen.getByRole("button", { name: "New token" }))
    // The sheet's frame stands in while its chunk loads (components/ui/sheetFrame); then the sheet.
    await waitFor(() => expect(screen.getByRole("dialog", { name: "New token for Deploys" }).closest("[data-v3-sheet]")).not.toBeNull())
  })

  it("a rotated token's new secret is the shared sheet", async () => {
    sheetMode.on = true
    post.mockResolvedValue({ data: { data: { plaintext: "oc_app_rotatedvalue" } } })
    open()
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Production server" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rotate…" }))
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    // The sheet's frame stands in while its chunk loads (components/ui/sheetFrame); then the sheet.
    await waitFor(() => expect(screen.getByRole("dialog", { name: "New secret for Production server" }).closest("[data-v3-sheet]")).not.toBeNull())
  })
})

describe("a failed read", () => {
  it("of the docs to add says so in the picker, with Try again, and asks again", async () => {
    search.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce({ page: [{ type: "doc", doc: { doc_uuid: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", doc_title: "Vendor contracts" } }] })
    open()
    fireEvent.click(screen.getByRole("button", { name: "Add a doc or table" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Find a doc" }), { target: { value: "vendor" } })
    const retry = await screen.findByRole("button", { name: /Try again/ })
    expect(screen.queryByText("Searching…")).toBeNull()
    expect(screen.queryByText("No doc you can open matches that.")).toBeNull()
    fireEvent.click(retry)
    expect(await screen.findByRole("option", { name: "Vendor contracts" })).toBeTruthy()
    expect(search).toHaveBeenCalledTimes(2)
  })

  it("says so in place, with Try again", () => {
    answers[`/admin/apps/${APP}/identity`] = { data: undefined, isLoading: false, isError: new Error("Network Error"), mutate }
    open()
    expect(screen.getByText(/Couldn.t load the app.s access/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(mutate).toHaveBeenCalled()
  })
})
