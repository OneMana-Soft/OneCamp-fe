import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { Provider } from "react-redux"

// A DM's or group's details (chat A9): its name, its people and Add people,
// Make a private channel, Hide, and a group's Leave. A group is a fixed set of people, so Add
// people opens the group of everyone, with the history the person adding
// shares; nothing about this conversation changes.

const person = (user_uuid: string, user_name: string) => ({ user_uuid, user_name, user_profile_object_key: "" })
let present = [person("me", "Sam Rivera"), person("maya", "Maya Chen"), person("jonas", "Jonas Weber")]
let groupName = ""
const CHOICES = [
  { share: "none", messages: 0, replies: 0, shared: 0, capped: false, cap: 5000 },
  { share: "day", messages: 0, replies: 0, shared: 0, capped: false, cap: 5000 },
  { share: "week", messages: 12, replies: 3, shared: 15, capped: false, cap: 5000 },
  { share: "all", messages: 40, replies: 1, shared: 41, capped: false, cap: 5000 },
]
const { post, push, toasted, mutated } = vi.hoisted(() => ({ post: vi.fn(), push: vi.fn(), toasted: vi.fn(), mutated: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...a) }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toasted }), toast: toasted }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: (k: unknown) => { mutated(k); return Promise.resolve() }, patchCached: () => {}, dataToSeed: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url.includes("getDmParticipants")) return { data: { data: { dm_grouping_id: "grp1", dm_name: groupName || undefined, dm_participants: present } }, isLoading: false, mutate: () => {} }
    if (url.includes("share-choices")) return { data: { data: CHOICES }, isLoading: false, mutate: () => {} }
    if (url.includes("usersListWhoDontBelongToTheDM")) return { data: { users: [person("priya", "Priya Shah"), person("ali", "Ali Khan")] }, isLoading: false, mutate: () => {} }
    if (url.includes("chNameIsAvailable")) return { data: { exists: false }, isLoading: false, mutate: () => {} }
    return { data: undefined, isLoading: false, mutate: () => {} }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/app/chat/group/grp1" }))

const { default: store } = await import("@/store/store")
const { createUserChatList } = await import("@/store/slice/userSlice")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: ConversationDetailsSheet } = await import("./conversationDetailsSheet")

function sheet(place: { kind: "dm" | "group"; id: string } = { kind: "group", id: "grp1" }, adding = false) {
  return render(
    <Provider store={store}>
      <TooltipProvider>
        <ConversationDetailsSheet place={place} adding={adding} open onOpenChange={() => {}} />
      </TooltipProvider>
    </Provider>,
  )
}
const section = (name: string | RegExp) => screen.getByRole("region", { name })

function choosePriya() {
  fireEvent.click(screen.getByRole("button", { name: "Add people" }))
  fireEvent.click(screen.getByRole("combobox"))
  fireEvent.click(screen.getByRole("option", { name: /Priya Shah/ }))
}

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: { data: { kind: "group", id: "new-grp", existed: false, sharing: 15 } } })
  store.dispatch(createUserChatList({ chatUsersDm: [{ dm_grouping_id: "grp1", dm_unread: 0, dm_participants: present, dm_notification_type: "all" }] }))
})

afterEach(() => {
  cleanup()
  present = [person("me", "Sam Rivera"), person("maya", "Maya Chen"), person("jonas", "Jonas Weber")]
  groupName = ""
  push.mockReset()
  toasted.mockClear()
  mutated.mockClear()
})

describe("a group's details", () => {
  it("names it by its people until it has a name, and lists them", () => {
    sheet()
    expect(screen.getByRole("dialog", { name: "Maya Chen, Jonas Weber" })).toBeTruthy()
    expect(within(section("About")).getByText(/No name yet/)).toBeTruthy()
    expect(within(section(/People/)).getAllByText(/Sam Rivera|Maya Chen|Jonas Weber/)).toHaveLength(3)
    expect(within(section("More")).getByRole("button", { name: "Make channel" })).toBeTruthy()
    expect(within(section("More")).getByRole("button", { name: "Hide" })).toBeTruthy()
  })

  it("adds people with the history chosen, and opens the group of everyone", async () => {
    sheet()
    choosePriya()
    // Starting fresh is the default; each choice says what it would share.
    expect((screen.getByRole("radio", { name: "No, start fresh" }) as HTMLButtonElement).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText("12 messages and 3 replies")).toBeTruthy()
    expect((screen.getByRole("radio", { name: "The last day" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("radio", { name: "The last 7 days" }))
    fireEvent.click(screen.getByRole("button", { name: "Add 1 person" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/chat/group/new-grp"))
    expect(post).toHaveBeenCalledWith("/conversations/group/grp1/people", { people: ["priya"], share: "week" }, { suppressErrorToast: true })
    expect(toasted).toHaveBeenCalledWith(expect.objectContaining({ title: "Group started", description: "Sharing 15 earlier messages with them." }))
  })

  it("says why people weren't added, in the server's words, and stays open", async () => {
    post.mockRejectedValueOnce({ response: { status: 400, data: { msg: "Cannot add external users to group chats" } } })
    sheet()
    choosePriya()
    fireEvent.click(screen.getByRole("button", { name: "Add 1 person" }))
    expect((await screen.findByRole("alert")).textContent).toBe("Cannot add external users to group chats")
    expect(push).not.toHaveBeenCalled()
  })

  it("offers a private channel first from nine people, with the people chosen", () => {
    present = [person("me", "Sam Rivera"), ...["a", "b", "c", "d", "e", "f", "g"].map((x) => person(x, `Person ${x}`))]
    sheet()
    choosePriya()
    fireEvent.click(screen.getByRole("button", { name: "Make a private channel instead" }))
    expect(screen.getByLabelText("Channel name")).toBeTruthy()
    expect(screen.getByText("With Priya Shah too.")).toBeTruthy()
  })

  it("makes a private channel, its history only when asked, and opens it", async () => {
    post.mockResolvedValueOnce({ data: { data: { kind: "channel", id: "ch-9" } } })
    sheet()
    fireEvent.click(screen.getByRole("button", { name: "Make channel" }))
    fireEvent.change(screen.getByLabelText("Channel name"), { target: { value: "Launch Plan" } })
    fireEvent.click(screen.getByRole("switch", { name: "Bring this conversation's history" }))
    // The name is checked a moment after typing stops, as New channel's is.
    await waitFor(() => expect((screen.getByRole("button", { name: "Make channel" }) as HTMLButtonElement).disabled).toBe(false), { timeout: 2000 })
    fireEvent.click(screen.getByRole("button", { name: "Make channel" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/channel/ch-9"))
    expect(post).toHaveBeenCalledWith("/conversations/group/grp1/private-channel", { name: "launch-plan", people: [], copy_history: true }, { suppressErrorToast: true })
  })

  it("names the group, and the sidebar says so at once", async () => {
    post.mockResolvedValueOnce({ data: {} })
    sheet()
    fireEvent.click(screen.getByRole("button", { name: "Name group" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Launch   crew " } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/conversations/group/grp1/name", { name: "Launch crew" }, { suppressErrorToast: true }))
    await waitFor(() => expect(store.getState().users.userSidebar.userChats.find((d) => d.dm_grouping_id === "grp1")?.dm_name).toBe("Launch crew"))
  })

  it("hides it from the sidebar and leaves it, with Undo", async () => {
    post.mockResolvedValue({ data: {} })
    sheet()
    fireEvent.click(within(section("More")).getByRole("button", { name: "Hide" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/chat"))
    expect(post).toHaveBeenCalledWith("/conversations/group/grp1/hidden", { hidden: true }, { suppressErrorToast: true })
    expect(store.getState().users.userSidebar.userChats.some((d) => d.dm_grouping_id === "grp1")).toBe(false)
    const shown = toasted.mock.calls.at(-1)?.[0] as { title: string; action: { props: { onClick: () => void } } }
    expect(shown.title).toBe("Conversation hidden")
    shown.action.props.onClick()
    await waitFor(() => expect(post).toHaveBeenLastCalledWith("/conversations/group/grp1/hidden", { hidden: false }, { suppressErrorToast: true }))
    await waitFor(() => expect(mutated).toHaveBeenCalled())
  })
})

// Leaving a group (as Teams lets a group chat be left; Slack only closes
// one, which Hide is): asked in place, then out of the sidebar and away from
// the conversation. A group of three isn't left, and says why.
describe("leaving a group", () => {
  const four = () => [person("me", "Sam Rivera"), person("maya", "Maya Chen"), person("jonas", "Jonas Weber"), person("priya", "Priya Shah")]

  it("asks in place, then leaves: out of the sidebar, away from it, and says so", async () => {
    present = four()
    post.mockResolvedValue({ data: { msg: "You left the conversation." } })
    sheet()
    const danger = section("Danger zone")
    fireEvent.click(within(danger).getByRole("button", { name: "Leave conversation" }))
    expect(post).not.toHaveBeenCalled()
    const asking = screen.getByRole("group", { name: "Leave this conversation?" })
    fireEvent.click(within(asking).getByRole("button", { name: "Leave" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/conversations/group/grp1/leave", {}, { suppressErrorToast: true }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/chat"))
    expect(store.getState().users.userSidebar.userChats.some((d) => d.dm_grouping_id === "grp1")).toBe(false)
    expect(toasted).toHaveBeenCalledWith(expect.objectContaining({ title: "You left the conversation" }))
  })

  it("says the server's reason when it doesn't happen, and stays", async () => {
    present = four()
    post.mockRejectedValueOnce({ response: { status: 409, data: { msg: "A group needs at least three people, so this one can't be left." } } })
    sheet()
    fireEvent.click(within(section("Danger zone")).getByRole("button", { name: "Leave conversation" }))
    fireEvent.click(within(screen.getByRole("group", { name: "Leave this conversation?" })).getByRole("button", { name: "Leave" }))
    await waitFor(() => expect(toasted).toHaveBeenCalledWith(expect.objectContaining({
      title: "You're still in the conversation", description: "A group needs at least three people, so this one can't be left.", variant: "destructive",
    })))
    expect(push).not.toHaveBeenCalled()
    expect(store.getState().users.userSidebar.userChats.some((d) => d.dm_grouping_id === "grp1")).toBe(true)
  })

  it("isn't offered in a group of three, and says why", () => {
    sheet()
    const danger = section("Danger zone")
    expect((within(danger).getByRole("button", { name: "Leave conversation" }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(danger).getByText(/A group needs at least three people/)).toBeTruthy()
  })

  it("isn't there in a DM", () => {
    present = [person("me", "Sam Rivera"), person("maya", "Maya Chen")]
    sheet({ kind: "dm", id: "maya me" })
    expect(screen.queryByRole("region", { name: "Danger zone" })).toBeNull()
  })
})

describe("a DM's details", () => {
  it("has no name to set, and opens on Add people when asked", () => {
    present = [person("me", "Sam Rivera"), person("maya", "Maya Chen")]
    sheet({ kind: "dm", id: "maya me" }, true)
    expect(screen.getByRole("dialog", { name: "Maya Chen" })).toBeTruthy()
    expect(screen.queryByRole("region", { name: "About" })).toBeNull()
    expect(screen.getByRole("combobox")).toBeTruthy()
  })
})

// One press, one thing (interaction spec, rule 7; lib/keys/escape): Esc in a
// field that edits in place cancels the edit and leaves the details open, and
// the next press closes them. Radix hears Escape first, in the document, so
// the field's own handler came too late: one press cancelled the edit and
// closed the sheet with it.
describe("Escape in the details", () => {
  function sheetWatched() {
    const onOpenChange = vi.fn()
    render(
      <Provider store={store}>
        <TooltipProvider>
          <ConversationDetailsSheet place={{ kind: "group", id: "grp1" }} adding={false} open onOpenChange={onOpenChange} />
        </TooltipProvider>
      </Provider>,
    )
    return onOpenChange
  }

  it("cancels the group's name being set, and closes the details on the next press", () => {
    const onOpenChange = sheetWatched()
    fireEvent.click(screen.getByRole("button", { name: "Name group" }))
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" })
    expect(screen.queryByLabelText("Name")).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("cancels a private channel being named, and closes the details on the next press", () => {
    const onOpenChange = sheetWatched()
    fireEvent.click(screen.getByRole("button", { name: "Make channel" }))
    fireEvent.keyDown(screen.getByLabelText("Channel name"), { key: "Escape" })
    expect(screen.queryByLabelText("Channel name")).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
