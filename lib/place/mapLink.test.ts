import { describe, expect, it } from "vitest"
import { MAPS_SEARCH, placeLink } from "@/lib/place/mapLink"

// An event's place as a link (calendar head B, gcal-1a): a web address opens itself, anything else a map search.
describe("placeLink", () => {
  it("searches a map for a room or an address, its words encoded", () => {
    expect(placeLink("Studio, second floor")).toEqual({ href: `${MAPS_SEARCH}Studio%2C%20second%20floor`, map: true })
    expect(placeLink("  10 Downing St, London & Co  ")).toEqual({ href: `${MAPS_SEARCH}10%20Downing%20St%2C%20London%20%26%20Co`, map: true })
    expect(MAPS_SEARCH).toBe("https://www.google.com/maps/search/?api=1&query=")
  })

  it("opens a web address as itself, with or without its https://", () => {
    expect(placeLink("https://meet.example.com/abc-defg")).toEqual({ href: "https://meet.example.com/abc-defg", map: false })
    expect(placeLink("zoom.us/j/123456")).toEqual({ href: "https://zoom.us/j/123456", map: false })
  })

  it("takes a single word, a scheme it doesn't open and a sentence with a link in it for a place", () => {
    expect(placeLink("Studio")?.map).toBe(true)
    expect(placeLink("javascript:alert(1)")).toEqual({ href: `${MAPS_SEARCH}javascript%3Aalert(1)`, map: true })
    expect(placeLink("Room 4 or https://meet.example.com/x")?.map).toBe(true)
  })

  it("has no link for no place", () => {
    expect(placeLink("")).toBeNull()
    expect(placeLink("   ")).toBeNull()
    expect(placeLink(undefined)).toBeNull()
    expect(placeLink(null)).toBeNull()
  })
})
