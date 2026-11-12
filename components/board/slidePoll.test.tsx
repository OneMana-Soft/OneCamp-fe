// A poll on a presented slide (miro-28 to_win 4): everyone following votes on the slide's card and sees its tally;
// the presenter starts a poll on the slide's frame from the slide bar (a popover on a computer, a drawer on a phone)
// and whoever may edit the board closes it, as the server's can_close says. A share link's guest reads the question
// and the tally, never a vote control. Refusals (403, 404, 409) read as the server's words; offline, a vote or a start
// is refused with words and nothing is queued.

import { afterEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const env = vi.hoisted(() => ({ offline: false, mobile: false }))
vi.mock("@/lib/connectivity", () => ({ isAppOffline: () => env.offline, subscribeConnectivity: () => () => {} }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: env.mobile, isDesktop: !env.mobile }) }))

import SlidePoll from "@/components/board/slidePoll"
import { BOARD_SIDES } from "@/components/board/presentFrame"
import type { BoardPoll } from "@/lib/board/boardPolls"

const poll = (patch: Partial<BoardPoll> = {}): BoardPoll => ({
  id: "p1", channel_uuid: "", question: "Which day do we ship?", multiple: false,
  options: [{ id: "fri", text: "Friday", votes: 0 }, { id: "mon", text: "Monday", votes: 0 }],
  voters: 0, mine: [], closed: false, can_close: false, created_by: "u-sam", board_uuid: "b1", frame_id: "f-q4", ...patch,
})
const ready = { state: "ready" as const, reason: undefined, retry: vi.fn() }
const refused = (status: number, msg: string, code?: string) => Promise.reject({ response: { status, data: { msg, code } } })

function card(props: Partial<React.ComponentProps<typeof SlidePoll>> = {}) {
  const put = vi.fn()
  const onComposing = vi.fn()
  const http = { post: vi.fn() }
  const anchor = { current: null as HTMLElement | null }
  const all = { poll: poll(), board: "b1", frame: "f-q4", frameName: "Q4 numbers", http, read: ready, put, composing: false, onComposing, anchor, ...props }
  const utils = render(
    <>
      <button ref={(el) => void (anchor.current = el)}>Add a poll</button>
      <SlidePoll {...all} />
    </>,
  )
  return { ...utils, put, onComposing, http: (all.http ?? http) as typeof http }
}
const region = () => screen.getByRole("region", { name: "Poll on this slide" })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  env.offline = false
  env.mobile = false
})

describe("a slide's poll card", () => {
  it("open with no votes yet: the question, each option to vote in, and no Close for someone the server didn't give it", () => {
    card()
    const r = region()
    expect(within(r).getByText("Which day do we ship?")).toBeTruthy()
    expect(within(r).getByRole("button", { name: /^Friday/ })).toBeTruthy()
    expect(within(r).getByRole("button", { name: /^Monday/ })).toBeTruthy()
    expect(within(r).getByText("No votes yet")).toBeTruthy()
    expect(within(r).queryByRole("button", { name: "Close poll" })).toBeNull()
  })

  it("a vote is sent, and the poll it comes back as takes its place: the choice marked and the tally moved", async () => {
    const { http, put } = card()
    http.post.mockResolvedValue({ data: { data: poll({ mine: ["fri"], voters: 1, options: [{ id: "fri", text: "Friday", votes: 1 }, { id: "mon", text: "Monday", votes: 0 }] }) } })
    fireEvent.click(within(region()).getByRole("button", { name: /^Friday/ }))
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(http.post).toHaveBeenCalledWith("/poll/p1/vote", { option_ids: ["fri"] }, { suppressErrorToast: true })
    expect(put.mock.calls[0][0]).toMatchObject({ voters: 1, mine: ["fri"] })
  })

  it("voted: the reader's choice pressed, each option's count and share, and how many voted", () => {
    card({ poll: poll({ mine: ["mon"], voters: 3, options: [{ id: "fri", text: "Friday", votes: 1 }, { id: "mon", text: "Monday", votes: 2 }] }) })
    const r = region()
    expect(within(r).getByRole("button", { name: /^Monday/ }).getAttribute("aria-pressed")).toBe("true")
    expect(within(r).getByText("2 · 67%")).toBeTruthy()
    expect(within(r).getByText(/3 people voted/)).toBeTruthy()
  })

  it("several options and more than one choice: says so, and each click adds to the choice", async () => {
    const options = ["Mon", "Tue", "Wed", "Thu"].map((t, i) => ({ id: `d${i}`, text: t, votes: i }))
    const { http } = card({ poll: poll({ multiple: true, mine: ["d0"], voters: 4, options }) })
    expect(within(region()).getAllByRole("button", { name: /^(Mon|Tue|Wed|Thu)/ })).toHaveLength(4)
    expect(within(region()).getByText(/choose any/)).toBeTruthy()
    http.post.mockResolvedValue({ data: { data: poll() } })
    fireEvent.click(within(region()).getByRole("button", { name: /^Wed/ }))
    await waitFor(() => expect(http.post).toHaveBeenCalledWith("/poll/p1/vote", { option_ids: ["d0", "d2"] }, { suppressErrorToast: true }))
  })

  it("closed: the tally stays, every option is shut, and it says closed", () => {
    card({ poll: poll({ closed: true, can_close: true, voters: 2, options: [{ id: "fri", text: "Friday", votes: 2 }, { id: "mon", text: "Monday", votes: 0 }] }) })
    const r = region()
    for (const b of within(r).getAllByRole("button", { name: /^(Friday|Monday)/ })) expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(within(r).getByText("Closed")).toBeTruthy()
    expect(within(r).queryByRole("button", { name: "Close poll" })).toBeNull()
  })

  it("an editor's Close, from the view's can_close: sent, and the closed poll takes its place", async () => {
    const { http, put } = card({ poll: poll({ can_close: true }) })
    http.post.mockResolvedValue({ data: { data: poll({ closed: true, can_close: true }) } })
    fireEvent.click(within(region()).getByRole("button", { name: "Close poll" }))
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(http.post).toHaveBeenCalledWith("/poll/p1/close", undefined, { suppressErrorToast: true })
  })

  it("a refused close reads as the server's words", async () => {
    const { http } = card({ poll: poll({ can_close: true }) })
    http.post.mockReturnValue(refused(403, "Only people who can edit this board start or close its polls."))
    fireEvent.click(within(region()).getByRole("button", { name: "Close poll" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Only people who can edit this board start or close its polls.")
  })

  it("a share link's guest: the question and the tally, never a vote control or a Close", () => {
    card({ http: undefined, poll: poll({ can_close: false, voters: 2, options: [{ id: "fri", text: "Friday", votes: 2 }, { id: "mon", text: "Monday", votes: 0 }] }) })
    const r = region()
    expect(within(r).getByText("Which day do we ship?")).toBeTruthy()
    expect(within(r).getByText("Friday")).toBeTruthy()
    expect(within(r).getByText("2 · 100%")).toBeTruthy()
    expect(within(r).queryAllByRole("button")).toHaveLength(0)
  })

  it("offline: a vote is refused with words and nothing is sent or kept to send", async () => {
    env.offline = true
    const { http } = card({ read: { ...ready, state: "offline" } })
    fireEvent.click(within(region()).getByRole("button", { name: /^Friday/ }))
    expect((await screen.findByRole("alert")).textContent).toContain("You're offline: your vote wasn't sent.")
    expect(http.post).not.toHaveBeenCalled()
    expect(within(region()).getByText(/the tally may be behind/)).toBeTruthy()
    env.offline = false
    await new Promise((r) => setTimeout(r, 20))
    expect(http.post).not.toHaveBeenCalled()
  })

  it("a failed read: what went wrong, and Try again", () => {
    const retry = vi.fn()
    card({ poll: undefined, read: { state: "failed", reason: "There's no such board.", retry } })
    const r = region()
    expect(within(r).getByText("Couldn't load this slide's poll")).toBeTruthy()
    expect(within(r).getByText("There's no such board.")).toBeTruthy()
    fireEvent.click(within(r).getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalled()
  })

  it("a failed re-read once the poll was read: says the tally may be behind, and Try again reads again", () => {
    const retry = vi.fn()
    card({ read: { state: "failed", reason: undefined, retry } })
    const r = region()
    expect(within(r).getByText("Which day do we ship?")).toBeTruthy()
    expect(within(r).getByText("Couldn't refresh the poll: the tally may be behind.")).toBeTruthy()
    fireEvent.click(within(r).getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalled()
  })

  it("on a computer it's a side of the board: the presented frame's fit leaves its strip (presentFrame's BOARD_SIDES)", () => {
    card()
    expect(region().matches(BOARD_SIDES)).toBe(true)
  })

  it("says to a screen reader, politely, when a poll starts and when it closes", async () => {
    const one = (p: BoardPoll | undefined) => (
      <SlidePoll poll={p} board="b1" frame="f-q4" frameName="Q4 numbers" http={{ post: vi.fn() }} read={ready} put={vi.fn()} composing={false} onComposing={vi.fn()} />
    )
    const { rerender, container } = render(one(poll()))
    const said = container.querySelector<HTMLElement>("[data-slide-poll-said]")!
    expect(said.getAttribute("role")).toBe("status")
    expect(said.getAttribute("aria-live")).toBe("polite")
    await waitFor(() => expect(said.textContent).toBe("Poll started: Which day do we ship?"))
    rerender(one(poll({ voters: 1 })))
    expect(said.textContent).toBe("Poll started: Which day do we ship?")
    rerender(one(poll({ closed: true })))
    await waitFor(() => expect(said.textContent).toBe("Poll closed"))
    rerender(one(poll({ id: "p2", question: "And the venue?" })))
    await waitFor(() => expect(said.textContent).toBe("Poll started: And the venue?"))
  })

  describe("on a phone", () => {
    const phone = () => {
      env.mobile = true
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
    }

    it("folds into a bar, the question and how it stands, that opens the card in a drawer with Close poll in its pinned foot", async () => {
      phone()
      card({ poll: poll({ can_close: true, voters: 2, options: [{ id: "fri", text: "Friday", votes: 2 }, { id: "mon", text: "Monday", votes: 0 }] }) })
      // At rest nothing is over the slide but the bar.
      expect(screen.queryByRole("region", { name: "Poll on this slide" })).toBeNull()
      const bar = screen.getByRole("button", { name: "Poll on this slide: Which day do we ship?, 2 voted" })
      expect(bar.matches(BOARD_SIDES)).toBe(false)
      fireEvent.click(bar)
      const r = await screen.findByRole("region", { name: "Poll on this slide" })
      expect(within(r).getByRole("button", { name: /^Friday/ })).toBeTruthy()
      const foot = r.closest("[data-v3-sheet]")?.querySelector<HTMLElement>("[data-sheet-footer]") as HTMLElement
      expect(within(foot).getAllByRole("button").map((b) => b.textContent)).toEqual(["Close poll"])
    })

    it("a phone held sideways (a sheet's screen at a computer's width) folds it into the bar too: the sheet rule chooses it, not isMobile", () => {
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
      card({ poll: poll() })
      expect(screen.queryByRole("region", { name: "Poll on this slide" })).toBeNull()
      expect(screen.getByRole("button", { name: /^Poll on this slide: Which day do we ship\?/ })).toBeTruthy()
    })

    it("a closed poll's bar says so; a guest's drawer has no foot and no control", async () => {
      phone()
      card({ poll: poll({ closed: true, voters: 1 }), http: undefined })
      fireEvent.click(screen.getByRole("button", { name: "Poll on this slide: Which day do we ship?, Closed · 1 voted" }))
      const r = await screen.findByRole("region", { name: "Poll on this slide" })
      expect(within(r).queryAllByRole("button")).toEqual([])
      expect(r.closest("[data-v3-sheet]")?.querySelector("[data-sheet-footer]")).toBeNull()
    })

    it("a failed read is a bar of its own: what went wrong, and Try again", () => {
      phone()
      const retry = vi.fn()
      card({ poll: undefined, read: { state: "failed", reason: undefined, retry } })
      const r = region()
      expect(within(r).getByText("Couldn't load this slide's poll")).toBeTruthy()
      fireEvent.click(within(r).getByRole("button", { name: "Try again" }))
      expect(retry).toHaveBeenCalled()
    })
  })
})

describe("starting a poll on the slide", () => {
  const form = () => screen.getByRole("form", { name: "New poll" })
  const fill = (question: string, a: string, b: string) => {
    fireEvent.change(within(form()).getByRole("textbox", { name: "Question" }), { target: { value: question } })
    fireEvent.change(within(form()).getByRole("textbox", { name: "Option 1" }), { target: { value: a } })
    fireEvent.change(within(form()).getByRole("textbox", { name: "Option 2" }), { target: { value: b } })
  }

  it("names the frame, says what's missing, and sends nothing until the poll is whole", () => {
    const { http } = card({ poll: undefined, composing: true })
    expect(screen.getByText("New poll on Q4 numbers")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Start poll" }))
    expect(screen.getByRole("alert").textContent).toContain("Write the question first.")
    expect(http.post).not.toHaveBeenCalled()
  })

  it("starts it on the slide's frame, and the started poll shows", async () => {
    const { http, put, onComposing } = card({ poll: undefined, composing: true })
    http.post.mockResolvedValue({ data: { data: poll() } })
    fill(" Which day do we ship? ", "Friday", "Monday ")
    fireEvent.click(within(form()).getByRole("button", { name: "Add option" }))
    fireEvent.change(within(form()).getByRole("textbox", { name: "Option 3" }), { target: { value: "Tuesday" } })
    fireEvent.click(within(form()).getByRole("switch", { name: "People can choose more than one" }))
    fireEvent.click(screen.getByRole("button", { name: "Start poll" }))
    await waitFor(() => expect(put).toHaveBeenCalledWith(poll()))
    expect(http.post).toHaveBeenCalledWith(
      "/board/polls",
      { board_uuid: "b1", frame_id: "f-q4", question: "Which day do we ship?", options: ["Friday", "Monday", "Tuesday"], multiple: true },
      { suppressErrorToast: true },
    )
    expect(onComposing).toHaveBeenCalledWith(false)
  })

  it("once started, the new card's Close poll has the focus (the Add a poll it came from is gone)", async () => {
    const http = { post: vi.fn().mockResolvedValue({ data: { data: poll({ can_close: true }) } }) }
    function Presenter() {
      const [p, setP] = React.useState<BoardPoll | undefined>(undefined)
      const [composing, setComposing] = React.useState(true)
      return <SlidePoll poll={p} board="b1" frame="f-q4" frameName="Q4 numbers" http={http} read={ready} put={setP} composing={composing} onComposing={setComposing} />
    }
    render(<Presenter />)
    fill("Which day do we ship?", "Friday", "Monday")
    fireEvent.click(screen.getByRole("button", { name: "Start poll" }))
    const close = await within(await screen.findByRole("region", { name: "Poll on this slide" })).findByRole("button", { name: "Close poll" })
    await waitFor(() => expect(document.activeElement).toBe(close))
  })

  it("a frame drawn just now (409) reads as the server's words, and the draft stays", async () => {
    const { http, onComposing } = card({ poll: undefined, composing: true })
    http.post.mockReturnValue(refused(409, "That frame isn't on this board yet. A frame drawn just now is saved within half a minute: try again then.", "frame_not_on_board"))
    fill("Ship?", "Yes", "No")
    fireEvent.click(screen.getByRole("button", { name: "Start poll" }))
    expect((await screen.findByRole("alert")).textContent).toContain("That frame isn't on this board yet.")
    expect((within(form()).getByRole("textbox", { name: "Question" }) as HTMLTextAreaElement).value).toBe("Ship?")
    expect(onComposing).not.toHaveBeenCalledWith(false)
  })

  it("offline: refused with words, nothing sent", async () => {
    env.offline = true
    const { http } = card({ poll: undefined, composing: true })
    fill("Ship?", "Yes", "No")
    fireEvent.click(screen.getByRole("button", { name: "Start poll" }))
    expect((await screen.findByRole("alert")).textContent).toContain("You're offline: the poll wasn't started.")
    expect(http.post).not.toHaveBeenCalled()
  })

  it("on a phone it's a drawer, Cancel and Start poll in its pinned footer", async () => {
    env.mobile = true
    // A phone's sheets: the overlay mode's media query matches (components/ui/overlayMode).
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
    card({ poll: undefined, composing: true })
    const sheet = (await screen.findByRole("form", { name: "New poll" })).closest("[data-v3-sheet]")
    const foot = sheet?.querySelector<HTMLElement>("[data-sheet-footer]") as HTMLElement
    expect(foot).toBeTruthy()
    expect(within(foot).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel", "Start poll"])
  })
})
