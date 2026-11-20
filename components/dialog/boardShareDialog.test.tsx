import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// A board's share dialog on its roles (miro-32): owner, co-owners, Can edit,
// Can comment and Can view, one each. What a reader may do in it is what
// getBoardInfo offers (board_can_share, board_can_manage); the server checks
// every change and answers a refusal in words, which the dialog says.

const OWNER = { user_uuid: "u-owner", user_name: "Sam Rivera", user_full_name: "Sam Rivera" }
const ANN = { user_uuid: "u-ann", user_name: "Ann Lee", user_full_name: "Ann Lee" }
const BEA = { user_uuid: "u-bea", user_name: "Bea Park", user_full_name: "Bea Park" }
const CAL = { user_uuid: "u-cal", user_name: "Cal Moss", user_full_name: "Cal Moss" }
const DI = { user_uuid: "u-di", user_name: "Di Okafor", user_full_name: "Di Okafor" }

const hoisted = vi.hoisted(() => ({
  answers: new Map<string, unknown>(),
  me: { current: "u-owner" },
  post: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("react-redux", () => ({ useSelector: () => undefined, useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/components/guest/GuestLinkSection", () => ({
  GuestLinkSection: ({ canShare }: { canShare: boolean }) => (canShare ? <div data-guest-link-card="" /> : null),
}))
vi.mock("@/components/guest/BoardEmbedRow", () => ({ BoardEmbedRow: () => null }))
vi.mock("@/hooks/use-toast", () => ({ toast: hoisted.toast, useToast: () => ({ toast: hoisted.toast }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: hoisted.post, isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => {
  const read = (key: string) => {
    if (!key) return undefined
    for (const [k, v] of hoisted.answers) if (key.startsWith(k)) return v
    return undefined
  }
  return {
    useFetch: (key: string) => ({ data: read(key), isLoading: false, isError: undefined, mutate: vi.fn() }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: hoisted.me.current } }, isLoading: false }),
  }
})

import { BoardShareDialog } from "./boardShareDialog"
import { TooltipProvider } from "@/components/ui/tooltip"

/** The board as GET /board/getBoardPermissions answers it: Ann a co-owner (an editor too), Bea an editor, Cal a commenter, Di a viewer. */
function serve(me: string, offers: Record<string, boolean>, editorsShare?: boolean) {
  hoisted.me.current = me
  hoisted.answers.set("/board/getBoardPermissions", {
    data: {
      board_uuid: "b1",
      board_title: "Launch plan",
      board_private: true,
      board_created_by: OWNER,
      board_owning_users: [ANN],
      board_editing_users: [ANN, BEA],
      board_commenting_users: [CAL],
      board_reading_users: [DI],
      ...(editorsShare === undefined ? {} : { board_editors_share: editorsShare }),
    },
  })
  hoisted.answers.set("/board/getBoardInfo/b1", { data: { board_uuid: "b1", ...offers } })
}
const MANAGES = { board_can_share: true, board_can_manage: true }

const open = () =>
  render(
    <TooltipProvider>
      <BoardShareDialog dialogOpenState setOpenState={() => {}} boardId="b1" />
    </TooltipProvider>,
  )
const press = (el: Element) => fireEvent.keyDown(el, { key: "Enter" })
const rowOf = (name: string) => screen.getByText(name).closest("[data-share-row]") as HTMLElement
const menuItems = async () => (await screen.findAllByRole("menuitem")).map((m) => m.textContent?.trim())
const refused = (msg: string) => Object.assign(new Error("Request failed with status code 403"), { isAxiosError: true, response: { status: 403, data: { msg } } })

describe("a board's share dialog, by who opens it", () => {
  afterEach(() => {
    cleanup()
    hoisted.answers.clear()
    hoisted.post.mockReset()
    hoisted.toast.mockReset()
  })

  it("lists each person once in their one role, a co-owner as Co-owner", () => {
    serve(OWNER.user_uuid, MANAGES)
    open()
    expect(screen.getAllByText("Ann Lee")).toHaveLength(1)
    expect(within(rowOf("Ann Lee")).getByText("Co-owner")).toBeTruthy()
    expect(within(rowOf("Bea Park")).getByText("Can edit")).toBeTruthy()
    expect(within(rowOf("Cal Moss")).getByText("Can comment")).toBeTruthy()
    expect(within(rowOf("Di Okafor")).getByText("Can view")).toBeTruthy()
    expect(within(rowOf("Sam Rivera")).getByText("Owner")).toBeTruthy()
  })

  it("lets the owner make a co-owner and give Can comment, by the server's one-role rule", async () => {
    serve(OWNER.user_uuid, MANAGES)
    hoisted.post.mockResolvedValue({})
    open()
    press(screen.getByRole("button", { name: "Role: Can edit" }))
    expect(await menuItems()).toEqual(["Co-owner", "Can edit", "Can comment", "Can view"])
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }) // an open menu hides the page from the a11y tree
    press(await screen.findByRole("button", { name: "Bea Park: Can edit" }))
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: /^Co-owner/ })))
    expect(hoisted.post).toHaveBeenCalledWith(expect.objectContaining({ apiEndpoint: "/board/updateBoardPermissions", payload: { board_uuid: "b1", add_co_owners: ["u-bea"] } }))
    expect(within(rowOf("Bea Park")).getByText("Co-owner")).toBeTruthy()
    press(screen.getByRole("button", { name: "Di Okafor: Can view" }))
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: /^Can comment/ })))
    expect(hoisted.post).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { board_uuid: "b1", add_commenters: ["u-di"] } }))
  })

  it("lets the owner take a co-owner's access away whole", async () => {
    serve(OWNER.user_uuid, MANAGES)
    hoisted.post.mockResolvedValue({})
    open()
    press(screen.getByRole("button", { name: "Ann Lee: Co-owner" }))
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: "Remove access" })))
    expect(hoisted.post).toHaveBeenCalledWith(expect.objectContaining({ payload: { board_uuid: "b1", remove_co_owners: ["u-ann"], remove_editors: ["u-ann"] } }))
    expect(screen.queryByText("Ann Lee")).toBeNull()
  })

  it("gives the owner and co-owners the editors-may-share switch, on unless turned off", async () => {
    serve(OWNER.user_uuid, MANAGES)
    hoisted.post.mockResolvedValue({})
    open()
    const sw = screen.getByRole("switch", { name: "Editors can share" })
    expect(sw.getAttribute("aria-checked")).toBe("true")
    // The switch lets editors invite people, never make links (miro-33 M-4); the owner's card is there.
    expect(screen.getByText("They can invite people, up to Can edit.")).toBeTruthy()
    expect(document.querySelector("[data-guest-link-card]")).toBeTruthy()
    await act(async () => fireEvent.click(sw))
    expect(hoisted.post).toHaveBeenCalledWith(expect.objectContaining({ apiEndpoint: "/board/updateBoard", payload: { board_uuid: "b1", board_editors_share: false } }))
    expect(screen.getByRole("switch", { name: "Editors can share" }).getAttribute("aria-checked")).toBe("false")
  })

  it("lets a co-owner give the roles below co-owner, never touching a co-owner", async () => {
    serve(ANN.user_uuid, MANAGES)
    open()
    expect(screen.getByRole("switch", { name: "Editors can share" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Ann Lee:/ })).toBeNull()
    expect(within(rowOf("Ann Lee")).getByText("Co-owner")).toBeTruthy()
    press(screen.getByRole("button", { name: "Role: Can edit" }))
    expect(await menuItems()).toEqual(["Can edit", "Can comment", "Can view"])
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }) // an open menu hides the page from the a11y tree
    press(await screen.findByRole("button", { name: "Bea Park: Can edit" }))
    expect((await menuItems()).filter((t) => t !== "Remove access")).toEqual(["Can edit", "Can comment", "Can view"])
  })

  it("lets an editor invite up to Can edit while the switch is on, and change no one's access", async () => {
    serve(BEA.user_uuid, { board_can_share: true }, true)
    open()
    expect(screen.queryByRole("switch", { name: "Editors can share" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Di Okafor:/ })).toBeNull()
    // miro-33 M-4: links are the owner's and co-owners' alone; the server refuses an editor's.
    expect(document.querySelector("[data-guest-link-card]")).toBeNull()
    press(screen.getByRole("button", { name: "Role: Can edit" }))
    expect(await menuItems()).toEqual(["Can edit", "Can comment", "Can view"])
  })

  it("tells an editor sharing is off, with no invite and no guest link, when the switch is off", () => {
    serve(BEA.user_uuid, {}, false)
    open()
    expect(screen.getByText("The board's owner has turned off sharing by editors.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Role:/ })).toBeNull()
    expect(document.querySelector("[data-guest-link-card]")).toBeNull()
    expect(screen.queryByRole("switch")).toBeNull()
  })

  it("says a refusal in the server's words, and puts the role back", async () => {
    serve(OWNER.user_uuid, MANAGES)
    hoisted.post.mockRejectedValue(refused("Only the board's owner can make or remove co-owners."))
    open()
    press(screen.getByRole("button", { name: "Di Okafor: Can view" }))
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: /^Can edit/ })))
    await waitFor(() => expect(hoisted.toast).toHaveBeenCalled())
    expect(hoisted.toast.mock.calls[0][0]).toMatchObject({ title: "Couldn't change their access", description: "Only the board's owner can make or remove co-owners.", variant: "destructive" })
    expect(within(rowOf("Di Okafor")).getByText("Can view")).toBeTruthy()
  })

  it("says an invite's refusal in the server's words under the field (the switch went off meanwhile)", async () => {
    serve(BEA.user_uuid, { board_can_share: true }, true)
    const EVE = { user_uuid: "u-eve", user_name: "Eve Stone", user_full_name: "Eve Stone" }
    hoisted.post.mockImplementation(({ apiEndpoint }: { apiEndpoint: string }) =>
      apiEndpoint === "/board/searchUsers" ? Promise.resolve([EVE]) : Promise.reject(refused("The board's owner has turned off sharing by editors.")),
    )
    open()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Eve" } })
    fireEvent.click(await screen.findByRole("option", { name: /Eve Stone/ }, { timeout: 2000 }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Invite/ })))
    expect((await screen.findByRole("alert")).textContent).toBe("The board's owner has turned off sharing by editors.")
    expect(hoisted.post).toHaveBeenCalledWith(expect.objectContaining({ payload: { board_uuid: "b1", add_editors: ["u-eve"] } }))
  })

  it("says the switch's refusal in the server's words, and puts it back", async () => {
    serve(OWNER.user_uuid, MANAGES)
    hoisted.post.mockRejectedValue(refused("Only the board's owner and co-owners can change that."))
    open()
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Editors can share" })))
    expect(hoisted.toast.mock.calls[0][0]).toMatchObject({ description: "Only the board's owner and co-owners can change that." })
    expect(screen.getByRole("switch", { name: "Editors can share" }).getAttribute("aria-checked")).toBe("true")
  })
})
