import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ImportJob } from "@/services/importService"

let answers: unknown[] = []
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  planImportJob: vi.fn(async () => {
    const next = answers.shift()
    if (next instanceof Error || (next && typeof next === "object" && "response" in next)) throw next
    return next
  }),
  runImportJob: vi.fn(async () => {}),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { ImportPlanDialog } = await import("./ImportPlanDialog")

afterEach(() => {
  cleanup()
  answers = []
})

const job = { id: "j1", provider: "jira", source_workspace_name: "Acme", status: "failed" } as ImportJob

describe("planning an import", () => {
  // A failed plan used to leave the dialog spinning behind a toast.
  it("says why a plan failed, offers to reconnect a refused token, and can try again", async () => {
    answers = [
      { response: { status: 400, data: { code: "token_rejected", error: "Jira didn't accept that email and API token." } } },
      { user_count: 3, user_new: 0, user_merge: 0, team_count: 0, project_count: 1, task_count: 9, subtask_count: 0, comment_count: 0, file_count: 0, file_bytes: 0 },
    ]
    const onReconnect = vi.fn()
    render(<ImportPlanDialog job={job} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} onReconnect={onReconnect} />)
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Jira didn't accept that email and API token\./))
    expect((screen.getByRole("button", { name: "Start import" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }))
    expect(onReconnect).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByText("Tasks")).toBeTruthy())
    expect(screen.queryByRole("alert")).toBeNull()
  })

  // Run started it from another tab while it was planned: said, the import
  // loaded again, and no "Try again", which could only be refused.
  it("says so and loads the import again when it changed in the meantime", async () => {
    answers = [{ response: { status: 409, data: { code: "job_changed", error: "This import changed in the meantime." } } }]
    const onChanged = vi.fn()
    render(<ImportPlanDialog job={job} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} onReconnect={() => {}} onChanged={onChanged} />)
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/This import changed in the meantime\./))
    expect(onChanged).toHaveBeenCalledOnce()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull()
  })

  it("offers no reconnect for a problem reconnecting can't fix", async () => {
    answers = [{ response: { status: 409, data: { code: "active_job", error: "Another import of this workspace is waiting or running." } } }]
    render(<ImportPlanDialog job={job} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} onReconnect={() => {}} />)
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull()
  })
})

const planned = (over: Record<string, unknown> = {}) => ({
  user_count: 3, user_new: 0, user_merge: 0, team_count: 0, project_count: 1, task_count: 9, subtask_count: 0, comment_count: 0, file_count: 0, file_bytes: 0,
  ...over,
})

describe("the plan's mappings and warnings", () => {
  // The mapping selects showed OneCamp's raw keys ("inProgress", "inReview")
  // and had no names, so a screen reader heard "combo box" six times.
  it("names each status mapping and its choices as people read them", async () => {
    answers = [planned({ status_values: ["Open", "In Dev"] })]
    render(<ImportPlanDialog job={job} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    const select = await screen.findByRole("combobox", { name: "OneCamp status for In Dev" })
    // A touch target on a phone, a dense row from md up.
    expect(select.className).toContain("h-11")
    expect(select.className).toContain("md:h-8")
    fireEvent.keyDown(select, { key: "ArrowDown" })
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent)
    expect(labels).toContain("In progress")
    expect(labels).not.toContain("inProgress")
  })

  // I1b: a status with a name of the team's own ("Ready to ship") was
  // proposed as To do; the plan now proposes it by its class in the source.
  it("proposes each status as the plan does, by its class when its name is the team's own", async () => {
    answers = [planned({ status_values: ["Ready to ship", "Open"], status_proposals: { "ready to ship": "inProgress" } })]
    render(<ImportPlanDialog job={job} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    expect((await screen.findByRole("combobox", { name: "OneCamp status for Ready to ship" })).textContent).toBe("In progress")
    expect((await screen.findByRole("combobox", { name: "OneCamp status for Open" })).textContent).toBe("To do")
  })

  // Past the eighth, warnings were "… and 4 more", with no way to read them.
  it("shows every warning on request", async () => {
    answers = [planned({ warnings: Array.from({ length: 10 }, (_, i) => `Warning number ${i + 1}`) })]
    render(<ImportPlanDialog job={job} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    await screen.findByText("Warning number 8")
    expect(screen.queryByText("Warning number 10")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }))
    expect(screen.getByText("Warning number 10")).toBeTruthy()
  })

  // Docs programme C4: a Notion import with pages says how many docs it brings.
  it("counts the pages that come across as docs", async () => {
    answers = [planned({ page_count: 1204, task_count: 0, project_count: 0 })]
    render(<ImportPlanDialog job={{ ...job, provider: "notion" }} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    const label = await screen.findByText("Docs")
    expect(label.parentElement?.textContent).toContain("1,204")
    expect(screen.queryByText("Tasks")).toBeNull()
  })

  // Tables T-AT: an Airtable import says how many tables its bases bring.
  it("counts the tables a base brings", async () => {
    answers = [planned({ table_count: 7, task_count: 0, project_count: 0 })]
    render(<ImportPlanDialog job={{ ...job, provider: "airtable" }} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    const label = await screen.findByText("Tables")
    expect(label.parentElement?.textContent).toContain("7")
    expect(screen.queryByText("Tasks")).toBeNull()
  })

  it("stands rows of the plan's shape in while it plans", async () => {
    let finish: (v: unknown) => void = () => {}
    answers = [new Promise((r) => (finish = r))]
    render(<ImportPlanDialog job={job} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    expect(screen.getByRole("status", { name: "Planning the import" })).toBeTruthy()
    finish(planned())
    expect(await screen.findByText("Tasks")).toBeTruthy()
  })

  it("counts a Miro import's boards and what is on them", async () => {
    answers = [{ user_count: 0, user_new: 0, user_merge: 0, team_count: 0, project_count: 0, task_count: 0, subtask_count: 0, comment_count: 0, file_count: 0, file_bytes: 0, board_count: 2, item_count: 1340 }]
    const miro = { ...job, provider: "miro" } as ImportJob
    render(<ImportPlanDialog job={miro} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} onReconnect={() => {}} />)
    await waitFor(() => expect(screen.getByText("Boards")).toBeTruthy())
    expect(screen.getByText("2")).toBeTruthy()
    expect(screen.getByText("Items on them")).toBeTruthy()
    expect(screen.getByText("1,340")).toBeTruthy()
  })
})

describe("an uploaded table's columns and people", () => {
  const csvJob = { id: "j2", provider: "csv", source_workspace_name: "Launch plan", status: "validating", options: { time_zone: "Asia/Kolkata" } } as unknown as ImportJob
  const columns = (sprint = "select") => [
    { name: "Summary", property: "title", values: 9 },
    { name: "Budget (USD)", kind: "money", guess: "money", currency: "USD", values: 9 },
    { name: "Sprint", kind: sprint, guess: "select", values: 7 },
  ]
  const deferred = () => {
    let resolve: (v: unknown) => void = () => {}
    const promise = new Promise((r) => (resolve = r))
    return { promise, resolve }
  }
  const sprint = () => screen.getByRole("combobox", { name: "What Sprint becomes" })
  // The app's own picker: opened from the keyboard, as a person can, then the choice.
  const choose = async (picker: HTMLElement, name: string) => {
    fireEvent.keyDown(picker, { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("option", { name }))
  }

  it("names what each column fills, and offers each field the kinds with the one its values suggest", async () => {
    answers = [planned({ columns: columns() })]
    render(<ImportPlanDialog job={csvJob} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    await screen.findByRole("heading", { name: "Columns" })
    expect(screen.getByText("Summary")).toBeTruthy()
    expect(screen.getByText("Title")).toBeTruthy()
    expect(sprint().textContent).toBe("Select")
    // Closed, the value whole, with no "(suggested)" to cut it short; open, the list says which its values suggest.
    const budget = screen.getByRole("combobox", { name: "What Budget (USD) becomes" })
    expect(budget.textContent).toBe("Money, USD")
    fireEvent.keyDown(budget, { key: "ArrowDown" })
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent)
    expect(options).toContain("Money, USD (suggested)")
    expect(options).toContain("Don't import")
  })

  it("plans the file again with a column's new kind, keeping the job's own options, and holds Start until it has", async () => {
    const replan = deferred()
    answers = [planned({ columns: columns() }), replan.promise]
    const { planImportJob } = await import("@/services/importService")
    render(<ImportPlanDialog job={csvJob} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    await screen.findByRole("heading", { name: "Columns" })
    await choose(sprint(), "Don't import")
    await waitFor(() =>
      expect(planImportJob).toHaveBeenLastCalledWith("j2", { options: { time_zone: "Asia/Kolkata", columns: { "Budget (USD)": "money", Sprint: "skip" } } }),
    )
    expect((screen.getByRole("button", { name: "Start import" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("status").textContent).toMatch(/Reading the file again/)
    replan.resolve(planned({ columns: columns("skip"), task_count: 12 }))
    await waitFor(() => expect(screen.getByText("12")).toBeTruthy())
    expect(sprint().textContent).toBe("Don't import")
    expect((screen.getByRole("button", { name: "Start import" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("puts a column back, and says why, when the file can't be read with that choice", async () => {
    answers = [planned({ columns: columns() }), { response: { status: 400, data: { error: "Sprint can't be read as numbers." } } }]
    render(<ImportPlanDialog job={csvJob} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    await screen.findByRole("heading", { name: "Columns" })
    await choose(sprint(), "Number")
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Sprint can't be read as numbers\./))
    expect(sprint().textContent).toBe("Select")
  })

  // The plan keeps a choice before it reads the file with it, so one it
  // couldn't plan with may still be the server's while the dialog shows the
  // column put back. Start runs with what the dialog shows.
  it("starts the import with each column as the plan shows it, after a choice put back", async () => {
    answers = [planned({ columns: columns() }), { response: { status: 503, data: { error: "Try again in a moment." } } }]
    const { runImportJob } = await import("@/services/importService")
    render(<ImportPlanDialog job={csvJob} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    await screen.findByRole("heading", { name: "Columns" })
    await choose(sprint(), "Number")
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Try again in a moment\./))
    fireEvent.click(screen.getByRole("button", { name: "Start import" }))
    await waitFor(() =>
      expect(runImportJob).toHaveBeenCalledWith("j2", {
        options: { time_zone: "Asia/Kolkata", columns: { "Budget (USD)": "money", Sprint: "select" } },
        status_mappings: {},
        priority_mappings: {},
      }),
    )
  })

  it("keeps the last choice when an earlier one's plan answers after it", async () => {
    const first = deferred()
    answers = [planned({ columns: columns() }), first.promise, planned({ columns: columns("number") })]
    render(<ImportPlanDialog job={csvJob} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    await screen.findByRole("heading", { name: "Columns" })
    await choose(sprint(), "Text")
    await choose(sprint(), "Number")
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull())
    await act(async () => first.resolve(planned({ columns: columns("text") })))
    expect(sprint().textContent).toBe("Number")
  })

  it("lists the people the file names, placeholders first, each with who they are here and how that is known", async () => {
    answers = [
      planned({
        columns: columns(),
        people: [
          { source_id: "a", name: "Ana Lima", rows: 3, matched_by: "name", member: "Ana Lima" },
          { source_id: "b", name: "Bo Ray", rows: 1, same_name: 2 },
          { source_id: "c", name: "Cy", email: "cy@acme.test", rows: 2, matched_by: "email", member: "Cyrus Day" },
        ],
      }),
    ]
    render(<ImportPlanDialog job={csvJob} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} />)
    const list = await screen.findByRole("list", { name: "People in the file" })
    const rows = Array.from(list.querySelectorAll("li")).map((li) => li.textContent)
    expect(rows).toEqual([
      "Bo RayComes as a placeholder: 2 members share this name",
      "Ana LimaAna Lima, by their name",
      "Cy · cy@acme.testCyrus Day, by their address",
    ])
  })
})

describe("personMatchWords", () => {
  const p = { source_id: "s", name: "Sam", rows: 1 }
  it("says who someone is here and how that is known, or that they come as a placeholder", async () => {
    const { personMatchWords } = await import("./ImportPlanDialog")
    expect(personMatchWords({ ...p, matched_by: "email", member: "Sam Rivera" })).toBe("Sam Rivera, by their address")
    expect(personMatchWords({ ...p, matched_by: "name", member: "Sam Rivera" })).toBe("Sam Rivera, by their name")
    expect(personMatchWords({ ...p, matched_by: "workspace_map" })).toBe("As an earlier import matched them")
    expect(personMatchWords({ ...p, matched_by: "import", member: "Sam Rivera" })).toBe("Sam Rivera, as this import matched them")
    expect(personMatchWords({ ...p, same_name: 3 })).toBe("Comes as a placeholder: 3 members share this name")
    expect(personMatchWords(p)).toBe("Comes as a placeholder")
  })
})
