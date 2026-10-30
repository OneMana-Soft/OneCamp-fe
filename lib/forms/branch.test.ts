import { describe, expect, it } from "vitest"
import { holds, kept, pagesOf, shown, shownAnswers, type Answers } from "./branch"
import { checkAnswers } from "./answers"
import type { FormField, ShowIf } from "./forms"

// The twin of business/Form's branch.go: the same form and the same answers
// as branch_test.go, so the page asks what the server requires and sends
// nothing it would drop.

/** branch_test.go's branching(): a bug asks for steps, an idea opens a page of its own, and a link is asked only of the web. */
function branching(): FormField[] {
  return [
    { id: "what", label: "What do you need?", type: "short_text", required: true },
    { id: "kind", label: "Kind", type: "select", required: true, options: ["Bug", "Idea"] },
    { id: "steps", label: "Steps to reproduce", type: "long_text", required: true, show_if: { question: "kind", op: "is", values: ["Bug"] } },
    { id: "s2", label: "The idea", type: "section", required: false, show_if: { question: "kind", op: "is", values: ["Idea"] } },
    { id: "why", label: "Why it matters", type: "long_text", required: true },
    { id: "s3", label: "Anything else", type: "section", required: false },
    { id: "areas", label: "Areas", type: "multi_select", required: false, options: ["Web", "Phone", "API"] },
    { id: "site", label: "Where it happens", type: "url", required: false, show_if: { question: "areas", op: "any_of", values: ["Web"] } },
    { id: "phone", label: "Phone", type: "phone", required: false },
  ]
}

/** What the server keeps of these answers, by question (branch_test.go's answered()). */
function answered(fields: FormField[], raw: Answers) {
  const res = checkAnswers(fields, raw)
  expect(res.problem, JSON.stringify(raw)).toBeNull()
  return Object.fromEntries(res.kept.map((a) => [a.id, a]))
}

describe("a branch asks only what its answers open (TestABranchAsksOnlyWhatItsAnswersOpen)", () => {
  const f = branching()

  it("requires a bug's steps", () => {
    expect(checkAnswers(f, { what: "Crash", kind: "Bug" }).problem).toEqual({ id: "steps", message: "“Steps to reproduce” needs an answer.", required: true })
  })

  it("keeps a bug's steps and drops an answer to a page the visitor never saw", () => {
    const bug = answered(f, { what: "Crash", kind: "Bug", steps: "Open it", why: "sneaked in" })
    expect(bug.steps.value).toBe("Open it")
    expect(bug.why).toBeUndefined()
  })

  it("requires the idea page's answer, and drops the steps an idea never asked for", () => {
    expect(checkAnswers(f, { what: "Dark mode", kind: "Idea" }).problem?.id).toBe("why")
    const idea = answered(f, { what: "Dark mode", kind: "Idea", why: "Night shifts", steps: "sneaked in" })
    expect(idea.steps).toBeUndefined()
    expect(idea.why.value).toBe("Night shifts")
  })

  it("reads several choices as the server does, and asks for a link only when the web is among them", () => {
    const web = answered(f, { what: "x", kind: "Bug", steps: "y", areas: ["Web", "API"], site: "https://example.com/app" })
    expect(web.areas.value).toBe("Web, API")
    expect(web.areas.values).toEqual(["Web", "API"])
    expect(web.site.value).toBe("https://example.com/app")
    const phone = answered(f, { what: "x", kind: "Bug", steps: "y", areas: ["Phone"], site: "https://example.com" })
    expect(phone.site).toBeUndefined()
  })
})

describe("holds, as branch.go's", () => {
  const got = new Map([
    ["kind", { value: "Bug" }],
    ["areas", { value: "Web, API", values: ["Web", "API"] }],
    ["ok", { value: "No" }],
  ])
  const c = (question: string, op: ShowIf["op"], values?: string[]): ShowIf => ({ question, op, values })

  it("reads is, isn't, any of and answered", () => {
    expect(holds(undefined, got)).toBe(true)
    expect(holds(c("kind", "is", ["Bug"]), got)).toBe(true)
    expect(holds(c("kind", "is", ["Idea"]), got)).toBe(false)
    expect(holds(c("kind", "is_not", ["Idea"]), got)).toBe(true)
    expect(holds(c("kind", "any_of", ["Idea", "Bug"]), got)).toBe(true)
    expect(holds(c("kind", "answered"), got)).toBe(true)
    // "is" and "isn't" read one choice only.
    expect(holds(c("kind", "is", ["Bug", "Idea"]), got)).toBe(false)
  })

  it("reads a multi-select by its choices, never its words", () => {
    expect(holds(c("areas", "is", ["API"]), got)).toBe(true)
    expect(holds(c("areas", "is", ["Web, API"]), got)).toBe(false)
    expect(holds(c("areas", "is_not", ["Phone"]), got)).toBe(true)
  })

  it("takes a question not shown or left blank as unanswered: isn't holds, is never does", () => {
    expect(holds(c("gone", "answered"), got)).toBe(false)
    expect(holds(c("gone", "is", ["Bug"]), got)).toBe(false)
    expect(holds(c("gone", "is_not", ["Bug"]), got)).toBe(true)
    expect(holds(c("gone", "any_of", ["Bug"]), got)).toBe(false)
  })

  it("reads a shown checkbox as answered, Yes or No", () => {
    expect(holds(c("ok", "is", ["No"]), got)).toBe(true)
    expect(holds(c("ok", "answered"), got)).toBe(true)
  })

  it("reads no condition it doesn't know", () => {
    expect(holds({ question: "kind", op: "near" as ShowIf["op"], values: ["Bug"] }, got)).toBe(false)
  })
})

describe("what an answer is kept as", () => {
  const q = (type: FormField["type"], options?: string[]): FormField => ({ id: "a", label: "A", type, required: false, options })
  it("trims words, drops blanks, and keeps a shown checkbox as Yes or No", () => {
    expect(kept(q("short_text"), "  hi ")).toEqual({ value: "hi" })
    expect(kept(q("short_text"), "   ")).toBeNull()
    expect(kept(q("checkbox"), true)).toEqual({ value: "Yes" })
    expect(kept(q("checkbox"), undefined)).toEqual({ value: "No" })
  })
  it("keeps several choices once each, in the order picked", () => {
    expect(kept(q("multi_select", ["Web", "API"]), ["Web", "Web", "API"])).toEqual({ value: "Web, API", values: ["Web", "API"] })
    expect(kept(q("multi_select", ["Web"]), [])).toBeNull()
  })
})

describe("the pages a visitor walks", () => {
  const f = branching()

  it("are the questions before the first section, then each section shown with its questions", () => {
    const bug = pagesOf(f, { kind: "Bug" })
    expect(bug.map((p) => [p.section?.id ?? "", p.questions.map((q) => q.id)])).toEqual([
      ["", ["what", "kind", "steps"]],
      ["s3", ["areas", "phone"]],
    ])
  })

  it("open a hidden section's page when its answer comes, and close the questions it doesn't ask", () => {
    const idea = pagesOf(f, { kind: "Idea" })
    expect(idea.map((p) => p.section?.id ?? "")).toEqual(["", "s2", "s3"])
    expect(idea[0].questions.map((q) => q.id)).toEqual(["what", "kind"])
    expect(pagesOf(f, { kind: "Idea", areas: ["Web"] })[2].questions.map((q) => q.id)).toEqual(["areas", "site", "phone"])
  })

  it("leave out a page with nothing to ask, as a form that starts with a section has none before it", () => {
    const f2: FormField[] = [
      { id: "s1", label: "About you", type: "section", required: false },
      { id: "name", label: "Name", type: "short_text", required: true },
      { id: "s2", label: "Extra", type: "section", required: false },
      { id: "x", label: "Only for a yes", type: "short_text", required: false, show_if: { question: "name", op: "is", values: ["yes"] } },
    ]
    expect(pagesOf(f2, {}).map((p) => p.section?.id)).toEqual(["s1"])
    expect(shown(f2, {}).items.map((i) => i.id)).toEqual(["s1", "name", "s2"])
  })

  it("send only the answers of questions the visitor was shown", () => {
    expect(shownAnswers(f, { what: "x", kind: "Bug", steps: "y", why: "hidden", site: "https://a.example" })).toEqual({ what: "x", kind: "Bug", steps: "y" })
    expect(shownAnswers(f, { what: "x", kind: "Idea", why: "Night", areas: ["Web"], site: "https://a.example" })).toEqual({
      what: "x", kind: "Idea", why: "Night", areas: ["Web"], site: "https://a.example",
    })
  })
})
