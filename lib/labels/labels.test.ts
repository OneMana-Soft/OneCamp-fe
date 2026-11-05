import { describe, expect, it, vi } from "vitest"
import {
  asLabel,
  byLevel,
  carriesLabels,
  changeLabel,
  defineLabel,
  draftBody,
  draftProblem,
  itemLabelKey,
  labelHas,
  labelRefusal,
  loadLabels,
  putItemLabel,
  removeLabel,
  ruleLine,
  ruleName,
  type LabelHttp,
  type SensitivityLabel,
} from "./labels"

const RULES = [
  { key: "no_guest_links", name: "No guest links" },
  { key: "no_export", name: "No exports" },
]
const CONFIDENTIAL: SensitivityLabel = { id: "l-c", name: "Confidential", colour: "red", rank: 2, rules: ["no_export", "no_guest_links"] }
const INTERNAL: SensitivityLabel = { id: "l-i", name: "Internal", colour: "amber", rank: 1, rules: ["no_guest_links"] }
const refused = (status: number, data: unknown) => Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } })

function fakeHttp(answer: unknown = { data: {} }) {
  const calls: { method: string; url: string; body?: unknown; quiet?: boolean }[] = []
  const at =
    (method: string) =>
    async (url: string, a?: unknown, b?: unknown) => {
      const config = (method === "get" ? a : b) as { suppressErrorToast?: boolean } | undefined
      calls.push({ method, url, body: method === "get" ? undefined : a, quiet: config?.suppressErrorToast === true })
      return { data: answer }
    }
  const http = { get: vi.fn(at("get")), post: vi.fn(at("post")), patch: vi.fn(at("patch")), put: vi.fn(at("put")) } as unknown as LabelHttp
  return { http, calls }
}

describe("sensitivity labels (miro-44 L): the shared words and calls", () => {
  it("only boards and docs carry a label; an item's key is its kind and id, and none without an id", () => {
    expect(carriesLabels("board")).toBe(true)
    expect(carriesLabels("doc")).toBe(true)
    for (const k of ["table", "channel", "project", "calendar"]) expect(carriesLabels(k)).toBe(false)
    expect(itemLabelKey("board", "b-1")).toBe("/labels/items/board/b-1")
    expect(itemLabelKey("doc", "a b")).toBe("/labels/items/doc/a%20b")
    expect(itemLabelKey("doc", "")).toBe("")
    expect(itemLabelKey("doc", undefined)).toBe("")
  })

  it("says a label's rules in the server's names and order, and a rule it doesn't know in words", () => {
    expect(ruleLine(CONFIDENTIAL.rules, RULES)).toBe("No guest links · No exports")
    expect(ruleLine([], RULES)).toBe("No rules")
    expect(ruleLine(null)).toBe("No rules")
    // Before the server's list is read: its names and order all the same.
    expect(ruleLine(["no_export", "no_guest_links"])).toBe("No guest links · No exports")
    expect(ruleName("no_export")).toBe("No exports")
    expect(ruleName("no_ai_reads")).toBe("No ai reads")
    expect(labelHas(CONFIDENTIAL, "no_export")).toBe(true)
    expect(labelHas(INTERNAL, "no_export")).toBe(false)
    expect(labelHas(null, "no_export")).toBe(false)
  })

  it("lists the highest level first, then by name, without changing what it was given", () => {
    const given = [INTERNAL, { ...INTERNAL, id: "l-a", name: "Archive" }, CONFIDENTIAL]
    expect(byLevel(given).map((l) => l.name)).toEqual(["Confidential", "Archive", "Internal"])
    expect(given[0]).toBe(INTERNAL)
    expect(byLevel(undefined)).toEqual([])
  })

  it("shows a label's refusal in the server's own words, and nothing for any other failure", () => {
    const words = "This doc is labelled Confidential: it can't be exported. Its owner or a workspace admin can change the label."
    expect(labelRefusal(refused(403, { code: "label_forbids", msg: words }))).toBe(words)
    const lower = "Only the board's owner or a workspace admin can lower or remove its label “Confidential”."
    expect(labelRefusal(refused(403, { code: "label_owner_lowers", msg: lower }))).toBe(lower)
    // The members' export policy is a 403 too, with no label code: not a label's words.
    expect(labelRefusal(refused(403, { msg: "Exports are off for members." }))).toBeNull()
    expect(labelRefusal(refused(403, { code: "label_forbids", msg: "  " }))).toBeNull()
    expect(labelRefusal(new Error("Network Error"))).toBeNull()
    expect(labelRefusal(null)).toBeNull()
  })

  it("checks a draft as the server will, a name taken in any case included, and sends it tidied", () => {
    expect(draftProblem({ name: "  ", colour: "rose", rank: 1, rules: [] })).toBe("A label needs a name.")
    expect(draftProblem({ name: "x".repeat(61), colour: "rose", rank: 1, rules: [] })).toBe("A label's name is at most 60 characters.")
    expect(draftProblem({ name: "Secret", colour: "rose", rank: 101, rules: [] })).toBe("A label's level is from 0 to 100.")
    expect(draftProblem({ name: "Secret", colour: "rose", rank: NaN, rules: [] })).toBe("A label's level is from 0 to 100.")
    expect(draftProblem({ name: "confidential", colour: "rose", rank: 1, rules: [] }, [CONFIDENTIAL])).toBe("Another label has that name. Choose another.")
    // A label keeps its own name when it is changed.
    expect(draftProblem({ name: "Confidential", colour: "rose", rank: 3, rules: [] }, [CONFIDENTIAL], "l-c")).toBe("")
    expect(draftBody({ name: "  Board   only ", colour: "sky", rank: 4, rules: ["no_export", "no_export"] })).toEqual({ name: "Board only", colour: "sky", rank: 4, rules: ["no_export"] })
  })

  it("calls the members' and the admins' routes, each saying its own failures (no shared error toast)", async () => {
    const { http, calls } = fakeHttp({ data: { labels: [CONFIDENTIAL], rules: RULES } })
    expect(await loadLabels(http)).toEqual({ labels: [CONFIDENTIAL], rules: RULES })
    await defineLabel(http, { name: " Internal ", colour: "amber", rank: 1, rules: ["no_guest_links"] })
    await changeLabel(http, "l-c", { name: "Confidential", colour: "red", rank: 3, rules: [] })
    await removeLabel(http, "l-c")
    await putItemLabel(http, "board", "b-1", "l-c")
    await putItemLabel(http, "doc", "d-1", null)
    expect(calls).toEqual([
      { method: "get", url: "/labels", body: undefined, quiet: true },
      { method: "post", url: "/admin/labels", body: { name: "Internal", colour: "amber", rank: 1, rules: ["no_guest_links"] }, quiet: true },
      { method: "patch", url: "/admin/labels/l-c", body: { name: "Confidential", colour: "red", rank: 3, rules: [] }, quiet: true },
      { method: "post", url: "/admin/labels/l-c/remove", body: undefined, quiet: true },
      { method: "put", url: "/labels/items/board/b-1", body: { label_id: "l-c" }, quiet: true },
      { method: "put", url: "/labels/items/doc/d-1", body: { label_id: null }, quiet: true },
    ])
  })

  it("takes only a label for a label: none, or an answer of another shape (an empty object), is no label", () => {
    expect(asLabel(CONFIDENTIAL)).toEqual(CONFIDENTIAL)
    expect(asLabel({ id: "l-x", name: "Bare" })).toEqual({ id: "l-x", name: "Bare", colour: "", rank: 0, rules: [] })
    for (const v of [null, undefined, {}, { id: "" , name: "x" }, { id: "l", name: 3 }, "Confidential", []]) expect(asLabel(v)).toBeNull()
  })

  it("reads an empty answer as no labels, and a taken-off label as none", async () => {
    expect(await loadLabels(fakeHttp({}).http)).toEqual({ labels: [], rules: [] })
    expect(await putItemLabel(fakeHttp({ msg: "ok", data: null }).http, "doc", "d-1", null)).toBeNull()
  })
})
