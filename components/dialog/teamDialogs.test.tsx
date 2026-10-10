import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// New team and Rename team read as New channel and Edit channel do: the name is
// checked by itself a moment after typing stops, with no "Check availability"
// step, and the rename's field was labelled "Channel Name".

const fetched: string[] = []
const taken = vi.hoisted(() => ({ names: new Set<string>(["design"]) }))
const TEAM = { data: { data: { team_name: "Studio", team_uuid: "t1" } }, isLoading: false, mutate: () => {} }
const NONE = { data: undefined, isLoading: false, mutate: () => {} }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) fetched.push(url)
    if (url.includes("team_name=")) {
      const name = decodeURIComponent(url.split("team_name=")[1])
      return { data: { exists: taken.names.has(name) }, isLoading: false, mutate: () => {} }
    }
    if (url) return TEAM
    return NONE
  },
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})), isSubmitting: false }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))

const { default: CreateTeamDialog } = await import("./createTeamDialog")
const { default: EditTeamNameDialog } = await import("./editTeamNameDialog")

afterEach(() => {
  cleanup()
  fetched.length = 0
  vi.useRealTimers()
})

const type = async (value: string) => {
  fireEvent.change(screen.getByLabelText("Team name"), { target: { value } })
  // The form's validation settles first, then the pause after typing.
  for (let i = 0; i < 3; i++) await act(async () => void (await vi.advanceTimersByTimeAsync(250)))
}

describe("New team", () => {
  it("checks the name by itself, with no extra step, and then offers Create", async () => {
    vi.useFakeTimers()
    render(<CreateTeamDialog dialogOpenState setOpenState={() => {}} />)
    expect(screen.queryByRole("button", { name: /check availability/i })).toBeNull()
    const create = () => screen.getByRole("button", { name: "Create team" }) as HTMLButtonElement
    expect(create().disabled).toBe(true)
    await type("Research")
    expect(fetched.some((u) => u.includes("team_name=Research"))).toBe(true)
    expect(screen.getByText("Name is available")).toBeTruthy()
    expect(create().disabled).toBe(false)
  })

  it("says when a team already has the name, in the team's words", async () => {
    vi.useFakeTimers()
    render(<CreateTeamDialog dialogOpenState setOpenState={() => {}} />)
    await type("design")
    expect(screen.getByText("A team already has this name.")).toBeTruthy()
    expect(screen.queryByText(/channel/i)).toBeNull()
  })
})

describe("Rename team", () => {
  it("labels its field Team name, not Channel Name", () => {
    render(<EditTeamNameDialog dialogOpenState setOpenState={() => {}} teamId="t1" />)
    expect(screen.getByLabelText("Team name")).toBeTruthy()
    expect(screen.queryByText("Channel Name")).toBeNull()
  })

  it("checks a new name by itself and lets it be saved", async () => {
    vi.useFakeTimers()
    render(<EditTeamNameDialog dialogOpenState setOpenState={() => {}} teamId="t1" />)
    expect(screen.queryByRole("button", { name: /check availability/i })).toBeNull()
    const save = () => screen.getByRole("button", { name: "Save name" }) as HTMLButtonElement
    expect(save().disabled).toBe(true)
    await type("Studio North")
    expect(screen.getByText("Name is available")).toBeTruthy()
    expect(save().disabled).toBe(false)
  })
})
