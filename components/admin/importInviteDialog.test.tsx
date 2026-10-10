import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ImportPeople, InviteRun } from "@/services/importService"

// The dialog's data and the one call that sends: everything else is real.
let people: ImportPeople | undefined
let loading = false
const refetch = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url ? people : undefined, isError: false, isLoading: loading, mutate: refetch }),
}))
const sent: string[][] = []
let answer: Partial<InviteRun> = {}
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  inviteImportedPeople: vi.fn(async (chosen: { email: string }[], onProgress?: (d: number, t: number) => void) => {
    sent.push(chosen.map((p) => p.email))
    chosen.forEach((_, i) => onProgress?.(i + 1, chosen.length))
    return { invited: chosen, alreadyInvited: [], failed: [], seatLimit: null, notEmailed: [], unsentMsg: null, ...answer }
  }),
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))

const { ImportInviteDialog } = await import("./ImportInviteDialog")

afterEach(() => {
  cleanup()
  sent.length = 0
  answer = {}
  loading = false
})

const offer = (left: number | null, n = 3, email: ImportPeople["email"] = { on: true, left: null }): ImportPeople => ({
  people: Array.from({ length: n }, (_, i) => ({ user_id: `u${i}`, name: `Person ${i}`, email: `p${i}@acme.test` })),
  already_members: 2,
  already_invited: 0,
  no_email: 1,
  left: 0,
  seats: { used: left === null ? 3 : 25 - left, limit: left === null ? 0 : 25, left },
  email,
})

describe("Invite the people who came across", () => {
  it("lists everyone, says who isn't listed and why, and invites them all in one step", async () => {
    people = offer(null)
    render(<ImportInviteDialog jobId="j1" label="Acme" open onOpenChange={() => {}} />)
    expect(screen.getByText("Not listed: 2 already here, 1 without an email address.")).toBeTruthy()
    expect(screen.queryByText(/free plan/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Invite 3 people" }))
    await waitFor(() => expect(screen.getByText("Invited 3 people. Each gets an email with a link to join.")).toBeTruthy())
    expect(sent).toEqual([["p0@acme.test", "p1@acme.test", "p2@acme.test"]])
    expect(refetch).toHaveBeenCalled()
  })

  // A free plan with room for two: two are ticked, the third can't be until
  // one is unticked, and the plan's room is said plainly.
  it("ticks only as many as the plan has room for", async () => {
    people = offer(2)
    render(<ImportInviteDialog jobId="j1" open onOpenChange={() => {}} />)
    expect(screen.getByText("Your free plan has room for 2 more people (23 of 25 places taken).")).toBeTruthy()
    const boxes = screen.getAllByRole("checkbox")
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "true", "false"])
    expect((boxes[2] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(boxes[0])
    expect((screen.getAllByRole("checkbox")[2] as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getAllByRole("checkbox")[2])
    fireEvent.click(screen.getByRole("button", { name: "Invite 2 people" }))
    await waitFor(() => expect(sent).toEqual([["p1@acme.test", "p2@acme.test"]]))
  })

  it("can't invite anyone into a full plan, and says so", () => {
    people = offer(0)
    render(<ImportInviteDialog jobId="j1" open onOpenChange={() => {}} />)
    expect(screen.getByText(/Your free plan is full/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Invite 0 people" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("says when the plan filled up partway", async () => {
    people = offer(null, 2)
    answer = { invited: [], seatLimit: { msg: "This workspace is full.", notInvited: offer(null, 2).people } }
    render(<ImportInviteDialog jobId="j1" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Invite 2 people" }))
    await waitFor(() => expect(screen.getByText("This workspace is full. 2 people weren't invited.")).toBeTruthy())
  })

  it("says when there is nobody left to invite", () => {
    people = { ...offer(null, 0), already_invited: 4 }
    render(<ImportInviteDialog jobId="j1" open onOpenChange={() => {}} />)
    expect(screen.getByText(/Nobody left to invite/)).toBeTruthy()
    expect(screen.getByText("Not listed: 2 already here, 4 already invited, 1 without an email address.")).toBeTruthy()
  })

  // OneCamp Cloud lends a workspace its email, with a daily allowance shared
  // with password resets: no more are ticked than can be emailed today, and
  // the dialog says how many get one and where the rest's links are.
  it("ticks only as many as can be emailed today, and says where the other links are", async () => {
    people = offer(null, 5, { on: true, left: 3 })
    render(<ImportInviteDialog jobId="j1" open onOpenChange={() => {}} />)
    const boxes = screen.getAllByRole("checkbox")
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "true", "true", "false", "false"])
    expect(screen.getByText("Each person ticked gets an email (3 more invitation emails can go out today).")).toBeTruthy()
    fireEvent.click(boxes[3])
    expect(screen.getByText("Only 3 can be emailed today, so 1 person ticked won't get one: copy their links from Admin → Invitations.")).toBeTruthy()
    answer = { notEmailed: [offer(null, 5).people[3]] }
    fireEvent.click(screen.getByRole("button", { name: "Invite 4 people" }))
    await waitFor(() =>
      expect(screen.getByText("Invited 4 people. 3 got an email; the other 1 didn't, so copy their links from Admin → Invitations.")).toBeTruthy(),
    )
  })

  it("says plainly when today's emails are used up, and still lets the admin invite with links", () => {
    people = offer(null, 2, { on: true, left: 0 })
    render(<ImportInviteDialog jobId="j1" open onOpenChange={() => {}} />)
    expect(screen.getAllByRole("checkbox").map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "false"])
    expect(screen.getByText(/Today's invitation emails are used up/)).toBeTruthy()
    expect((screen.getAllByRole("checkbox")[0] as HTMLButtonElement).disabled).toBe(false)
  })

  // A whole site's accounts came across for one project once: a long list
  // starts with nobody ticked, and one click ticks as many as there's room for.
  it("starts a long list with nobody ticked", () => {
    people = offer(10, 60)
    render(<ImportInviteDialog jobId="j1" open onOpenChange={() => {}} />)
    expect(screen.getAllByRole("checkbox").every((b) => b.getAttribute("aria-checked") === "false")).toBe(true)
    expect(screen.getByText(/60 people came across, so nobody is ticked/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Tick as many as there's room for" }))
    expect(screen.getAllByRole("checkbox").filter((b) => b.getAttribute("aria-checked") === "true")).toHaveLength(10)
    expect(screen.getByRole("button", { name: "Invite 10 people" })).toBeTruthy()
  })
})

describe("how the invite dialog reads", () => {
  // A spinner stood in for the list, so the dialog jumped when it came.
  it("stands rows of the people's shape in while they load", () => {
    people = undefined
    loading = true
    render(<ImportInviteDialog jobId="j1" label="Acme" open onOpenChange={() => {}} />)
    const status = screen.getByRole("status", { name: "Loading the people" })
    expect(status.querySelector(".animate-spin")).toBeNull()
    expect(status.querySelector(".animate-shimmer")).toBeTruthy()
  })

  // Its title's icon was orange, the colour that means "press me".
  it("puts its title's icon on the workspace tile, not in the accent", () => {
    people = offer(null)
    const { baseElement } = render(<ImportInviteDialog jobId="j1" label="Acme" open onOpenChange={() => {}} />)
    const title = screen.getByRole("heading", { name: /Invite the people who came across/ })
    expect(title.querySelector(".text-primary")).toBeNull()
    expect(baseElement.querySelector(".hue-sun")).toBeTruthy()
  })
})
