import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// CAL-BUG-10: quick create read "with <Name>" and, on save, invited the first
// search hit whose name started with the word, without showing who. Now the
// card shows who each name came to before anything is saved, and invites
// only the people it showed.

const RIVERA = { type: "user", user_uuid: "u-rivera", user_name: "Sam Rivera", user_profile_object_key: "" }
const OKAFOR = { type: "user", user_uuid: "u-okafor", user_name: "Sam Okafor", user_profile_object_key: "" }
const SAMANTHA = { type: "user", user_uuid: "u-samantha", user_name: "Samantha Lee", user_profile_object_key: "" }
const MUMTAZ = { type: "user", user_uuid: "u-mumtaz", user_name: "Mumtaz Ali", user_profile_object_key: "" }
let people: Record<string, unknown[]> = {}
const created: Array<{ title: string; participants: string[] }> = []
const makeRequest = vi.fn(async (o: { apiEndpoint: string; payload: { search_text?: string; title?: string; participants?: string[] } }) => {
  if (o.apiEndpoint.includes("search")) return people[o.payload.search_text ?? ""] ?? []
  created.push({ title: o.payload.title ?? "", participants: o.payload.participants ?? [] })
  return {}
})
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

import { QuickCreateCard } from "./quickCreateCard"

afterEach(() => {
  cleanup()
  people = {}
  created.length = 0
  makeRequest.mockClear()
})

function card() {
  const anchor = document.createElement("div")
  document.body.appendChild(anchor)
  const onCreated = vi.fn()
  render(<QuickCreateCard draft={{ start: new Date(2026, 9, 15, 9), end: new Date(2026, 9, 15, 9, 30) }} anchor={anchor} onDraftChange={vi.fn()} onClose={vi.fn()} onCreated={onCreated} onMoreOptions={vi.fn()} />)
  return onCreated
}
const type = (text: string) => fireEvent.change(screen.getByLabelText("Event title"), { target: { value: text } })
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
  await waitFor(() => expect(created).toHaveLength(1))
  return created[0]
}

describe("quick create's guests", () => {
  it("shows who a name came to, by their full name, and invites that person", async () => {
    people = { Sam: [RIVERA, SAMANTHA] }
    card()
    type("Coffee with Sam at 3pm")
    const chip = await screen.findByText("Sam Rivera")
    expect(chip.closest("[data-guest]")?.getAttribute("data-guest")).toBe("invited")
    expect((await save()).participants).toEqual(["u-rivera"])
  })

  it("asks when two people have the name, and invites nobody until one is picked", async () => {
    people = { Sam: [RIVERA, OKAFOR] }
    card()
    type("Coffee with Sam")
    const ask = await screen.findByRole("group", { name: "Who is Sam?" })
    expect(ask.textContent).toMatch(/Sam\?.*Sam Rivera.*Sam Okafor/)
    expect((await save()).participants).toEqual([])
    created.length = 0
    fireEvent.click(screen.getByRole("button", { name: "Sam Okafor" }))
    expect(await save()).toMatchObject({ participants: ["u-okafor"] })
  })

  it("never invites someone whose name only starts with the word", async () => {
    people = { Sam: [SAMANTHA], Mum: [MUMTAZ] }
    card()
    type("Call with Mum")
    expect((await screen.findByRole("group", { name: "Who is Mum?" })).textContent).toContain("Mumtaz Ali")
    expect((await save()).participants).toEqual([])
  })

  it("invites nobody for a name nobody has, and keeps it in the title", async () => {
    card()
    type("Call with Mum")
    expect(await screen.findByText("No one called Mum")).toBeTruthy()
    expect(await save()).toEqual({ title: "Call with Mum", participants: [] })
  })

  it("invites nobody for a name set aside", async () => {
    people = { Sam: [RIVERA] }
    card()
    type("Coffee with Sam")
    fireEvent.click(await screen.findByRole("button", { name: "Don't invite Sam Rivera" }))
    expect((await save()).participants).toEqual([])
  })

  it("invites nobody for a name it is still looking up, and never looks anyone up on save", async () => {
    people = { Sam: [RIVERA] }
    card()
    type("Coffee with Sam")
    expect((await save()).participants).toEqual([])
    expect(makeRequest.mock.calls.filter(([o]) => o.apiEndpoint.includes("search"))).toHaveLength(0)
  })
})
