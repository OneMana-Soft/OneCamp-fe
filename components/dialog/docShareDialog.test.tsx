import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import type { DocAccess, DocAccessRequest } from "@/types/docAccess"

// The share dialog on A5's levels (B6): what each person may do in it is what
// the server said (GET /doc/access), and what it changes shows at once and
// stays shown while the server answers (N49).

const OWNER = { user_uuid: "u-owner", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const BEA = { user_uuid: "u-bea", user_name: "Bea Park", user_full_name: "Bea Park" }
const DI = { user_uuid: "u-di", user_name: "Di Okafor", user_full_name: "Di Okafor" }

const hoisted = vi.hoisted(() => ({
  answers: new Map<string, unknown>(),
  me: { current: { user_uuid: "u-owner" } as { user_uuid: string } },
  update: vi.fn(),
  invite: vi.fn(),
  preview: vi.fn(),
  answer: vi.fn(),
}))

vi.mock("react-redux", () => ({ useSelector: () => undefined, useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/components/docEditor/registry/gate", () => ({ useEditionGate: () => ({ ai: false }) }))
vi.mock("@/components/guest/GuestLinkSection", () => ({
  GuestLinkSection: ({ canShare }: { canShare: boolean }) => (canShare ? <div data-guest-link-card="" /> : null),
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: () => Promise.resolve(), patchCached: () => {} }))
vi.mock("@/lib/docCache", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/docCache")>()), docShared: () => {} }))
vi.mock("@/hooks/useFetch", () => {
  const read = (key: string) => {
    if (!key) return undefined
    let best: [string, unknown] | null = null
    for (const [k, v] of hoisted.answers) if (key.startsWith(k) && (!best || k.length > best[0].length)) best = [k, v]
    return best?.[1]
  }
  return {
    useFetch: (key: string) => ({ data: read(key), isLoading: false, isError: undefined, mutate: vi.fn() }),
    useFetchOnlyOnce: () => ({ data: { data: hoisted.me.current }, isLoading: false }),
  }
})
vi.mock("@/services/docAccessService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/docAccessService")>()),
  updateDocAccess: hoisted.update,
  previewDocAccess: hoisted.preview,
  answerDocAccess: hoisted.answer,
}))
vi.mock("@/services/docChromeService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/docChromeService")>()),
  inviteToDoc: hoisted.invite,
  searchPeople: () => Promise.resolve([{ user_uuid: "u-di", user_name: "Di Okafor", user_full_name: "Di Okafor" }]),
}))

import { DocShareDialog, audienceOf, sharingAfter } from "./docShareDialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { registerPanel } from "@/components/docEditor/registry/registry"

function accessFor(level: DocAccess["level"], withSharing = true): DocAccess {
  return {
    doc_uuid: "d1",
    level,
    owner: level === "full" && hoisted.me.current.user_uuid === OWNER.user_uuid,
    lock: "",
    locked: false,
    can_share: level === "full",
    can_lock_soft: level === "edit" || level === "full",
    can_lock_hard: level === "full",
    sharing: withSharing
      ? {
          owner: OWNER,
          people: [{ ...BEA, level: "edit" }],
          teams: [],
          general: { private: true, level: "view" },
          everyone: "none",
        }
      : undefined,
  }
}

function serve(access: DocAccess, extra: Record<string, unknown> = {}) {
  hoisted.answers.clear()
  hoisted.answers.set("/doc/access/requests", { data: { incoming: [], outgoing: [] } })
  hoisted.answers.set("/doc/access/", { data: access })
  hoisted.answers.set("/doc/getDocInfo/", { data: { doc_title: "Launch plan" } })
  for (const [k, v] of Object.entries(extra)) hoisted.answers.set(k, v)
}

const dialog = () => (
  <TooltipProvider>
    <DocShareDialog dialogOpenState setOpenState={() => {}} docId="d1" />
  </TooltipProvider>
)

/** Opens a Radix menu from its trigger, as the keyboard does. */
const press = (el: Element) => fireEvent.keyDown(el, { key: "Enter" })

beforeEach(() => {
  hoisted.me.current = OWNER
  hoisted.update.mockReset().mockResolvedValue({ effects: [], pages: 1, lose: 0, gain: 0, change: 0, summary: "" })
  hoisted.invite.mockReset().mockResolvedValue({ effects: [], pages: 1, lose: 0, gain: 1, change: 0, summary: "" })
  hoisted.preview.mockReset()
  hoisted.answer.mockReset().mockResolvedValue({})
})
afterEach(cleanup)

describe("a doc's share dialog", () => {
  it("gives full access everything: invites up to Full access, levels to change, guest links, and says changes are recorded", async () => {
    serve(accessFor("full"))
    render(dialog())
    expect(screen.getByRole("combobox", { name: "Add people or teams" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Bea Park: Can edit" })).toBeTruthy()
    expect(document.querySelector("[data-guest-link-card]")).not.toBeNull()
    expect(screen.getByText("Sharing changes are recorded.")).toBeTruthy()
    press(document.querySelector("[data-share-invite-level]")!)
    expect(await screen.findByText("Full access")).toBeTruthy()
  })

  it("lets an editor invite, up to Can edit, and change nothing else", async () => {
    hoisted.me.current = BEA
    serve(accessFor("edit"))
    render(dialog())
    expect(screen.getByRole("combobox", { name: "Add people or teams" })).toBeTruthy()
    // Levels are text, not menus; no general access menu; no guest links.
    expect(screen.queryByRole("button", { name: /Bea Park: / })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Everyone in the workspace: / })).toBeNull()
    expect(document.querySelector("[data-guest-link-card]")).toBeNull()
    press(document.querySelector("[data-share-invite-level]")!)
    await screen.findByText("Can comment")
    expect(document.querySelector('[data-level="full"]')).toBeNull()
  })

  it("sends an editor's invite as an invite, never as a change to the sharing", async () => {
    hoisted.me.current = BEA
    serve(accessFor("edit"))
    render(dialog())
    fireEvent.change(screen.getByRole("combobox", { name: "Add people or teams" }), { target: { value: "di" } })
    fireEvent.click(await screen.findByRole("option", { name: /Di Okafor/ }, { timeout: 2000 }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Invite" })))
    expect(hoisted.invite).toHaveBeenCalledWith({ doc_uuid: "d1", adds: [{ kind: "user", uuid: "u-di", level: "edit" }] })
    expect(hoisted.update).not.toHaveBeenCalled()
  })

  it("tells a reader who to ask, and shows them nobody", () => {
    hoisted.me.current = DI
    serve(accessFor("view", false))
    render(dialog())
    expect(document.querySelector("[data-share-reader]")).not.toBeNull()
    expect(screen.queryByRole("combobox", { name: "Add people or teams" })).toBeNull()
    expect(screen.queryByText("Bea Park")).toBeNull()
  })

  it("shows a change at once and keeps it while the server answers, whatever a refresh says (N49)", async () => {
    serve(accessFor("full"))
    let done: (v: unknown) => void = () => {}
    hoisted.update.mockReturnValueOnce(new Promise((r) => (done = r)))
    const view = render(dialog())
    press(screen.getByRole("button", { name: "Bea Park: Can edit" }))
    await act(async () => fireEvent.click(await screen.findByText("Can view")))
    expect(screen.getByRole("button", { name: "Bea Park: Can view" })).toBeTruthy()
    // A refresh in flight still has the old level: the dialog keeps the new one.
    view.rerender(dialog())
    expect(screen.getByRole("button", { name: "Bea Park: Can view" })).toBeTruthy()
    expect(hoisted.update).toHaveBeenCalledWith({ doc_uuid: "d1", adds: [{ kind: "user", uuid: "u-bea", level: "view", until: undefined }] })
    // The server's answer is in the cache: the dialog reads it from there.
    const after = accessFor("full")
    after.sharing!.people = [{ ...BEA, level: "view" }]
    serve(after)
    await act(async () => done({ effects: [], pages: 1, lose: 0, gain: 0, change: 1, summary: "" }))
    view.rerender(dialog())
    expect(screen.getByRole("button", { name: "Bea Park: Can view" })).toBeTruthy()
  })

  it("asks before making it private when it has guest links (D-8), and turns them off when told", async () => {
    const a = accessFor("full")
    a.sharing!.general = { private: false, level: "view" }
    serve(a, { "/guest": { data: [{ id: "g1", capability: "view", expires_at: null, created_at: "", mine: true }] } })
    hoisted.preview.mockResolvedValue({ effects: [], pages: 1, lose: 4, gain: 0, change: 0, summary: "4 people lose access." })
    render(dialog())
    const card = document.querySelector("[data-access-card]") as HTMLElement
    press(within(card).getByText("Everyone in the workspace"))
    await act(async () => fireEvent.click(await screen.findByText("Only people added")))
    expect(await screen.findByText("4 people lose access.")).toBeTruthy()
    expect(screen.getByText(/a guest link for people outside the workspace/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn them off" })))
    expect(hoisted.update).toHaveBeenCalledWith({ doc_uuid: "d1", general: { level: "none" }, guest_links: "revoke" })
  })

  // Batch 16 audit (B6): a failed preview made the change without asking, and
  // guest links that couldn't be read skipped D-8's question, so the server
  // turned them off by default. Both now fail closed.
  it("asks anyway when who it reaches couldn't be checked", async () => {
    const a = accessFor("full")
    a.sharing!.general = { private: false, level: "edit" }
    serve(a, { "/guest": { data: [] } })
    hoisted.preview.mockRejectedValue({ response: { status: 503, data: {} } })
    render(dialog())
    press(screen.getByRole("button", { name: "Everyone in the workspace: Can edit" }))
    await act(async () => fireEvent.click(await screen.findByText("Can view")))
    expect(await screen.findByText("Couldn't check who gains or loses access.")).toBeTruthy()
    expect(hoisted.update).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Change it" })))
    expect(hoisted.update).toHaveBeenCalledWith({ doc_uuid: "d1", general: { private: false, level: "view" } })
  })

  // DESIGN-BUILD-6, 22 Oct: the general access level's menu marked no level.
  it("marks the level everyone in the workspace has, in its menu", async () => {
    const a = accessFor("full")
    a.sharing!.general = { private: false, level: "comment" }
    serve(a)
    render(dialog())
    press(screen.getByRole("button", { name: "Everyone in the workspace: Can comment" }))
    const check = async (level: string) => (await screen.findByRole("menuitem", { name: new RegExp(`^${level}`) })).querySelector("[data-menu-check]")?.getAttribute("data-menu-check")
    expect(await check("Can comment")).toBe("on")
    expect(await check("Can edit")).toBe("off")
    expect(await check("Can view")).toBe("off")
    expect((await screen.findByRole("menuitem", { name: /^Can comment/ })).getAttribute("aria-current")).toBe("true")
  })

  it("asks about guest links it couldn't read before making it private, and keeps them when told", async () => {
    const a = accessFor("full")
    a.sharing!.general = { private: false, level: "view" }
    serve(a) // the guest links never arrive
    hoisted.preview.mockResolvedValue({ effects: [], pages: 1, lose: 0, gain: 0, change: 0, summary: "" })
    render(dialog())
    const card = document.querySelector("[data-access-card]") as HTMLElement
    press(within(card).getByText("Everyone in the workspace"))
    await act(async () => fireEvent.click(await screen.findByText("Only people added")))
    expect(await screen.findByText(/guest links for people outside the workspace couldn't be checked/)).toBeTruthy()
    expect(hoisted.update).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Keep the links" })))
    expect(hoisted.update).toHaveBeenCalledWith({ doc_uuid: "d1", general: { level: "none" }, guest_links: "keep" })
  })

  it("answers a request from its inbox, at the level chosen", async () => {
    const req: DocAccessRequest = { id: "r1", doc_uuid: "d1", requester: DI, level_wanted: "comment", note: "For the launch", status: "pending", created_at: "" }
    serve(accessFor("full"), { "/doc/access/requests": { data: { incoming: [req], outgoing: [] } } })
    render(dialog())
    expect(screen.getByText("1 person asked for access")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve" })))
    expect(hoisted.answer).toHaveBeenCalledWith(req, { approve: true, level: "comment" })
  })

  it("has no tabs: publishing lives in the link card; its footer copies the doc's own link", () => {
    serve(accessFor("full"))
    registerPanel({ kind: "doc.publish", title: "Publish", edition: "both", load: () => Promise.resolve({ default: () => null }) })
    render(dialog())
    expect(screen.queryByRole("tab")).toBeNull()
    expect(screen.getByRole("button", { name: "Copy doc link" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull()
  })
})

describe("the dialog's own copy of the sharing", () => {
  it("follows a change as the server will make it", () => {
    const s = accessFor("full").sharing!
    const added = sharingAfter(s, { adds: [{ kind: "user", uuid: "u-di", level: "comment" }] }, new Map([["u-di", DI]]))
    expect(added.people.map((p) => [p.user_uuid, p.level, p.user_full_name])).toEqual([
      ["u-bea", "edit", "Bea Park"],
      ["u-di", "comment", "Di Okafor"],
    ])
    expect(sharingAfter(s, { removes: [{ kind: "user", uuid: "u-bea" }] }).people).toEqual([])
    expect(sharingAfter(s, { adds: [{ kind: "team", uuid: "t1", level: "full" }] }, new Map(), new Map([["t1", { name: "Design", members: 3 }]])).teams).toEqual([
      { team_uuid: "t1", team_name: "Design", members: 3, level: "edit", until: undefined },
    ])
    expect(sharingAfter(s, { general: { level: "none" } }).general).toEqual({ private: true, level: "view" })
    expect(sharingAfter(s, { general: { private: false, level: "edit" } }).general).toEqual({ private: false, level: "edit" })
  })

  it("names who general access reaches", () => {
    expect(audienceOf({ private: true, level: "view" })).toBe("private")
    expect(audienceOf({ private: true, level: "edit" }, { kind: "project", uuid: "p", name: "Apollo", members: 4 })).toBe("space")
    expect(audienceOf({ private: false, level: "comment" })).toBe("workspace")
  })
})
