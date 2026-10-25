import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Admin > Import and export: the people earlier imports added, for an admin to look over.

const answers = new Map<string, unknown>()
const failures = new Set<string>()
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: answers.get(key), isLoading: false, isError: failures.has(key) ? new Error("down") : undefined, mutate }),
}))
const appMutate = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/swrMutate", () => ({ appMutate }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
const svc = vi.hoisted(() => ({ listImportReviewPeople: vi.fn(), takeOffImportReview: vi.fn(), takeOffEveryoneLeft: vi.fn(), keepEveryoneLeft: vi.fn() }))
vi.mock("@/lib/importReviews", async (orig) => ({ ...(await orig<object>()), ...svc }))

import ImportReviewCard, { projectLine, providerWords } from "./ImportReviewCard"
import { IMPORT_REVIEWS_KEY, reviewPlaceOf, type ImportReviewProject } from "@/lib/importReviews"

const LAUNCH: ImportReviewProject = { project_uuid: "11111111-1111-4111-8111-111111111111", project_name: "Launch", providers: ["todoist"], undecided: 2, removed: 0, kept: 0 }
const CLEANUP: ImportReviewProject = { project_uuid: "22222222-2222-4222-8222-222222222222", project_name: "Cleanup", providers: ["notion"], undecided: 0, removed: 1, kept: 1 }
const ANN = { id: "a1111111-1111-4111-8111-111111111111", provider: "todoist", user_uuid: "u1", user_name: "Ann Lee" }
const BEN = { id: "b2222222-2222-4222-8222-222222222222", provider: "todoist", user_uuid: "u2", user_name: "Ben Ortiz" }

function reviews(projects: ImportReviewProject[]) {
  answers.set(IMPORT_REVIEWS_KEY, { projects, pending: projects.reduce((n, p) => n + p.undecided, 0) })
}

async function openLaunch() {
  svc.listImportReviewPeople.mockResolvedValue({ people: [ANN, BEN], more: false })
  render(<ImportReviewCard />)
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review Launch's people" })))
  return screen.findByRole("dialog")
}

describe("Admin > Import and export: people earlier imports added", () => {
  afterEach(() => {
    cleanup()
    answers.clear()
    failures.clear()
    Object.values(svc).forEach((f) => f.mockReset())
    confirm.mockReset()
    toast.mockReset()
    appMutate.mockClear()
    mutate.mockReset()
  })

  it("draws nothing while it loads, nor when no import left anyone to review", () => {
    const { container, rerender } = render(<ImportReviewCard />)
    expect(container).toBeEmptyDOMElement()
    reviews([])
    rerender(<ImportReviewCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lists each project with what is left to review, and says how many in all", () => {
    reviews([LAUNCH, CLEANUP])
    render(<ImportReviewCard />)
    expect(screen.getByRole("heading", { name: "People earlier imports added" })).toBeInTheDocument()
    expect(screen.getByText(/Earlier imports from Todoist and Notion added people to these projects\. Choose who stays in each: 2 people left to review\./)).toBeInTheDocument()
    const launch = screen.getByText("Launch").closest("li") as HTMLElement
    expect(within(launch).getByText("From Todoist · 2 to review")).toBeInTheDocument()
    expect(within(launch).getByRole("button", { name: "Review Launch's people" })).toHaveTextContent("Review…")
    const cleanupRow = screen.getByText("Cleanup").closest("li") as HTMLElement
    expect(within(cleanupRow).getByText("Reviewed · 1 kept, 1 taken off")).toBeInTheDocument()
    expect(within(cleanupRow).getByRole("button", { name: "See Cleanup's people" })).toHaveTextContent("See who…")
  })

  it("says so once every project is reviewed", () => {
    reviews([CLEANUP])
    render(<ImportReviewCard />)
    expect(screen.getByText("All reviewed. Each project shows who was kept and who was taken off.")).toBeInTheDocument()
  })

  it("says the list couldn't load, with a way to try again", () => {
    failures.add(IMPORT_REVIEWS_KEY)
    render(<ImportReviewCard />)
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load who earlier imports added.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  it("takes one person off, shows it in their row, and refreshes the counts", async () => {
    reviews([LAUNCH])
    const dialog = await openLaunch()
    expect(svc.listImportReviewPeople).toHaveBeenCalledWith(LAUNCH.project_uuid, undefined)
    svc.takeOffImportReview.mockResolvedValue(undefined)
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Take Ann Lee off Launch" })))
    expect(svc.takeOffImportReview).toHaveBeenCalledWith(ANN.id)
    const ann = within(dialog).getByText("Ann Lee").closest("li") as HTMLElement
    expect(within(ann).getByText("Taken off")).toBeInTheDocument()
    expect(within(ann).queryByRole("button")).toBeNull()
    expect(toast).toHaveBeenCalledWith({ title: "Ann Lee was taken off Launch" })
    expect(appMutate).toHaveBeenCalledWith(IMPORT_REVIEWS_KEY)
  })

  it("says why a taking off was refused, and shows the list as it is now when another admin decided first", async () => {
    reviews([LAUNCH])
    const dialog = await openLaunch()
    svc.takeOffImportReview.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { msg: "An admin has already decided that one." } } })
    svc.listImportReviewPeople.mockResolvedValue({ people: [{ ...ANN, outcome: "kept" }, BEN], more: false })
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Take Ann Lee off Launch" })))
    expect(within(dialog).getByRole("alert")).toHaveTextContent("An admin has already decided that one.")
    await waitFor(() => expect(within(dialog).getByText("Kept")).toBeInTheDocument())
    expect(svc.listImportReviewPeople).toHaveBeenCalledTimes(2)
  })

  it("keeps everyone left in one go", async () => {
    reviews([LAUNCH])
    const dialog = await openLaunch()
    svc.keepEveryoneLeft.mockResolvedValue(2)
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Keep everyone left" })))
    expect(svc.keepEveryoneLeft).toHaveBeenCalledWith(LAUNCH.project_uuid)
    expect(toast).toHaveBeenCalledWith({ title: "Kept 2 people in Launch" })
    expect(appMutate).toHaveBeenCalledWith(IMPORT_REVIEWS_KEY)
  })

  it("asks before taking everyone left off, keeps asking until the first batch is answered, then goes a batch a call, saying how many are left", async () => {
    reviews([LAUNCH])
    const dialog = await openLaunch()
    fireEvent.click(within(dialog).getByRole("button", { name: "Take everyone left off" }))
    expect(svc.takeOffEveryoneLeft).not.toHaveBeenCalled()
    const asked = confirm.mock.calls[0][0] as { title: string; description: string; destructive: boolean; onConfirm(): unknown }
    expect(asked.title).toBe("Take everyone left off Launch?")
    expect(asked.description).toMatch(/^The 2 people not yet decided lose access to Launch and everything in it\./)
    expect(asked.destructive).toBe(true)
    let firstBatch: (v: { removed: number; left: number }) => void = () => {}
    let secondBatch: (v: { removed: number; left: number }) => void = () => {}
    svc.takeOffEveryoneLeft
      .mockReturnValueOnce(new Promise((resolve) => (firstBatch = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (secondBatch = resolve)))
    // The question stays open, its action busy, until the first batch is
    // answered: one that closed at once let the tap that answered it go on to
    // the phone's sheet under it as a tap outside, which closed the sheet.
    let asking = true
    const answered = asked.onConfirm()
    expect(answered).toBeInstanceOf(Promise)
    void (answered as Promise<unknown>).then(() => (asking = false))
    await act(async () => {})
    expect(asking).toBe(true)
    await act(async () => firstBatch({ removed: 1, left: 1 }))
    expect(asking).toBe(false)
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Taking people off… 1 person left")
    await act(async () => secondBatch({ removed: 1, left: 0 }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Took 2 people off Launch" }))
    expect(svc.takeOffEveryoneLeft).toHaveBeenCalledTimes(2)
    expect(svc.takeOffEveryoneLeft).toHaveBeenCalledWith(LAUNCH.project_uuid)
    expect(appMutate).toHaveBeenCalledWith(IMPORT_REVIEWS_KEY)
  })

  it("leaves a refused first batch to the question, which says why, and the sheet as it was", async () => {
    reviews([LAUNCH])
    const dialog = await openLaunch()
    fireEvent.click(within(dialog).getByRole("button", { name: "Take everyone left off" }))
    const asked = confirm.mock.calls[0][0] as { onConfirm(): unknown }
    const refused = new Error("Only an admin can do that.")
    svc.takeOffEveryoneLeft.mockRejectedValueOnce(refused)
    let reason: unknown
    await act(async () => {
      await (asked.onConfirm() as Promise<unknown>).catch((e: unknown) => (reason = e))
    })
    expect(reason).toBe(refused)
    expect(svc.takeOffEveryoneLeft).toHaveBeenCalledTimes(1)
    expect(within(dialog).getByRole("button", { name: "Take everyone left off" })).toBeEnabled()
    expect(within(dialog).queryByRole("status")).toBeNull()
  })

  it("stops when a batch takes nobody off, and says who couldn't be", async () => {
    reviews([LAUNCH])
    const dialog = await openLaunch()
    fireEvent.click(within(dialog).getByRole("button", { name: "Take everyone left off" }))
    const asked = confirm.mock.calls[0][0] as { onConfirm(): unknown }
    svc.takeOffEveryoneLeft.mockResolvedValueOnce({ removed: 1, left: 1 }).mockResolvedValueOnce({ removed: 0, left: 1 })
    await act(async () => void asked.onConfirm())
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("1 person couldn't be taken off: a project's creator always stays in it."))
    expect(svc.takeOffEveryoneLeft).toHaveBeenCalledTimes(2)
  })

  it("says nothing went when nobody could be taken off, only who couldn't be", async () => {
    reviews([LAUNCH])
    const dialog = await openLaunch()
    fireEvent.click(within(dialog).getByRole("button", { name: "Take everyone left off" }))
    const asked = confirm.mock.calls[0][0] as { onConfirm(): unknown }
    svc.takeOffEveryoneLeft.mockResolvedValueOnce({ removed: 0, left: 1 })
    await act(async () => void asked.onConfirm())
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("1 person couldn't be taken off: a project's creator always stays in it."))
    expect(svc.takeOffEveryoneLeft).toHaveBeenCalledTimes(1)
    expect(toast).not.toHaveBeenCalled()
  })

  it("pages a long project from the last person shown", async () => {
    reviews([LAUNCH])
    svc.listImportReviewPeople.mockResolvedValueOnce({ people: [ANN], more: true })
    render(<ImportReviewCard />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review Launch's people" })))
    const dialog = await screen.findByRole("dialog")
    svc.listImportReviewPeople.mockResolvedValueOnce({ people: [BEN], more: false })
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Show more" })))
    expect(svc.listImportReviewPeople).toHaveBeenLastCalledWith(LAUNCH.project_uuid, ANN.id)
    expect(within(dialog).getByText("Ben Ortiz")).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Show more" })).toBeNull()
  })

  it("says the people couldn't load, and loads them on Try again", async () => {
    reviews([LAUNCH])
    svc.listImportReviewPeople.mockRejectedValueOnce(new Error("down"))
    render(<ImportReviewCard />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review Launch's people" })))
    const dialog = await screen.findByRole("dialog")
    svc.listImportReviewPeople.mockResolvedValueOnce({ people: [ANN], more: false })
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: /Try again/ })))
    expect(within(dialog).getByText("Ann Lee")).toBeInTheDocument()
  })
})

describe("where the Import tab draws it", () => {
  const data = (projects: ImportReviewProject[]) => ({ projects, pending: projects.reduce((n, p) => n + p.undecided, 0) })
  it("waits for the read, and for the card's code when there is something to draw", () => {
    expect(reviewPlaceOf({}, true)).toBeNull()
    expect(reviewPlaceOf({ data: data([LAUNCH]) }, false)).toBeNull()
    expect(reviewPlaceOf({ isError: new Error("down") }, false)).toBeNull()
  })
  it("draws it first while anyone is left, last once all are decided, and nowhere with no review", () => {
    expect(reviewPlaceOf({ data: data([LAUNCH, CLEANUP]) }, true)).toBe("first")
    expect(reviewPlaceOf({ data: data([CLEANUP]) }, true)).toBe("last")
    expect(reviewPlaceOf({ data: data([]) }, false)).toBe("none")
    expect(reviewPlaceOf({ isError: new Error("down") }, true)).toBe("first")
  })
})

describe("its words", () => {
  it("names the tools", () => {
    expect(providerWords(["todoist"])).toBe("Todoist")
    expect(providerWords(["todoist", "notion", "todoist"])).toBe("Todoist and Notion")
  })
  it("says what is left, or what was decided", () => {
    expect(projectLine({ ...CLEANUP, kept: 3, removed: 0 })).toBe("Reviewed · 3 kept")
    expect(projectLine({ ...LAUNCH, undecided: 1200 })).toBe("From Todoist · 1,200 to review")
  })
})
