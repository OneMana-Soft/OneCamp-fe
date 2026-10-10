import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import {
  addressOrHandleOf,
  displayNameOf,
  handleOf,
  matchesPerson,
  personKeywords,
  personSearchValue,
  pickPeople,
  secondaryNameOf,
} from "@/lib/personName"

describe("displayNameOf: the one name rule", () => {
  // The same cases as the backend's TestPersonDisplayName
  // (helpers/personDisplayName_test.go), so the two cannot drift apart.
  const cases: Array<[string, string, string, string]> = [
    ["Sam", "Samuel Rivera", "sam@example.com", "Sam"],
    ["  ", "Samuel Rivera", "sam@example.com", "Samuel Rivera"],
    ["", " ", " sam.rivera@example.com", "sam.rivera"],
    ["", "", "", ""],
    ["", "", "no-at-sign", "no-at-sign"],
    [" Sam ", "", "", "Sam"],
  ]
  it.each(cases)("display %j, full %j, address %j is shown as %j", (display, full, email, want) => {
    expect(displayNameOf({ user_name: display, user_full_name: full, user_email_id: email })).toBe(want)
  })

  it("prefers the display name over the full name", () => {
    // Most places used to show the full name first.
    expect(displayNameOf({ user_name: "akash", user_full_name: "Akash Hadagali" })).toBe("akash")
  })

  it("never throws on nothing", () => {
    expect(displayNameOf(null)).toBe("")
    expect(displayNameOf(undefined)).toBe("")
    expect(displayNameOf({})).toBe("")
  })
})

describe("secondaryNameOf", () => {
  it("is the full name when it says something the shown name does not", () => {
    expect(secondaryNameOf({ user_name: "sam", user_full_name: "Samuel Rivera" })).toBe("Samuel Rivera")
  })
  it("is empty when the full name is what is shown", () => {
    expect(secondaryNameOf({ user_name: "", user_full_name: "Samuel Rivera" })).toBe("")
    expect(secondaryNameOf({ user_name: "samuel rivera", user_full_name: "Samuel Rivera" })).toBe("")
    expect(secondaryNameOf({ user_name: "Sam" })).toBe("")
  })
})

describe("addressOrHandleOf: the line under a name in a people list", () => {
  it("is the address when there is one", () => {
    expect(addressOrHandleOf({ user_email_id: " maya@example.com ", user_handle: "maya" })).toBe("maya@example.com")
  })
  it("is the handle when the address is blank, as the demo's visitor sees other members", () => {
    expect(addressOrHandleOf({ user_email_id: "", user_handle: "maya" })).toBe("@maya")
    expect(addressOrHandleOf({ user_email_id: "  ", user_handle: "@maya" })).toBe("@maya")
  })
  it("is empty with neither, so no line is shown", () => {
    expect(addressOrHandleOf({ user_email_id: "", user_handle: "" })).toBe("")
    expect(addressOrHandleOf({})).toBe("")
    expect(addressOrHandleOf(null)).toBe("")
  })
})

describe("matchesPerson: people pickers", () => {
  const sam = { user_name: "Sam", user_full_name: "Samuel Rivera", user_handle: "srivera", user_email_id: "s@example.com" }

  it("matches the display name, the full name and the handle, in any case", () => {
    expect(matchesPerson(sam, "sam")).toBe(true)
    expect(matchesPerson(sam, "RIVERA")).toBe(true)
    expect(matchesPerson(sam, "sriv")).toBe(true)
  })
  it("allows a leading @", () => {
    expect(matchesPerson(sam, "@srivera")).toBe(true)
    expect(matchesPerson(sam, "  @Sam")).toBe(true)
  })
  it("matches someone with no display name by the part of their address that names them", () => {
    expect(matchesPerson({ user_email_id: "maya.chen@example.com" }, "maya")).toBe(true)
  })
  it("does not match the address unless asked to", () => {
    expect(matchesPerson(sam, "example.com")).toBe(false)
    expect(matchesPerson(sam, "example.com", [sam.user_email_id])).toBe(true)
  })
  it("lets an empty query or a bare @ match everyone", () => {
    expect(matchesPerson(sam, "")).toBe(true)
    expect(matchesPerson(sam, "@")).toBe(true)
  })
  it("does not match someone else", () => {
    expect(matchesPerson(sam, "maya")).toBe(false)
  })
})

describe("pickPeople: the @mention picker", () => {
  const people = [
    { user_uuid: "1", user_name: "Joanna", user_full_name: "Joanna Park", user_handle: "jpark" },
    { user_uuid: "2", user_name: "Ravi", user_full_name: "Ravi Park", user_handle: "ravi" },
    { user_uuid: "3", user_name: "Parker", user_full_name: "Parker Lee", user_handle: "plee" },
    { user_uuid: "4", user_name: "Ana", user_full_name: "Ana Sousa", user_handle: "asousa" },
  ]
  const ids = (q: string, limit?: number) => pickPeople(people, q, limit).map((p) => p.user_uuid)

  it("finds people by their full name and handle, not only their display name", () => {
    expect(ids("sousa")).toEqual(["4"])
    expect(ids("@jpark")).toEqual(["1"])
  })
  it("puts names that start with the query first, then words that do", () => {
    expect(ids("park")).toEqual(["3", "1", "2"])
  })
  it("offers at most the limit", () => {
    expect(ids("", 2)).toEqual(["1", "2"])
  })
})

describe("cmdk people lists", () => {
  it("filter by the full name and @handle too", () => {
    const value = personSearchValue("Sam", { fullName: "Samuel Rivera", handle: "srivera", email: "s@example.com", id: "u1" })
    expect(value).toBe("Sam Samuel Rivera @srivera s@example.com u1")
    expect(personSearchValue("Sam", { handle: "@srivera" })).toBe("Sam @srivera")
  })
  it("give keywords for the names and the handle", () => {
    expect(personKeywords({ user_name: "Sam", user_full_name: "Samuel Rivera", user_handle: "srivera" })).toEqual([
      "Sam",
      "Samuel Rivera",
      "@srivera",
    ])
    expect(personKeywords({ user_name: "Sam", user_full_name: "Sam" })).toEqual(["Sam"])
    expect(personKeywords(null)).toBeUndefined()
  })
  it("handleOf drops the @", () => {
    expect(handleOf({ user_handle: "@sam" })).toBe("sam")
    expect(handleOf({})).toBe("")
  })
})

/**
 * Guard: the web app names a member through lib/personName, not by choosing
 * between user_full_name and user_name in place. Over eighty places used to
 * choose for themselves, some full name first and some display name first, so
 * one person was shown under two names. Bots (lib/utils/userDisplayName) are
 * the one exception.
 */
describe("guard: no ad-hoc choice between a member's names", () => {
  it("leaves no `user_full_name || user_name` or `user_name || user_full_name` in the source", () => {
    let out = ""
    try {
      out = execFileSync(
        "git",
        ["grep", "-nE", "user_full_name\\s*(\\|\\||\\?\\?)[^\\n]*user_name\\b|\\buser_name\\s*(\\|\\||\\?\\?)[^\\n]*user_full_name", "--", "*.ts", "*.tsx"],
        { cwd: process.cwd(), encoding: "utf8" },
      )
    } catch (e) {
      // git grep exits 1 when nothing matches.
      if ((e as { status?: number }).status !== 1) throw e
    }
    const offenders = out
      .split("\n")
      .filter(Boolean)
      .filter((l) => !/\.test\.tsx?:/.test(l))
    expect(offenders).toEqual([])
  })
})
