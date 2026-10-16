import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, renderHook } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import type { ReactNode } from "react"

// The bot list hasn't heard of this agent yet (it was made after the list was
// read), so only the typing message can say what it is.
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}) }))

const { useTypingHandlers } = await import("./useTypingHandlers")
const { default: typingSlice, pruneStaleTyping } = await import("@/store/slice/typingSlice")
const { ChannelTypingBar } = await import("@/components/typingIndicator/typingIndicatorBar")
const { TYPING_EXPIRY_MS, TYPING_REPEAT_MS, TYPING_STALE_MS } = await import("@/lib/typingTiming")

const AGENT = { user_uuid: "rc", user_name: "Release Captain", user_profile: "rc.png", is_bot: true, user_bot_kind: "agent" }
const MAYA = { user_uuid: "maya", user_name: "Maya Chen", user_profile: "maya.png" }
const inChannel = (who: object) => JSON.stringify({ type: 3, data: { ...who, channel_uuid: "c1" } })
const inChat = (who: object, grp: string) => JSON.stringify({ type: 7, data: { ...who, chat_grp_id: grp } })

function setup(expiryMs = TYPING_EXPIRY_MS) {
    const store = configureStore({ reducer: { typing: typingSlice.reducer } })
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const connectionConfig = { wsUrl: "", wsPort: 0, reconnectInterval: 1000, maxReconnectAttempts: 1, typingTimeout: expiryMs }
    const typingTimeouts = new Map()
    const { result } = renderHook(() => useTypingHandlers({ connectionConfig, userUuid: "me", typingTimeouts }), { wrapper })
    return { store, wrapper, handlers: result.current }
}

/**
 * An agent says it is typing every repeatMs for a minute, every other message
 * arriving lateMs late (the worst order for a gap), while the sweep for a
 * slept tab runs every 2 s as the provider runs it. Returns when the line was
 * first found down, checked every 100 ms before that instant's message lands,
 * or null if it never was.
 */
function firstDrop(expiryMs: number, repeatMs: number, lateMs: number): number | null {
    const { store, handlers } = setup(expiryMs)
    const up = () => (store.getState().typing.channelTyping.c1 ?? []).some((t) => t.userId === "rc")
    const arrivals = new Set<number>()
    for (let sent = repeatMs, n = 1; sent < 60_000; sent += repeatMs, n++) arrivals.add(sent + (n % 2 ? lateMs : 0))
    handlers.handleChannelTyping(inChannel(AGENT))
    for (let now = 100; now <= 60_000; now += 100) {
        vi.advanceTimersByTime(100)
        if (!up()) return now
        if (arrivals.has(now)) handlers.handleChannelTyping(inChannel(AGENT))
        if (now % 2000 === 0) store.dispatch(pruneStaleTyping({ ttlMs: TYPING_STALE_MS }))
    }
    return null
}

describe("typing messages", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    it("carry a bot's kind into the typing line, and nothing for a person", () => {
        const { store, handlers } = setup()
        handlers.handleChannelTyping(inChannel(AGENT))
        handlers.handleChannelTyping(inChannel(MAYA))
        handlers.handleChatTyping(inChat(AGENT, "g1"))
        handlers.handleChatTyping(inChat(AGENT, "me rc"))
        const { channelTyping, groupChatTyping, chatTyping } = store.getState().typing
        const agent = { user_uuid: "rc", user_name: "Release Captain", user_profile_object_key: "rc.png", is_bot: true, user_bot_kind: "agent" }
        expect(channelTyping.c1.map((t) => t.user)).toEqual([agent, { user_uuid: "maya", user_name: "Maya Chen", user_profile_object_key: "maya.png" }])
        expect(groupChatTyping.g1[0].user).toEqual(agent)
        expect(chatTyping.rc[0].user).toEqual(agent)
    })

    it("say an agent at work is working, and a person is typing", () => {
        const { handlers, wrapper } = setup()
        handlers.handleChannelTyping(inChannel(AGENT))
        const view = render(<ChannelTypingBar channelId="c1" />, { wrapper })
        expect(view.container.textContent).toContain("Release Captain is working")

        const other = setup()
        other.handlers.handleChannelTyping(inChannel(MAYA))
        const person = render(<ChannelTypingBar channelId="c1" />, { wrapper: other.wrapper })
        expect(person.container.textContent).toContain("Maya Chen is typing")
    })

    it("keep a steady agent's line up between messages, even one arriving late", () => {
        // Said every 3 s (the API's TypingRepublishInterval), lasting 6 s.
        expect(TYPING_EXPIRY_MS).toBeGreaterThanOrEqual(2 * TYPING_REPEAT_MS)
        expect(firstDrop(TYPING_EXPIRY_MS, TYPING_REPEAT_MS, 2000)).toBeNull()
        // At 4 s each way, as it was, the line blinked out between messages.
        expect(firstDrop(4000, 4000, 0)).toBe(4000)
    })

    it("drop the line one expiry after the agent's last message", () => {
        const { store, handlers } = setup()
        const up = () => (store.getState().typing.channelTyping.c1 ?? []).length > 0
        handlers.handleChannelTyping(inChannel(AGENT))
        vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1)
        expect(up()).toBe(true)
        vi.advanceTimersByTime(1)
        expect(up()).toBe(false)
    })
})
