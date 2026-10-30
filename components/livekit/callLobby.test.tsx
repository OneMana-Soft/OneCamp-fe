import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react"

// CALLS-2: whoever may let people in sees who waits, in the People panel and
// in a bar docked above the dock while the panel is closed; nobody else
// sees either. One orange action in sight.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

import CallPeoplePanel from "./CallPeoplePanel"
import { KnockBar } from "./KnockBar"
import { useKnockBar } from "./callHosting"
import type { CallAbility } from "@/lib/calls/control"

afterEach(cleanup)

const host = (can: CallAbility[] = ["admit"]) => ({ identity: "sam", role: "host" as const, can: new Set(can) })
const now = new Date().toISOString()
const priya = { ticket: "t1", name: "Priya", knocked_at: now }
const jonas = { ticket: "t2", name: "Jonas Weber", knocked_at: new Date(Date.now() - 5 * 60_000).toISOString() }

describe("the People panel's lobby", () => {
  it("lists who waits, with how long, above the call's people", () => {
    render(<CallPeoplePanel people={[]} onClose={vi.fn()} me={host()} onAction={vi.fn()} lobby={[priya, jonas]} onLobbyAction={vi.fn()} />)
    const section = screen.getByRole("region", { name: /Waiting to join/ })
    expect(section.textContent).toMatch(/Waiting to join\s*2/)
    const rows = within(section).getAllByRole("listitem")
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Knocked just now"), expect.stringContaining("Waiting 5 min")])
  })

  it("admits or denies one person by their ticket, and rests their buttons while it goes", async () => {
    let finish: () => void = () => {}
    const lobbyAct = vi.fn(() => new Promise<boolean>((r) => (finish = () => r(true))))
    render(<CallPeoplePanel people={[]} onClose={vi.fn()} me={host()} onAction={vi.fn()} lobby={[priya, jonas]} onLobbyAction={lobbyAct} />)
    fireEvent.click(screen.getByRole("button", { name: "Admit Priya" }))
    expect(lobbyAct).toHaveBeenCalledWith("admit", { ticket: "t1", name: "Priya" })
    expect((screen.getByRole("button", { name: "Deny Priya" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Deny Jonas Weber" }) as HTMLButtonElement).disabled).toBe(false)
    await act(async () => finish())
    expect((screen.getByRole("button", { name: "Deny Priya" }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "Deny Jonas Weber" }))
    expect(lobbyAct).toHaveBeenLastCalledWith("deny", { ticket: "t2", name: "Jonas Weber" })
  })

  it("offers Admit all only when more than one waits", () => {
    const lobbyAct = vi.fn()
    const { rerender } = render(<CallPeoplePanel people={[]} onClose={vi.fn()} me={host()} onAction={vi.fn()} lobby={[priya]} onLobbyAction={lobbyAct} />)
    expect(screen.queryByRole("button", { name: "Admit all" })).toBeNull()
    rerender(<CallPeoplePanel people={[]} onClose={vi.fn()} me={host()} onAction={vi.fn()} lobby={[priya, jonas]} onLobbyAction={lobbyAct} />)
    fireEvent.click(screen.getByRole("button", { name: "Admit all" }))
    expect(lobbyAct).toHaveBeenCalledWith("admit_all")
  })

  it("keeps one orange action: Admit all when several wait, the one Admit when one does", () => {
    const orange = (name: string) => screen.getByRole("button", { name }).className.includes("bg-brand")
    const { rerender } = render(<CallPeoplePanel people={[]} onClose={vi.fn()} me={host()} onAction={vi.fn()} lobby={[priya, jonas]} onLobbyAction={vi.fn()} />)
    expect([orange("Admit all"), orange("Admit Priya"), orange("Admit Jonas Weber"), orange("Deny Priya")]).toEqual([true, false, false, false])
    rerender(<CallPeoplePanel people={[]} onClose={vi.fn()} me={host()} onAction={vi.fn()} lobby={[priya]} onLobbyAction={vi.fn()} />)
    expect([orange("Admit Priya"), orange("Deny Priya")]).toEqual([true, false])
  })

  it("takes focus on its heading as it opens, so focus leaves the button that opened it", () => {
    render(<CallPeoplePanel people={[]} onClose={vi.fn()} me={host()} onAction={vi.fn()} lobby={[priya]} onLobbyAction={vi.fn()} />)
    expect(document.activeElement?.tagName).toBe("H2")
    expect(document.activeElement?.textContent).toMatch(/^People/)
  })

  it("is not there for someone who may not let people in, nor when nobody waits", () => {
    const { rerender } = render(<CallPeoplePanel people={[]} onClose={vi.fn()} me={host(["mute"])} onAction={vi.fn()} lobby={[priya]} onLobbyAction={vi.fn()} />)
    expect(screen.queryByRole("region", { name: /Waiting to join/ })).toBeNull()
    rerender(<CallPeoplePanel people={[]} onClose={vi.fn()} me={host()} onAction={vi.fn()} lobby={[]} onLobbyAction={vi.fn()} />)
    expect(screen.queryByRole("region", { name: /Waiting to join/ })).toBeNull()
  })
})

describe("the bar above the dock", () => {
  it("shows while anyone waits and the list is closed; Not now holds until someone new knocks", () => {
    const { result, rerender } = renderHook(({ w, open }) => useKnockBar(w, open), { initialProps: { w: [priya] as typeof priya[] | undefined, open: false } })
    expect(result.current.show).toBe(true)
    rerender({ w: [priya], open: true })
    expect(result.current.show).toBe(false)
    rerender({ w: [priya], open: false })
    act(() => result.current.hide())
    expect(result.current.show).toBe(false)
    rerender({ w: [priya, jonas], open: false })
    expect(result.current.show).toBe(true)
    rerender({ w: [], open: false })
    expect(result.current.show).toBe(false)
    rerender({ w: undefined, open: false })
    expect(result.current.show).toBe(false)
  })

  it("names one person, with Admit, See who and Not now", () => {
    const on = { onAdmit: vi.fn(), onAdmitAll: vi.fn(), onSeeWho: vi.fn(), onHide: vi.fn(), onHeight: vi.fn() }
    render(<KnockBar waiting={[priya]} {...on} />)
    const bar = document.querySelector("[data-knock-bar]") as HTMLElement
    expect(bar.textContent).toContain("Priya is waiting to join")
    fireEvent.click(within(bar).getByRole("button", { name: "Admit Priya" }))
    expect(on.onAdmit).toHaveBeenCalledWith(priya)
    fireEvent.click(within(bar).getByRole("button", { name: "See who" }))
    expect(on.onSeeWho).toHaveBeenCalled()
    fireEvent.click(within(bar).getByRole("button", { name: "Not now" }))
    expect(on.onHide).toHaveBeenCalled()
    expect(on.onHeight).toHaveBeenCalled()
  })

  it("counts several, by their faces, with Admit all the one orange action", () => {
    const on = { onAdmit: vi.fn(), onAdmitAll: vi.fn(), onSeeWho: vi.fn(), onHide: vi.fn(), onHeight: vi.fn() }
    const { container } = render(<KnockBar waiting={[priya, jonas, { ...priya, ticket: "t3", name: "Lee Hall" }]} {...on} />)
    expect(screen.getByText("3 people are waiting to join")).toBeTruthy()
    // Each face is IdentityMark's avatar (data-hue on its root), its initials inside.
    expect([...container.querySelectorAll("[data-knock-bar] [data-hue]")].map((s) => s.textContent)).toEqual(["P", "JW"])
    const all = screen.getByRole("button", { name: "Admit everyone waiting" })
    expect(all.className).toContain("bg-brand")
    expect(screen.getByRole("button", { name: "See who" }).className).not.toContain("bg-brand")
    fireEvent.click(all)
    expect(on.onAdmitAll).toHaveBeenCalled()
  })

  it("gives its height back when it goes, so the stage takes its room again", () => {
    const onHeight = vi.fn()
    const { unmount } = render(<KnockBar waiting={[priya]} onAdmit={vi.fn()} onAdmitAll={vi.fn()} onSeeWho={vi.fn()} onHide={vi.fn()} onHeight={onHeight} />)
    unmount()
    expect(onHeight).toHaveBeenLastCalledWith(0)
  })
})
