import { describe, expect, it } from "vitest"
import { addChips, splitAddresses } from "./inviteChips"

// A whole list pasted into "Who's coming?" becomes one chip per address,
// whatever separated them, and a mail client's "Name <address>" keeps only the
// address. Repeats collapse; something that isn't an address is a chip that
// says so, rather than vanishing.
describe("invitation chips", () => {
  it("splits a paste on commas, semicolons, spaces and new lines", () => {
    expect(splitAddresses("a@x.io, b@x.io;c@x.io\nd@x.io  e@x.io")).toEqual(["a@x.io", "b@x.io", "c@x.io", "d@x.io", "e@x.io"])
  })

  it("keeps the address from a mail client's entry", () => {
    expect(splitAddresses("Priya R <Priya@Kestrel.Example>, Arjun <arjun@kestrel.example>")).toEqual(["priya@kestrel.example", "arjun@kestrel.example"])
    expect(addChips([], "<Priya@Kestrel.Example>")).toEqual([{ email: "priya@kestrel.example", valid: true }])
  })

  it("collapses repeats and marks what isn't an address", () => {
    const chips = addChips([{ email: "a@x.io", valid: true }], "A@x.io nope b@x.io")
    expect(chips).toEqual([
      { email: "a@x.io", valid: true },
      { email: "nope", valid: false },
      { email: "b@x.io", valid: true },
    ])
  })
})
