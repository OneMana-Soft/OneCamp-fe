/**
 * V-1023: a doc's thread list names a bot by the name it goes by. A bot made
 * before bots took their name as user_name has its login handle there
 * ("standup-helper"); its name is its user_full_name ("Standup Helper"), as every
 * other surface shows it (lib/utils/userDisplayName). People keep the one
 * name rule (lib/personName): their display name, even with a full name.
 */
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ThreadView } from "@/components/threads/types"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

vi.mock("@/components/docFiles/NodeLink", () => ({
    NodeLink: ({ children, href, prefetch: _p, ...rest }: React.ComponentProps<"a"> & { href: string; prefetch?: boolean }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}))
vi.mock("@/components/channel/channelMessageAvatar", () => ({
    ChannelMessageAvatar: ({ userName, isBot }: { userName: string; isBot: boolean }) => <span data-avatar={userName} data-bot={String(isBot)} />,
}))

// The comment rows are shared with chat: here they only say whose name they were given.
vi.mock("@/components/rightPanel/messageContent", () => ({
    MessageContent: ({ userInfo }: { userInfo: { user_name: string } }) => <p data-row="card">{userInfo.user_name}</p>,
}))
vi.mock("@/components/mobileMessage/mobileMessage", () => ({
    MobileMessage: ({ userInfo }: { userInfo: { user_name: string } }) => <p data-row="page">{userInfo.user_name}</p>,
}))
vi.mock("./CommentComposer", () => ({ CommentComposer: () => null }))
vi.mock("./ThreadTaskAction", () => ({ ThreadTaskAction: () => null }))
vi.mock("react-redux", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-redux")>()), useDispatch: () => () => undefined }))

const { ThreadRow } = await import("./ThreadRow")
const { ThreadCard } = await import("./ThreadCard")
const { ThreadsToolbar } = await import("./ThreadsPanelParts")

const OLD_BOT = { user_uuid: "u-bot", user_name: "standup-helper", user_full_name: "Standup Helper", is_bot: true, user_profile_object_key: "" }
const PERSON = { user_uuid: "u-sam", user_name: "sam", user_full_name: "Sam Rivera", user_profile_object_key: "" }

const thread = (by: object): ThreadView =>
    ({
        id: "t1",
        resource_kind: "doc",
        resource_uuid: "d1",
        anchor: { kind: "yrange", start: "AQ==", end: "Ag==", quote: "the launch plan" },
        status: "open",
        created_by: "u-bot",
        created_at: "2026-10-12T09:00:00Z",
        updated_at: "2026-10-12T09:00:00Z",
        comments: [{ comment_uuid: "c1", thread_id: "t1", comment_text: "<p>Done</p>", comment_by: by, comment_created_at: "2026-10-12T09:00:00Z" }],
        participants: [],
        unread: false,
        can_reply: true,
        can_resolve: true,
    }) as unknown as ThreadView

afterEach(cleanup)

describe("a doc's thread list names a bot by its name (V-1023)", () => {
    it("an older bot's row says Standup Helper, not its handle", () => {
        const { container } = render(<ThreadRow docId="d1" thread={thread(OLD_BOT)} />)
        expect(screen.getByText("Standup Helper")).toBeTruthy()
        expect(screen.queryByText("standup-helper")).toBeNull()
        expect(container.querySelector("[data-avatar]")?.getAttribute("data-avatar")).toBe("Standup Helper")
    })

    it("a person's row keeps the one name rule", () => {
        render(<ThreadRow docId="d1" thread={thread({ ...PERSON, is_bot: false })} />)
        expect(screen.getByText("sam")).toBeTruthy()
        expect(screen.queryByText("Sam Rivera")).toBeNull()
    })

    it("the person filter names the older bot by its name, a person by the one rule", () => {
        render(
            <ThreadsToolbar tab="open" onTab={() => {}} counts={{ open: 2, resolved: 0 }} people={[PERSON, OLD_BOT]} person="u-bot" onPerson={() => {}} />,
        )
        expect(screen.getByRole("button", { name: "Whose threads: Standup Helper" })).toBeTruthy()
        cleanup()
        render(
            <ThreadsToolbar tab="open" onTab={() => {}} counts={{ open: 2, resolved: 0 }} people={[PERSON, OLD_BOT]} person="u-sam" onPerson={() => {}} />,
        )
        expect(screen.getByRole("button", { name: "Whose threads: sam" })).toBeTruthy()
    })
})

describe("a doc's comment names an older bot by its name (V-1023)", () => {
    it.each([false, true])("on the card and the phone's thread page (page %s)", (page) => {
        render(<ThreadCard docId="d1" thread={thread(OLD_BOT)} actions={{} as never} page={page} />)
        expect(screen.getByText("Standup Helper", { selector: "p[data-row]" })).toBeTruthy()
        expect(screen.queryByText("standup-helper")).toBeNull()
    })

    it("a person's comment keeps the name it came with", () => {
        render(<ThreadCard docId="d1" thread={thread({ ...PERSON, is_bot: false })} actions={{} as never} />)
        expect(screen.getByText("sam", { selector: "p[data-row]" })).toBeTruthy()
        expect(screen.queryByText("Sam Rivera")).toBeNull()
    })
})
