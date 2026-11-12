import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { UnifiedActivityItem } from "@/types/activity"
import { pinTestClock } from "@/lib/testing/testClock"

/*
 * An Inbox row's "Why am I seeing this?" (A4 H3): only for an item about a
 * chat message, it asks GET /notify/why/{message} for the asker's own record
 * and words it with the place the row already names.
 */

type Read = { data?: unknown; isLoading?: boolean; isError?: unknown; mutate: () => void }
const reads = vi.hoisted(() => ({ asked: [] as string[], configs: [] as unknown[], options: [] as unknown[], next: null as null | Read }))
const swr = vi.hoisted(() => ({ forgot: [] as string[] }))
vi.mock("swr", async (original) => ({ ...(await original<object>()), useSWRConfig: () => ({ cache: { delete: (key: string) => swr.forgot.push(key) } }) }))
const net = vi.hoisted(() => ({ offline: false }))
vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string, _schema: unknown, options: unknown, request: unknown) => {
    if (!url) return { data: undefined }
    reads.asked.push(url)
    reads.configs.push(request)
    reads.options.push(options)
    return reads.next ?? { isLoading: true, mutate: () => {} }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/connectivity", async (original) => ({ ...(await original<object>()), isAppOffline: () => net.offline }))

import { ActivityCard } from "@/components/activity/activityCard"
import { whyMessageId } from "@/components/activity/WhyAmISeeingThis"

beforeEach(() => {
  reads.asked = []
  reads.configs = []
  reads.options = []
  swr.forgot = []
  reads.next = null
  net.offline = false
})
afterEach(cleanup)
pinTestClock()

const at = "2026-10-10T10:00:00Z"
const inChannel = {
  activity_type: "MENTION",
  time: at,
  mention: {
    mention_created_at: at,
    mention_post_uuid: "p1",
    mention_post: { post_uuid: "p1", post_text: "Can you look at the rollback steps?", post_channel: { ch_uuid: "c1", ch_name: "launch" }, post_by: { user_uuid: "u-jonas", user_name: "Jonas Weber" } },
  },
} as unknown as UnifiedActivityItem
const inDM = {
  activity_type: "MENTION",
  time: at,
  mention: { mention_created_at: at, mention_chat_uuid: "m1", mention_chat: { chat_uuid: "m1", chat_body_text: "hi", chat_from: { user_uuid: "u-jonas", user_name: "Jonas Weber" } } },
} as unknown as UnifiedActivityItem
const reacted = (target: object) => ({ activity_type: "REACTION", time: at, reaction: { reaction_emoji_id: "+1", ...target } }) as unknown as UnifiedActivityItem
const inTask = {
  activity_type: "MENTION",
  time: at,
  mention: { mention_created_at: at, mention_task: { task_uuid: "t1", task_name: "Ship it" } },
} as unknown as UnifiedActivityItem
const inComment = {
  activity_type: "MENTION",
  time: at,
  mention: { mention_created_at: at, mention_comment_uuid: "k1", mention_comment: { comment_uuid: "k1", comment_text: "see" } },
} as unknown as UnifiedActivityItem

const whyButton = () => screen.queryByRole("button", { name: "Why am I seeing this?" })

describe("which Inbox items say why", () => {
  it("an item about a chat message names its message; anything else has none", () => {
    expect(whyMessageId(inChannel)).toBe("p1")
    expect(whyMessageId(inDM)).toBe("m1")
    expect(whyMessageId(reacted({ post: { post_uuid: "p2" } }))).toBe("p2")
    expect(whyMessageId(reacted({ chat: { chat_uuid: "m2" } }))).toBe("m2")
    expect(whyMessageId(reacted({ comment: { comment_uuid: "k2" }, post: { post_uuid: "p2" } }))).toBeNull()
    expect(whyMessageId(inTask)).toBeNull()
    expect(whyMessageId(inComment)).toBeNull()
    expect(whyMessageId({ activity_type: "COMMENT", time: at, comment: { comment_uuid: "k3" } } as unknown as UnifiedActivityItem)).toBeNull()
    expect(whyMessageId({ activity_type: "NOTICE", time: at, notice: { kind: "doc.shared" } } as unknown as UnifiedActivityItem)).toBeNull()
  })

  it("a row about a chat message has Why am I seeing this? in its menu; a row about a task has none", () => {
    render(<ActivityCard activity={inChannel} />)
    expect(whyButton()).toBeInTheDocument()
    expect(whyButton()?.closest(".hub-row-tools")).not.toBeNull()
    cleanup()
    render(<ActivityCard activity={inTask} />)
    expect(whyButton()).toBeNull()
  })
})

describe("Why am I seeing this?", () => {
  it("asks for nothing until it opens, then for its own message's record, saying failures itself", async () => {
    render(<ActivityCard activity={inChannel} />)
    expect(reads.asked).toEqual([])
    fireEvent.click(whyButton()!)
    expect(reads.asked[0]).toBe("/notify/why/p1")
    expect(reads.configs[0]).toEqual(expect.objectContaining({ suppressErrorToast: true }))
    expect(await screen.findByText("Looking it up…")).toBeInTheDocument()
  })

  // Main's ruling (9 Nov): the row carries the door alone, and the panel comes with the notifications settings' chunk.
  it("is a door that names its panel while it is open, and has the focus back when Escape closes it", async () => {
    render(<ActivityCard activity={inChannel} />)
    const door = whyButton()!
    expect(door.getAttribute("aria-haspopup")).toBe("dialog")
    expect(door.getAttribute("aria-expanded")).toBe("false")
    expect(door.hasAttribute("aria-controls")).toBe(false)
    door.focus()
    fireEvent.click(door)
    const panel = await screen.findByRole("dialog")
    expect(door.getAttribute("aria-expanded")).toBe("true")
    expect(door.getAttribute("aria-controls")).toBe(panel.id)
    fireEvent.keyDown(panel, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(door.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(door)
  })

  // A record changes as a message is deleted or a rule moves: each open asks again, and a closed panel's answer goes
  // with it, so an open at once after a close shows Looking it up, never the last answer.
  it("asks again on every open, and forgets the answer when it closes", async () => {
    render(<ActivityCard activity={inChannel} />)
    const door = whyButton()!
    fireEvent.click(door)
    const panel = await screen.findByRole("dialog")
    expect(reads.options[0]).toEqual(expect.objectContaining({ dedupingInterval: 0 }))
    expect(swr.forgot).toEqual([])
    fireEvent.keyDown(panel, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(swr.forgot).toEqual(["/notify/why/p1"])
  })

  // A press on the open door is the door's: Radix's outside press is kept off it, so the press closes and never reopens.
  it("pressing its open door closes the panel and gives the door the focus", async () => {
    render(<ActivityCard activity={inChannel} />)
    const door = whyButton()!
    door.focus()
    fireEvent.click(door)
    await screen.findByRole("dialog")
    await new Promise((r) => setTimeout(r, 0)) // Radix hears outside presses from the next tick
    fireEvent.pointerDown(door)
    fireEvent.click(door)
    expect(door.getAttribute("aria-expanded")).toBe("false")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(door)
  })

  it("words the record with the row's own place", async () => {
    reads.next = {
      data: {
        events: [
          {
            user_id: "me",
            event_id: "e1",
            steps: [
              { step: "audience", verdict: "in", causes: ["chat.mention"] },
              { step: "access", verdict: "in_place" },
              { step: "hold", verdict: "not_held" },
            ],
            decision: { user_id: "me", cause: "chat.mention", to: ["inbox", "push"] },
            deliveries: [{ delivery: "push", state: "sent", at }],
          },
        ],
      },
      mutate: () => {},
    }
    render(<ActivityCard activity={inChannel} />)
    fireEvent.click(whyButton()!)
    const root = (await screen.findByText("Because you were mentioned.")).closest<HTMLElement>("[role=dialog]")!
    expect(within(root).getByText("You're in #launch.")).toBeInTheDocument()
  })

  it("a 404 says there's no record", async () => {
    reads.next = { isError: { isAxiosError: true, response: { status: 404, data: { code: "no_record", msg: "x" } } }, mutate: () => {} }
    render(<ActivityCard activity={inDM} />)
    fireEvent.click(whyButton()!)
    expect(await screen.findByText("There's no record of how this reached you.")).toBeInTheDocument()
  })

  it("offline with no answer says offline; a failure says so and Try again asks again", async () => {
    net.offline = true
    reads.next = { isLoading: true, mutate: () => {} }
    render(<ActivityCard activity={inDM} />)
    fireEvent.click(whyButton()!)
    expect(await screen.findByText("Connect, then try again.")).toBeInTheDocument()
    cleanup()
    net.offline = false
    const mutate = vi.fn()
    reads.next = { isError: { isAxiosError: true, response: { status: 503, data: { msg: "x" } } }, mutate }
    render(<ActivityCard activity={inDM} />)
    fireEvent.click(whyButton()!)
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
