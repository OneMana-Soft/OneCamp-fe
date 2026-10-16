import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { GreetingComposition, orbitPlayState } from "@/components/home/GreetingComposition"
import { dayArcPoint, hueForHour } from "@/components/home/homeTime"
import { focusClause, orbitPeople } from "@/components/home/Greeting"
import { hueFor } from "@/lib/campHue"

/** The greeting's composition (hub.md H3): real data drawn as the camp at this hour. */
afterEach(cleanup)

const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m)
const people = [
  { id: "u-maya", name: "Maya Chen" },
  { id: "u-jonas", name: "Jonas Weber" },
  { id: "u-priya", name: "Priya Shah" },
]

describe("the composition", () => {
  it("orbits three people as circles and the agent as one rounded square", () => {
    const { container } = render(<GreetingComposition people={people} agent now={at(10)} />)
    expect(container.querySelectorAll('[data-orbiter="person"]')).toHaveLength(3)
    const agent = container.querySelectorAll('[data-orbiter="agent"]')
    expect(agent).toHaveLength(1)
    expect(agent[0].querySelector("rect")).not.toBeNull()
  })

  it("never gives the agent initials", () => {
    const { container } = render(<GreetingComposition people={[]} agent now={at(10)} />)
    expect(container.querySelector('[data-orbiter="agent"] text')).toBeNull()
  })

  it("draws a brand-new workspace with rings and no orbiters", () => {
    const { container } = render(<GreetingComposition now={at(10)} />)
    expect(container.querySelectorAll("[data-orbiter]")).toHaveLength(0)
    expect(container.querySelectorAll("circle").length).toBeGreaterThan(3)
  })

  it("shrinks to 96px on the phone, with no day arc", () => {
    const { container } = render(<GreetingComposition people={people} variant="phone" now={at(10)} />)
    const svg = container.querySelector("svg")!
    expect(svg.getAttribute("width")).toBe("96")
    expect(container.querySelector("[data-sun]")).toBeNull()
  })

  it("shows a crescent after dark", () => {
    const { container } = render(<GreetingComposition now={at(21)} />)
    expect(container.querySelector('[data-sun="night"]')).not.toBeNull()
  })
})

describe("dayArcPoint", () => {
  it("rises at 06:00, peaks at noon, sets at 18:00", () => {
    expect(dayArcPoint(at(6))).toMatchObject({ x: 24, y: 150, t: 0, day: true })
    const noon = dayArcPoint(at(12))
    expect(noon.t).toBe(0.5)
    expect(noon.x).toBe(162)
    expect(noon.y).toBeLessThan(30)
    expect(dayArcPoint(at(18))).toMatchObject({ x: 300, y: 150, t: 1, day: false })
  })
  it("rests at an end after dark", () => {
    expect(dayArcPoint(at(23))).toMatchObject({ t: 1, day: false })
    expect(dayArcPoint(at(3))).toMatchObject({ t: 0, day: false })
  })
})

describe("hueForHour", () => {
  it("is sun, sky, dusk or lake", () => {
    expect([7, 13, 18, 22, 2].map(hueForHour)).toEqual(["sun", "sky", "dusk", "lake", "lake"])
  })
})

describe("the orbit's pause", () => {
  it("runs only while on screen and in a visible tab", () => {
    expect(orbitPlayState(true, false)).toBe("running")
    expect(orbitPlayState(false, false)).toBe("paused")
    expect(orbitPlayState(true, true)).toBe("paused")
  })
})

describe("who orbits", () => {
  it("takes today's attendees first, then DM partners, never you, at most four", () => {
    const events = [
      { event_uuid: "e1", event_title: "Launch sync", event_start_time: "", event_end_time: "", event_participants: [{ user_uuid: "me" }, { user_uuid: "u-maya", user_full_name: "Maya Chen" }] },
    ] as never
    const chats = [
      { dm_grouping_id: "g", dm_unread: 2, dm_participants: [{ user_uuid: "u-jonas", user_full_name: "Jonas Weber" }, { user_uuid: "me" }] },
    ] as never
    expect(orbitPeople(events, chats, "me").map((p) => p.id)).toEqual(["u-maya", "u-jonas"])
  })
  // OneCamp AI, a DM partner, orbited as a green "OA" disc beside the agent
  // square drawn for it: an agent never reads as a person (V3 3.9).
  it("leaves agents and bots to their own square, never a person's disc", () => {
    const chats = [
      { dm_grouping_id: "a", dm_unread: 3, dm_participants: [{ user_uuid: "u-ai", user_full_name: "OneCamp AI", is_bot: true }, { user_uuid: "me" }] },
      { dm_grouping_id: "g", dm_unread: 1, dm_participants: [{ user_uuid: "u-maya", user_full_name: "Maya Chen" }, { user_uuid: "me" }] },
    ] as never
    expect(orbitPeople([], chats, "me").map((p) => p.id)).toEqual(["u-maya"])
  })
  it("draws each person in the colour of their messages: keyed on the name", () => {
    const { container } = render(<GreetingComposition people={[{ id: "6749f365-be78", name: "Maya Chen" }]} agent={false} events={[]} animate={false} now={at(10)} />)
    const disc = container.querySelector("[data-orbiter=person] circle:nth-of-type(2)")!
    expect(disc.getAttribute("fill")).toBe(`var(--camp-${hueFor("Maya Chen")}-a2)`)
  })
  it("says you are in focus while a focus block runs", () => {
    const ev = [{ event_uuid: "f", event_title: "Focus", event_is_focus: true, event_start_time: at(14).toISOString(), event_end_time: at(16).toISOString() }] as never
    expect(focusClause(ev, at(15))).toBe("In focus until 4:00\u00a0PM")
    expect(focusClause(ev, at(17))).toBeNull()
  })
})
