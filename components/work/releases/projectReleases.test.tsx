import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReleaseHttp, ReleaseListing, Release } from "@/lib/work/releases"
import type { Burndown } from "@/lib/tasks/cycleBurndown"
import { pinTestClock } from "@/lib/testing/testClock"

// The Releases tab (P10-1b web; jira-04, linear-36): its states, and the
// permission model (members read; the project's admins change, as the
// server's can_edit says), the soft delete with Undo and the AI's draft.

pinTestClock()

const phone = vi.hoisted(() => ({ on: false }))
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => phone.on }))
const undo = vi.hoisted(() => ({ showUndo: vi.fn() }))
vi.mock("@/components/ui/undoToast", () => undo)
// A day as a plain field, as askApprovalSheet.test draws it: the picker's own tests are components/ui's.
vi.mock("@/components/ui/date-field", () => ({
  DateField: (p: { id?: string; value: string; onChange: (v: string) => void }) => <input id={p.id} value={p.value} onChange={(e) => p.onChange(e.target.value)} />,
}))

const { default: ProjectReleases } = await import("@/components/work/releases/ProjectReleases")

const P = "p1"
const release = (over: Partial<Release> = {}): Release => ({
  id: "r1",
  project_id: P,
  name: "v2.4",
  state: "planned",
  target_date: "2099-11-20",
  released_at: null,
  repo: "acme/web",
  tag: "v2.4.0",
  notes: "",
  progress: { total: 8, started: 2, done: 3 },
  stages: [
    { provider: "github", repo: "acme/web", kind: "build", name: "CI", status: "success", sha: "abc1234def", url: "https://github.com/acme/web/actions/runs/1", reported_at: "2026-11-06T10:00:00Z" },
    { provider: "github", repo: "acme/web", kind: "deploy", name: "production", status: "in_progress", sha: "abc1234def", url: "", reported_at: "2026-11-06T10:05:00Z" },
  ],
  can_edit: true,
  ...over,
})

/**
 * A server for one project: GETs answer from `listing` (a function is a refusal or a wait) and `one`,
 * POSTs are kept in `posted`. `more` is the page after cursor c2; `refuse` a POST path the server
 * refuses with its words (`words`, or a name taken); the project's tasks can't be read while `tasksDown.on`.
 */
function server(
  listing: ReleaseListing | (() => Promise<never>),
  one: Release = release(),
  { more, refuse, words, tasksDown, burndown }: { more?: ReleaseListing; refuse?: string; words?: string; tasksDown?: { on: boolean }; burndown?: () => Promise<Burndown> } = {},
) {
  const posted: { path: string; body: object }[] = []
  const http = {
    get: vi.fn(async (path: string) => {
      if (path === `/project/${P}/releases`) return { data: { data: typeof listing === "function" ? await listing() : listing } }
      if (path === `/project/${P}/releases/${one.id}`) return { data: { data: { ...one, tasks: one.tasks ?? [{ task_uuid: "t1", task_key: "WEB-7", task_name: "Ship the pricing page", task_status: "done", source: "manual", added_at: "2026-11-01T00:00:00Z" }] } } }
      if (path === `/project/${P}/releases?cursor=c2` && more) return { data: { data: more } }
      if (path.startsWith(`/project/${P}/releases/${one.id}/burndown?tz=`) && burndown) return { data: { data: { release: one, burndown: await burndown() } } }
      if (path === `/project/${P}/timeline` && tasksDown?.on) throw new Error("Network Error")
      if (path === `/project/${P}/timeline`) return { data: { data: { tasks: [{ task_uuid: "t2", task_name: "Fix the signup email", task_status: "todo" }], total: 1, can_edit: true } } }
      throw new Error(`not stubbed: ${path}`)
    }),
    post: vi.fn(async (path: string, body: object) => {
      posted.push({ path, body })
      if (path === refuse) throw { response: { status: 409, data: { msg: words ?? "A release by that name is in this project already." } } }
      if (path === `/project/${P}/releases`) return { data: { data: one } }
      if (path.endsWith("/notes/draft")) return { data: { data: { notes: "Pricing page, shipped." } } }
      if (path.endsWith("/tasks")) return { data: { data: { added: ["t2"], already: [], refused: [] } } }
      return { data: { msg: "ok" } }
    }),
  }
  return { http: http as unknown as ReleaseHttp, posted, get: http.get }
}

// The page's shared error state: for the releases, or for a part of them (`part`) where it is drawn small.
const failed = vi.fn((retry: () => void, part?: string) => (
  <div>
    {part && <p>{`Couldn't load ${part}`}</p>}
    <button type="button" onClick={retry}>
      Try again
    </button>
  </div>
))
const empty = ({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) => (
  <div data-testid="empty">
    <h2>{title}</h2>
    <p>{description}</p>
    {action}
  </div>
)
const draw = (http: ReleaseHttp, ai = true) => render(<ProjectReleases projectId={P} http={http} ai={ai} failed={failed} empty={empty} />)
const listing = (releases: Release[], can_edit = true): ReleaseListing => ({ releases, can_edit, next_cursor: "" })

afterEach(() => {
  cleanup()
  phone.on = false
  undo.showUndo.mockReset()
})

describe("the releases list", () => {
  it("holds its place while it reads", () => {
    const { http } = server(() => new Promise<never>(() => {}))
    draw(http)
    expect(screen.getByRole("status", { name: "Loading the releases" })).toBeTruthy()
  })

  it("says a read it couldn't make, with Try again, which reads again", async () => {
    let fail = true
    const { http, get } = server(() => (fail ? Promise.reject(new Error("Network Error")) : Promise.resolve(listing([]) as never)))
    draw(http)
    const retry = await screen.findByRole("button", { name: "Try again" })
    fail = false
    fireEvent.click(retry)
    expect(await screen.findByText("No releases yet")).toBeTruthy()
    expect(get.mock.calls.filter(([p]) => p === `/project/${P}/releases`).length).toBeGreaterThanOrEqual(2)
  })

  it("is empty with what a release is, and New release for an admin only", async () => {
    draw(server(listing([], true)).http)
    expect(await screen.findByText("No releases yet")).toBeTruthy()
    expect(screen.getByRole("button", { name: "New release" })).toBeTruthy()
    cleanup()
    draw(server(listing([], false)).http)
    expect(await screen.findByText("No releases yet")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "New release" })).toBeNull()
  })

  it("says how many of a planned release's tasks are unfinished (jira-04)", async () => {
    draw(server(listing([release({ unfinished: 5 }), release({ id: "r2", name: "v2.3", tag: "v2.3.0", state: "released", unfinished: 1 })])).http)
    const row = await screen.findByRole("button", { name: /v2\.4/ })
    expect(within(row).getByText("5 unfinished")).toBeTruthy()
    expect(within(screen.getByRole("button", { name: /v2\.3/ })).queryByText(/unfinished/)).toBeNull()
  })

  it("shows each release's name, state, target day, tasks done and its builds' and deploys' last word", async () => {
    draw(server(listing([release(), release({ id: "r0", name: "v2.3", tag: "v2.3.0", state: "released", released_at: "2026-10-30T09:00:00Z", target_date: null, stages: [], progress: { total: 4, started: 0, done: 4 } })])).http)
    const row = await screen.findByRole("button", { name: /v2\.4/ })
    expect(within(row).getByText("Planned")).toBeTruthy()
    expect(within(row).getByText(/^Due /)).toBeTruthy()
    expect(within(row).getAllByText("3 of 8 done").length).toBeGreaterThan(0)
    expect(within(row).getByText("CI passed")).toBeTruthy()
    expect(within(row).getByText("Production deploying")).toBeTruthy()
    const shipped = screen.getByRole("button", { name: /v2\.3/ })
    expect(within(shipped).getByText("Released")).toBeTruthy()
  })
})

describe("a release, opened", () => {
  it("offers a member no change: no edit, add, remove, draft, ship or delete", async () => {
    const one = release({ can_edit: false, notes: "Pricing page." })
    draw(server(listing([one], false), one).http)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    const sheet = await screen.findByRole("dialog")
    expect(await within(sheet).findByText("Ship the pricing page")).toBeTruthy()
    expect(within(sheet).getByText("Pricing page.")).toBeTruthy()
    for (const name of ["Delete", "Mark released", "Save", "Add tasks", "Draft notes"]) expect(within(sheet).queryByRole("button", { name })).toBeNull()
    expect(within(sheet).queryByRole("button", { name: /^Take / })).toBeNull()
    expect(within(sheet).queryByRole("textbox")).toBeNull()
    expect(within(sheet).getByRole("link", { name: /Open the run/ }).getAttribute("href")).toBe("https://github.com/acme/web/actions/runs/1")
  })

  it("deletes softly through /delete, and its Undo brings it back through /restore/release/{id}", async () => {
    const s = server(listing([release()]))
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    const sheet = await screen.findByRole("dialog")
    fireEvent.click(await within(sheet).findByRole("button", { name: "Delete" }))
    await waitFor(() => expect(undo.showUndo).toHaveBeenCalled())
    expect(s.posted.map((p) => p.path)).toContain(`/project/${P}/releases/r1/delete`)
    const [title, again] = undo.showUndo.mock.calls[0] as [string, () => Promise<unknown>]
    expect(title).toBe("Deleted “v2.4”")
    await again()
    expect(s.posted.map((p) => p.path)).toContain("/restore/release/r1")
  })

  it("marks a planned release released through /ship, in a drawer that says every task in it is done", async () => {
    const s = server(listing([release()]))
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    fireEvent.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: "Mark released" }))
    const ship = await screen.findByRole("dialog", { name: "Mark v2.4 released" })
    expect(within(ship).getByText("Every task in it is done.")).toBeTruthy()
    expect(within(ship).queryByRole("radio")).toBeNull()
    expect(s.posted.map((p) => p.path)).not.toContain(`/project/${P}/releases/r1/ship`)
    fireEvent.click(within(ship).getByRole("button", { name: "Mark released" }))
    await waitFor(() => expect(s.posted).toContainEqual({ path: `/project/${P}/releases/r1/ship`, body: {} }))
  })

  it("drafts notes with the AI for an admin, into the notes, saved only with Save", async () => {
    const s = server(listing([release()]))
    draw(s.http, true)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    const sheet = await screen.findByRole("dialog")
    fireEvent.click(await within(sheet).findByRole("button", { name: "Draft notes" }))
    await waitFor(() => expect((within(sheet).getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Pricing page, shipped."))
    expect(s.posted.map((p) => p.path)).not.toContain(`/project/${P}/releases/r1/edit`)
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(s.posted).toContainEqual({ path: `/project/${P}/releases/r1/edit`, body: { notes: "Pricing page, shipped." } }))
  })

  it("offers no draft where the AI is off, nor to a member where it is on", async () => {
    draw(server(listing([release()])).http, false)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    let sheet = await screen.findByRole("dialog")
    expect(await within(sheet).findByLabelText("Notes")).toBeTruthy()
    expect(within(sheet).queryByRole("button", { name: "Draft notes" })).toBeNull()
    cleanup()
    const one = release({ can_edit: false })
    draw(server(listing([one], false), one).http, true)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    sheet = await screen.findByRole("dialog")
    expect(await within(sheet).findByText("Ship the pricing page")).toBeTruthy()
    expect(within(sheet).queryByRole("button", { name: "Draft notes" })).toBeNull()
  })

  it("takes a task out through its own route", async () => {
    const s = server(listing([release()]))
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    fireEvent.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: "Take “Ship the pricing page” out" }))
    await waitFor(() => expect(s.posted.map((p) => p.path)).toContain(`/project/${P}/releases/r1/tasks/t1/remove`))
  })

  it("says in Add tasks that the project's tasks couldn't be read, with Try again, which reads them again", async () => {
    const one = release({ id: "r-tasks", name: "v7.0", tag: "v7.0.0" })
    const down = { on: true }
    const s = server(listing([one]), one, { tasksDown: down })
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: /v7\.0/ }))
    fireEvent.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: "Add tasks" }))
    expect(await screen.findByText("Couldn't load this project's tasks")).toBeTruthy()
    expect(screen.queryByText("Loading…")).toBeNull()
    down.on = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    fireEvent.click(await screen.findByRole("option", { name: /Fix the signup email/ }))
    await waitFor(() => expect(s.posted).toContainEqual({ path: `/project/${P}/releases/r-tasks/tasks`, body: { task_uuids: ["t2"] } }))
    expect(s.get.mock.calls.filter(([p]) => p === `/project/${P}/timeline`).length).toBeGreaterThanOrEqual(2)
  })

  it("is the shared drawer on a phone, its actions in the footer", async () => {
    phone.on = true
    draw(server(listing([release()])).http)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    expect(await screen.findByRole("button", { name: "Mark released" })).toBeTruthy()
    expect(document.querySelector("[data-release-panel]")).toBeNull()
    expect(document.querySelector("[data-release-sheet]")).toBeTruthy()
  })
})

// Mark released (jira-04 part 4): a drawer that lists the release's unfinished tasks and asks what becomes of them:
// kept in it (no body, as before), moved to another of the project's planned releases (move_to its id), or taken out
// of any (move_to "none"). A refusal is said in the drawer in the server's words and nothing changes. Each test has a
// release of its own (the tab keeps what it read by path for the page's life).
describe("marking a release released", () => {
  const task = (id: string, task_name: string, task_status: string) => ({ task_uuid: id, task_key: `WEB-${id}`, task_name, task_status, source: "manual" as const, added_at: "2026-11-01T00:00:00Z" })
  const shipping = (id: string, name: string, opts: Parameters<typeof server>[2] = {}) => {
    const one = release({ id, name, tag: `${name}.9`, unfinished: 2, tasks: [task(`${id}d`, "Ship the pricing page", "done"), task(`${id}a`, "Write the changelog", "todo"), task(`${id}b`, "Fix the signup email", "in_progress"), task(`${id}c`, "Drop the old banner", "canceled")] })
    const next = release({ id: `${id}-next`, name: `${name}-next`, tag: `${name}-next.9` })
    const out = release({ id: `${id}-out`, name: `${name}-out`, tag: `${name}-out.9`, state: "released", released_at: "2026-11-01T00:00:00Z" })
    const s = server(listing([one, next, out]), one, opts)
    return { s, ship: `/project/${P}/releases/${id}/ship`, next }
  }
  const openShip = async (name: string) => {
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`${name.replace(".", "\\.")}(?!-)`) }))
    fireEvent.click(await screen.findByRole("button", { name: "Mark released" }))
    return screen.findByRole("dialog", { name: `Mark ${name} released` })
  }

  it("lists its unfinished tasks and asks what becomes of them; Keep, the first choice, sends no move", async () => {
    const { s, ship } = shipping("rk", "v5.0")
    draw(s.http)
    const d = await openShip("v5.0")
    expect(within(d).getByText(/^2 tasks aren't done\. Keep them in it, move them to another release, or take them out\?$/)).toBeTruthy()
    expect(within(d).getByText("Write the changelog")).toBeTruthy()
    expect(within(d).getByText("Fix the signup email")).toBeTruthy()
    for (const done of ["Ship the pricing page", "Drop the old banner"]) expect(within(d).queryByText(done)).toBeNull()
    // Only the project's other planned releases are offered: not this one, not one that's out.
    expect(within(d).getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual(["Keep them in v5.0", "Move them to v5.0-next", "Take them out of v5.0"])
    expect((within(d).getByRole("radio", { name: "Keep them in v5.0" }) as HTMLElement).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(d).getByRole("button", { name: "Mark released" }))
    await waitFor(() => expect(s.posted).toContainEqual({ path: ship, body: {} }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mark v5.0 released" })).toBeNull())
  })

  it("moves them to another planned release by its id", async () => {
    const { s, ship, next } = shipping("rm", "v6.0")
    draw(s.http)
    const d = await openShip("v6.0")
    fireEvent.click(within(d).getByRole("radio", { name: "Move them to v6.0-next" }))
    fireEvent.click(within(d).getByRole("button", { name: "Mark released" }))
    await waitFor(() => expect(s.posted).toContainEqual({ path: ship, body: { move_to: next.id } }))
  })

  it("takes them out of any release with \"none\"", async () => {
    const { s, ship } = shipping("rn", "v7.0")
    draw(s.http)
    const d = await openShip("v7.0")
    fireEvent.click(within(d).getByRole("radio", { name: "Take them out of v7.0" }))
    fireEvent.click(within(d).getByRole("button", { name: "Mark released" }))
    await waitFor(() => expect(s.posted).toContainEqual({ path: ship, body: { move_to: "none" } }))
  })

  it("sends nothing on Cancel", async () => {
    const { s } = shipping("rc", "v7.5")
    draw(s.http)
    const d = await openShip("v7.5")
    fireEvent.click(within(d).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mark v7.5 released" })).toBeNull())
    expect(s.posted).toEqual([])
  })

  it("says a refusal in the drawer in the server's words, and changes nothing", async () => {
    const words = "Only the project's admins mark a release released."
    const { s, ship } = shipping("rr", "v8.0", { refuse: `/project/${P}/releases/rr/ship`, words })
    draw(s.http)
    const d = await openShip("v8.0")
    fireEvent.click(within(d).getByRole("button", { name: "Mark released" }))
    expect((await within(d).findByRole("alert")).textContent).toBe(words)
    expect(s.posted.map((p) => p.path)).toEqual([ship])
    expect(screen.getByRole("dialog", { name: "Mark v8.0 released" })).toBeTruthy()
    expect(within(d).getByRole("button", { name: "Mark released" }).hasAttribute("disabled")).toBe(false)
  })

  it("is the shared drawer on a phone, its actions pinned in its footer and the tasks above", async () => {
    phone.on = true
    const { s } = shipping("rp", "v9.0")
    draw(s.http)
    const d = await openShip("v9.0")
    for (const name of ["Mark released", "Cancel"]) expect(within(d).getByRole("button", { name }).closest("[data-overlay-footer]")).toBeTruthy()
    expect(within(d).getByText("Write the changelog").closest("[data-overlay-footer]")).toBeNull()
  })
})

// The writes: making a release, renaming it, moving or taking away its day,
// a write the server refuses, and the next page of the list. Each release
// here has an id and a name of its own: the tab keeps what it read by path
// for the page's life, so a row from an earlier test is never the one clicked
// (nor its tag: release()'s v2.4.0 would answer an earlier test's /v2\.4/).
describe("a release, made and changed", () => {
  const open = async (s: ReturnType<typeof server>, name: RegExp) => {
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name }))
    const sheet = await screen.findByRole("dialog")
    await within(sheet).findByLabelText("Name")
    return sheet
  }
  const edits = (s: ReturnType<typeof server>, id: string) => s.posted.filter((p) => p.path === `/project/${P}/releases/${id}/edit`).map((p) => p.body)

  it("is made through POST with its name, its day or null without one, and opens on the new id", async () => {
    const made = release({ id: "r-made", name: "Spring launch", tag: "Spring launch.0", target_date: null })
    let s = server(listing([release({ id: "r-old", name: "v1.0", tag: "v1.0.0" })]), made)
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: "New release" }))
    let form = await screen.findByRole("dialog")
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: " Spring launch " } })
    fireEvent.click(within(form).getByRole("button", { name: "Make release" }))
    await waitFor(() => expect(s.posted).toEqual([{ path: `/project/${P}/releases`, body: { name: "Spring launch", target_date: null, notes: "" } }]))
    expect(await screen.findByRole("dialog", { name: /Spring launch/ })).toBeTruthy()
    expect(s.get).toHaveBeenCalledWith(`/project/${P}/releases/r-made`, expect.anything())
    cleanup()
    s = server(listing([release({ id: "r-old", name: "v1.0", tag: "v1.0.0" })]), made)
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: "New release" }))
    form = await screen.findByRole("dialog")
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Spring launch" } })
    fireEvent.change(within(form).getByLabelText("Target date"), { target: { value: "2099-12-01" } })
    fireEvent.click(within(form).getByRole("button", { name: "Make release" }))
    await waitFor(() => expect(s.posted).toEqual([{ path: `/project/${P}/releases`, body: { name: "Spring launch", target_date: "2099-12-01", notes: "" } }]))
  })

  it("is renamed, then its day moved, through /edit, each with only what changed", async () => {
    const one = release({ id: "r-edit", name: "v3.0", tag: "v3.0.0" })
    const s = server(listing([one]), one)
    const sheet = await open(s, /v3\.0/)
    fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: " v3.1 " } })
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(edits(s, "r-edit")).toEqual([{ name: "v3.1" }]))
    await waitFor(() => expect(within(sheet).queryByRole("button", { name: "Save" })).toBeNull())
    fireEvent.change(within(sheet).getByLabelText("Target date"), { target: { value: "2099-12-24" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(edits(s, "r-edit")).toEqual([{ name: "v3.1" }, { target_date: "2099-12-24" }]))
  })

  it("has its day taken away with an empty day, and nothing to save for a day picked and taken away again", async () => {
    const dated = release({ id: "r-dated", name: "v4.0", tag: "v4.0.0" })
    let s = server(listing([dated]), dated)
    let sheet = await open(s, /v4\.0/)
    fireEvent.change(within(sheet).getByLabelText("Target date"), { target: { value: "" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(edits(s, "r-dated")).toEqual([{ target_date: "" }]))
    cleanup()
    const undated = release({ id: "r-undated", name: "v5.0", tag: "v5.0.0", target_date: null })
    s = server(listing([undated]), undated)
    sheet = await open(s, /v5\.0/)
    const day = within(sheet).getByLabelText("Target date")
    fireEvent.change(day, { target: { value: "2099-12-01" } })
    expect(within(sheet).getByRole("button", { name: "Save" })).toBeTruthy()
    fireEvent.change(day, { target: { value: "" } })
    expect(within(sheet).queryByRole("button", { name: "Save" })).toBeNull()
  })

  it("says a write the server refused in place, the sheet or form still open with what was typed", async () => {
    const one = release({ id: "r-refused", name: "v6.0", tag: "v6.0.0" })
    let s = server(listing([one]), one, { refuse: `/project/${P}/releases/r-refused/edit` })
    const sheet = await open(s, /v6\.0/)
    fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "v2.4" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }))
    expect((await within(sheet).findByRole("alert")).textContent).toBe("A release by that name is in this project already.")
    expect(screen.getByRole("dialog")).toBe(sheet)
    expect((within(sheet).getByLabelText("Name") as HTMLInputElement).value).toBe("v2.4")
    expect(within(sheet).getByRole("button", { name: "Save" })).toBeTruthy()
    cleanup()
    s = server(listing([one]), one, { refuse: `/project/${P}/releases` })
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: "New release" }))
    const form = await screen.findByRole("dialog")
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "v6.0" } })
    fireEvent.click(within(form).getByRole("button", { name: "Make release" }))
    expect((await within(form).findByRole("alert")).textContent).toBe("A release by that name is in this project already.")
    expect((within(form).getByLabelText("Name") as HTMLInputElement).value).toBe("v6.0")
  })

  it("shows more: the next page by its cursor, below the first, and no Show more after the last", async () => {
    const first = { releases: [release({ id: "r-p1", name: "v9.0", tag: "v9.0.0" })], can_edit: true, next_cursor: "c2" }
    const s = server(first, release({ id: "r-p1", name: "v9.0", tag: "v9.0.0" }), { more: listing([release({ id: "r-p2", name: "v8.0", tag: "v8.0.0" })]) })
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: "Show more" }))
    expect(await screen.findByRole("button", { name: /v8\.0/ })).toBeTruthy()
    const rows = screen.getAllByRole("button", { name: /v[89]\.0/ }).map((b) => b.textContent)
    expect(rows[0]).toMatch(/v9\.0/)
    expect(rows[1]).toMatch(/v8\.0/)
    expect(s.get).toHaveBeenCalledWith(`/project/${P}/releases?cursor=c2`, expect.anything())
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })
})

// jira-04 Head B: the sheet's Burndown view, drawn by the cycle burndown's own part.
describe("a release's burndown", () => {
  const days = Array.from({ length: 10 }, (_, i) => `2026-11-${String(1 + i).padStart(2, "0")}`)
  const burndown: Burndown = {
    days,
    scope: [3, 4, 4],
    remaining: [3, 3, 2],
    ideal: days.map((_, i) => Math.round((40 * (9 - i)) / 9) / 10),
    tasks: 4,
    done: 2,
    open: 2,
    estimated: 0,
    hours: 0,
  }
  const openBurndown = async (s: ReturnType<typeof server>) => {
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    fireEvent.click(await within(await screen.findByRole("dialog")).findByRole("radio", { name: "Burndown" }))
  }

  // First: the burndown's own chunk isn't in until the first open, and it holds its place while it lands.
  it("holds its place, named, while its part loads", async () => {
    const s = server(listing([release()]), release(), { burndown: () => new Promise<never>(() => {}) })
    draw(s.http)
    fireEvent.click(await screen.findByRole("button", { name: /v2\.4/ }))
    fireEvent.click(await within(await screen.findByRole("dialog")).findByRole("radio", { name: "Burndown" }))
    // The part isn't drawn yet (it would read the burndown): this is the sheet's own fallback.
    expect(s.get.mock.calls.some(([p]) => /\/burndown\?/.test(p))).toBe(false)
    expect(screen.getByRole("status", { name: "Loading the burndown" })).toBeTruthy()
  })

  // Then: what a read gets stays kept for its path while the page lives, and a failed read keeps it.
  it("offers Try again when it can't be read, which reads it again", async () => {
    let down = true
    const s = server(listing([release()]), release(), { burndown: async () => (down ? Promise.reject({ response: { status: 503 } }) : burndown) })
    await openBurndown(s)
    expect(await screen.findByText("Couldn't load the burndown")).toBeTruthy()
    down = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText(/^On pace: 2 tasks left/)).toBeTruthy()
  })

  it("shows the work going down against an even pace to its target day, for a member too", async () => {
    const s = server(listing([release({ can_edit: false })]), release({ can_edit: false }), { burndown: async () => burndown })
    await openBurndown(s)
    expect(await screen.findByText(/^On pace: 2 tasks left/)).toBeTruthy()
    expect(screen.getByText("Ideal pace")).toBeTruthy()
    // The stat and the legend share the name.
    expect(screen.getAllByText("In the release")).toHaveLength(2)
    expect(s.get.mock.calls.some(([p]) => /\/releases\/r1\/burndown\?tz=\w/.test(p))).toBe(true)
  })

  it("draws no ideal line for a release with no target day", async () => {
    const s = server(listing([release({ target_date: null })]), release({ target_date: null }), { burndown: async () => ({ ...burndown, ideal: null }) })
    await openBurndown(s)
    expect(await screen.findByText("2 tasks left. With no target date, there's no pace to measure against.")).toBeTruthy()
    expect(screen.queryByText("Ideal pace")).toBeNull()
  })

  it("says in words what to do with a release that has no tasks", async () => {
    const s = server(listing([release()]), release(), { burndown: async () => ({ ...burndown, tasks: 0, done: 0, open: 0, scope: [0], remaining: [0] }) })
    await openBurndown(s)
    expect(await screen.findByText(/No tasks in this release yet\. Put tasks in it from their Release field/)).toBeTruthy()
  })

})
