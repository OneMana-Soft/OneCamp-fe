import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
// The toast's offer (useSaveStatus loads it on first use): an add or a change offers itself back (design-14's Undo); a
// remove, asked first and with no way back on the server, offers nothing.
const offerBack = vi.hoisted(() => vi.fn())
vi.mock("@/components/ui/undoToast", () => ({ offerBack }))

import SensitivityLabelsCard from "./SensitivityLabelsCard"
import type { LabelHttp, SensitivityLabel } from "@/lib/labels/labels"

const RULES = [
  { key: "no_guest_links", name: "No guest links" },
  { key: "no_export", name: "No exports" },
]
const CONFIDENTIAL: SensitivityLabel = { id: "l-c", name: "Confidential", colour: "red", rank: 2, rules: ["no_export", "no_guest_links"] }
const INTERNAL: SensitivityLabel = { id: "l-i", name: "Internal", colour: "amber", rank: 1, rules: ["no_guest_links"] }
const refused = (status: number, msg: string) => Object.assign(new Error(msg), { isAxiosError: true, response: { status, data: { msg } } })

type Call = { method: string; url: string; body?: unknown }
/** Calls that would also raise the client's shared error toast: the card says every failure in place, so none may. */
const loud: string[] = []

function fakeHttp(over: Partial<Record<string, (c: Call) => unknown>> = {}, labels: SensitivityLabel[] = [INTERNAL, CONFIDENTIAL]) {
  const calls: Call[] = []
  const answer = (method: string) =>
    vi.fn(async (url: string, a?: unknown, b?: unknown) => {
      const c: Call = method === "get" ? { method, url } : { method, url, body: a }
      const config = (method === "get" ? a : b) as { suppressErrorToast?: boolean } | undefined
      if (!config?.suppressErrorToast) loud.push(`${method} ${url}`)
      calls.push(c)
      const own = over[`${method} ${url}`]
      if (own) return { data: await own(c) }
      if (url === "/labels") return { data: { data: { labels, rules: RULES } } }
      // As the server answers: the label added (with its new id) or changed.
      if (method === "post" && url === "/admin/labels") return { data: { data: { id: "l-new", ...(a as object) } } }
      if (method === "patch") return { data: { data: { id: url.split("/").pop(), ...(a as object) } } }
      return { data: { msg: "ok", data: null } }
    })
  const http = { get: answer("get"), post: answer("post"), patch: answer("patch"), put: answer("put") } as unknown as LabelHttp
  return { http, calls }
}

afterEach(() => {
  cleanup()
  expect(loud).toEqual([])
  loud.length = 0
  vi.clearAllMocks()
})

describe("Settings › Security › Sensitivity labels (miro-44 L)", () => {
  it("lists the labels highest level first, each with its rules and level, with Change and Remove", async () => {
    render(<SensitivityLabelsCard http={fakeHttp().http} />)
    const list = await screen.findByRole("list", { name: "Sensitivity labels" })
    const rows = within(list).getAllByRole("listitem")
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Confidential", "Internal"])
    expect(rows[0].textContent).toContain("No guest links · No exports · Level 2")
    expect(rows[1].textContent).toContain("No guest links · Level 1")
    expect(within(rows[0]).getByRole("button", { name: "Change Confidential" })).toBeTruthy()
    expect(within(rows[0]).getByRole("button", { name: "Remove Confidential" })).toBeTruthy()
  })

  it("adds a label with its rules as switches, and reads the list again", async () => {
    const { http, calls } = fakeHttp()
    render(<SensitivityLabelsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Add a label" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "  Board   only " } })
    fireEvent.change(within(dialog).getByLabelText("Level"), { target: { value: "5" } })
    fireEvent.click(within(dialog).getByRole("switch", { name: "No exports" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Add the label" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(calls.filter((c) => c.method !== "get")).toEqual([{ method: "post", url: "/admin/labels", body: { name: "Board only", colour: "rose", rank: 5, rules: ["no_export"] } }])
    // Read at the start, and again once the label is added.
    expect(calls.filter((c) => c.url === "/labels")).toHaveLength(2)

    // Offered back: Undo takes the new label off again, and the list is read once more.
    await waitFor(() => expect(offerBack).toHaveBeenCalledTimes(1))
    const offer = offerBack.mock.calls[0][0] as { what: string; undo: () => Promise<unknown> }
    expect(offer.what).toBe("Board only: added")
    await offer.undo()
    expect(calls.filter((c) => c.method !== "get").at(-1)).toEqual({ method: "post", url: "/admin/labels/l-new/remove", body: undefined })
    expect(calls.filter((c) => c.url === "/labels")).toHaveLength(3)
  })

  it("checks a draft before sending it, and says the server's refusal in its words", async () => {
    const { http, calls } = fakeHttp({ "post /admin/labels": () => Promise.reject(refused(409, "Another label has that name. Choose another.")) })
    render(<SensitivityLabelsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Add a label" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Add the label" }))
    expect(within(dialog).getByRole("alert").textContent).toBe("A label needs a name.")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "internal" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add the label" }))
    expect(within(dialog).getByRole("alert").textContent).toBe("Another label has that name. Choose another.")
    expect(calls.filter((c) => c.method === "post")).toHaveLength(0)
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Secret" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add the label" }))
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Another label has that name. Choose another.")
    expect(calls.filter((c) => c.method === "post")).toHaveLength(1)
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("changes a label in place, its own name kept, and removes one after asking", async () => {
    const { http, calls } = fakeHttp()
    render(<SensitivityLabelsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Change Confidential" }))
    const dialog = await screen.findByRole("dialog")
    expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("Confidential")
    expect(within(dialog).getByRole("switch", { name: "No guest links" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(dialog).getByRole("switch", { name: "No guest links" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Save the label" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(calls.filter((c) => c.method === "patch")).toEqual([{ method: "patch", url: "/admin/labels/l-c", body: { name: "Confidential", colour: "red", rank: 2, rules: ["no_export"] } }])
    // Offered back: Undo puts the label's last values back.
    await waitFor(() => expect(offerBack).toHaveBeenCalledTimes(1))
    const offer = offerBack.mock.calls[0][0] as { what: string; undo: () => Promise<unknown> }
    expect(offer.what).toBe("Confidential: changed")
    await offer.undo()
    expect(calls.filter((c) => c.method === "patch").at(-1)).toEqual({ method: "patch", url: "/admin/labels/l-c", body: { name: "Confidential", colour: "red", rank: 2, rules: ["no_export", "no_guest_links"] } })

    fireEvent.click(await screen.findByRole("button", { name: "Remove Internal" }))
    const ask = await screen.findByRole("dialog")
    expect(within(ask).getByText("Remove Internal?")).toBeTruthy()
    fireEvent.click(within(ask).getByRole("button", { name: "Keep it" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(calls.filter((c) => c.url.endsWith("/remove"))).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Remove Internal" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove the label" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(calls.filter((c) => c.url.endsWith("/remove"))).toEqual([{ method: "post", url: "/admin/labels/l-i/remove", body: undefined }])
    // A remove was asked first and offers nothing back: the change's offer is still the only one.
    await new Promise((r) => setTimeout(r, 20))
    expect(offerBack).toHaveBeenCalledTimes(1)
  })

  it("says when there are no labels yet, and offers Try again when they can't be read", async () => {
    const { unmount } = render(<SensitivityLabelsCard http={fakeHttp({}, []).http} />)
    expect(await screen.findByText("No labels yet")).toBeTruthy()
    unmount()
    let fail = true
    const { http } = fakeHttp({ "get /labels": () => (fail ? Promise.reject(refused(503, "")) : { data: { labels: [CONFIDENTIAL], rules: RULES } }) })
    render(<SensitivityLabelsCard http={http} />)
    const retry = await screen.findByRole("button", { name: /Try again/ })
    expect((screen.getByRole("button", { name: "Add a label" }) as HTMLButtonElement).disabled).toBe(true)
    fail = false
    fireEvent.click(retry)
    expect(await screen.findByRole("list", { name: "Sensitivity labels" })).toBeTruthy()
  })
})
