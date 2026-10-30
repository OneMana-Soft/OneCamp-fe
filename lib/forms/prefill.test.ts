import { describe, expect, it } from "vitest"
import { pagesOf, shownAnswers } from "@/lib/forms/branch"
import { formProblem, redirectable } from "@/lib/forms/build"
import type { FormField, ProjectForm } from "@/lib/forms/forms"
import { linkHides, prefilled } from "@/lib/forms/prefill"

// Tables B5b (airtable-07): a form's link answers its questions ahead (prefill_), a hidden question is
// never drawn, and a sent form may go to a page of the team's.
const fields: FormField[] = [
  { id: "name", label: "Your name", type: "short_text", required: true },
  { id: "tier", label: "Tier", type: "select", required: false, options: ["Gold", "Silver"] },
  { id: "svc", label: "Services", type: "multi_select", required: false, options: ["Print", "Video", "Web"] },
  { id: "ok", label: "Signed", type: "checkbox", required: false },
  { id: "src", label: "Source", type: "short_text", required: false, hidden: true },
  { id: "more", label: "More", type: "section", required: false },
  { id: "doc", label: "Brief", type: "file", required: false },
  { id: "notes", label: "Notes", type: "long_text", required: false },
]

describe("a form link's prefill_ answers", () => {
  it("fills questions by id or label, each as its kind takes it, and leaves out what it can't take", () => {
    expect(prefilled(fields, "?prefill_name=Asha&prefill_TIER=gold&prefill_Services=web, print,Nope&prefill_ok=yes&prefill_src=newsletter&other=x")).toEqual({
      name: "Asha",
      tier: "Gold",
      svc: ["Web", "Print"],
      ok: true,
      src: "newsletter",
    })
    expect(prefilled(fields, "?prefill_tier=Bronze&prefill_ok=no&prefill_more=x&prefill_doc=x&prefill_svc=Nope&prefill_name=%20")).toEqual({})
    expect(prefilled(fields, "?prefill_your%20name=Ravi").name).toBe("Ravi")
    expect((prefilled(fields, `?prefill_name=${"a".repeat(400)}`).name as string).length).toBe(300)
  })
  it("never draws a hidden question, though it's answered", () => {
    const drawn = pagesOf(fields, { src: "newsletter" }).flatMap((p) => p.questions.map((q) => q.id))
    expect(drawn).not.toContain("src")
    expect(drawn).toContain("name")
  })
  it("keeps one page to send from when every question is hidden, so the link alone answers it", () => {
    const unseen: FormField[] = [
      { id: "src", label: "Source", type: "short_text", required: false, hidden: true },
      { id: "more", label: "More", type: "section", required: false },
      { id: "ref", label: "Referrer", type: "short_text", required: false, hidden: true },
    ]
    expect(pagesOf(unseen, { src: "newsletter" })).toEqual([{ questions: [] }])
  })
})

// Tables B5c (Airtable's hide_): a link hides a shown question for its visit, as it fills it.
describe("a form link's hide_", () => {
  it("leaves a question its managers didn't mark in sight, its prefill there to change (main, 28 Oct)", () => {
    const unmarked: FormField[] = [
      { id: "agree", label: "I agree", type: "checkbox", required: true },
      { id: "co", label: "Company", type: "short_text", required: false },
    ]
    const query = "?hide_agree=true&prefill_agree=yes&hide_co=true&prefill_co=Acme"
    const shown = linkHides(unmarked, query, prefilled(unmarked, query))
    expect(shown.filter((f) => f.hidden)).toEqual([])
    expect(pagesOf(shown, prefilled(unmarked, query)).flatMap((p) => p.questions.map((q) => q.id))).toEqual(["agree", "co"])
  })
  // Its managers let a link hide these four.
  const marked = fields.map((f) => (["name", "tier", "svc", "ok"].includes(f.id) ? { ...f, link_hides: true } : f))
  const visit = (query: string) => linkHides(marked, query, prefilled(marked, query))
  const hidden = (fs: FormField[]) => fs.filter((f) => f.hidden).map((f) => f.id)
  it("hides the shown questions it names, by id or label in any case, with true, 1 or yes", () => {
    expect(hidden(visit("?hide_tier=true&hide_SERVICES=1&hide_signed=yes"))).toEqual(["tier", "svc", "ok", "src"])
    expect(hidden(visit("?hide_tier=false&hide_ok=no&hide_notes="))).toEqual(["src"])
    expect(visit("?prefill_tier=Gold")).toBe(marked)
  })
  it("hides a required question only with the link's answer to it, and never a section or a file question", () => {
    expect(hidden(visit("?hide_name=true"))).toEqual(["src"])
    expect(hidden(visit("?hide_name=true&prefill_name=%20"))).toEqual(["src"])
    expect(hidden(visit("?hide_your%20name=true&prefill_name=Asha"))).toEqual(["name", "src"])
    expect(hidden(visit("?hide_more=true&hide_doc=true"))).toEqual(["src"])
  })
  it("keeps a question in sight when the link's answer is one it can't take, so it can be put right", () => {
    // A link a CRM filled with a bad address: hidden, its answer would be dropped at Send and the
    // server's "needs an answer" would point at a question the visitor can't see (CODE-REVIEWER-72).
    const typed: FormField[] = [
      { id: "email", label: "Email", type: "email", required: true, link_hides: true },
      { id: "size", label: "Team size", type: "number", required: false, link_hides: true },
    ]
    const look = (query: string) => {
      const filled = prefilled(typed, query)
      return { filled, hidden: hidden(linkHides(typed, query, filled)) }
    }
    const bad = look("?hide_email=true&prefill_email=bob&hide_size=true&prefill_size=lots")
    expect(bad.hidden).toEqual([])
    expect(bad.filled).toMatchObject({ email: "bob", size: "lots" })
    expect(look("?hide_email=true&prefill_email=bob%40example.com&hide_size=1&prefill_size=12").hidden).toEqual(["email", "size"])
    // An optional question the link names but doesn't answer is hidden, as before.
    expect(look("?hide_size=true").hidden).toEqual(["size"])
  })
  it("never draws what it hides, and sends the link's answer to it", () => {
    const query = "?hide_name=true&prefill_name=Asha&hide_tier=1&prefill_tier=silver"
    const shown = visit(query)
    const drawn = pagesOf(shown, prefilled(fields, query)).flatMap((p) => p.questions.map((q) => q.id))
    expect(drawn).not.toContain("name")
    expect(drawn).not.toContain("tier")
    expect(drawn).toContain("notes")
    expect(shownAnswers(shown, prefilled(fields, query))).toEqual({ name: "Asha", tier: "Silver" })
    expect(fields.find((f) => f.id === "name")?.hidden).toBeUndefined()
  })
})

describe("a form's hidden questions and its page after sending, as the server checks them", () => {
  const form = (over: Partial<ProjectForm>): ProjectForm => ({ title: "Sign-up", description: "", fields: [fields[0]], title_field: "name", priority: "medium", active: true, ...over })
  it("refuses a hidden required question, and a redirect that isn't a web address", () => {
    expect(formProblem(form({ fields: [fields[0], { ...fields[4], required: true }] }))?.message).toMatch(/is hidden, so only its link fills it/)
    expect(formProblem(form({ redirect: "https://example.com/thanks" }))).toBeNull()
    for (const bad of ["javascript:alert(1)", "/thanks", "https://me:pw@example.com/", `https://example.com/${"a".repeat(500)}`]) {
      expect(redirectable(bad), bad).toBe(false)
      expect(formProblem(form({ redirect: bad }))?.message).toMatch(/full web address/)
    }
  })
})
