import { describe, expect, it } from "vitest"
import { UserProfileResponseSchema } from "./schemas"

// The self profile's check, which the protected route runs before the shell
// draws. It was a Zod schema; it is written by hand now so that the first
// screen doesn't carry Zod (fluid-15), and these verdicts are the schema's,
// pinned before the swap.
const uuid = "7c1e2a4b-0d3f-4e5a-9b6c-1d2e3f4a5b6c"
const good = { msg: "ok", data: { user_uuid: uuid, user_name: "Sam Rivera" } }
const ok = (body: unknown) => {
  try {
    UserProfileResponseSchema.parse(body)
    return true
  } catch {
    return false
  }
}
const withData = (data: Record<string, unknown>) => ({ msg: "ok", data: { ...good.data, ...data } })

describe("the self profile's check", () => {
  it("passes a profile with its uuid and name, and keeps every other field", () => {
    const body = { msg: "ok", extra: 1, data: { ...good.data, user_handle: "sam", user_teams: [{ team_uuid: "t" }] } }
    expect(UserProfileResponseSchema.parse(body)).toEqual(body)
  })

  it("passes the optional fields when they're the right kind, or absent", () => {
    expect(ok({ data: good.data })).toBe(true)
    expect(ok(withData({
      user_full_name: "Sam Rivera",
      user_email_id: "visitor@demo.onemana.dev",
      user_profile_object_key: null,
      user_is_admin: false,
      user_status: "online",
      user_job_title: "Designer",
    }))).toBe(true)
    expect(ok(withData({ user_profile_object_key: "avatars/sam.png" }))).toBe(true)
  })

  it("refuses a body that isn't an object, or has no profile", () => {
    for (const body of [null, undefined, "<html>", 42, [], [good], { msg: "ok" }, { data: null }, { data: [] }, { data: "x" }]) {
      expect(ok(body)).toBe(false)
    }
  })

  it("refuses a message that isn't text", () => {
    expect(ok({ ...good, msg: 3 })).toBe(false)
    expect(ok({ ...good, msg: null })).toBe(false)
  })

  it("refuses a profile without a uuid-shaped id or a name", () => {
    expect(ok(withData({ user_uuid: undefined }))).toBe(false)
    expect(ok(withData({ user_uuid: "not-a-uuid" }))).toBe(false)
    expect(ok(withData({ user_uuid: uuid.toUpperCase() }))).toBe(true)
    expect(ok(withData({ user_name: undefined }))).toBe(false)
    expect(ok(withData({ user_name: 7 }))).toBe(false)
    expect(ok(withData({ user_name: "" }))).toBe(true)
  })

  it("refuses optional fields of the wrong kind; only the picture's key may be null", () => {
    expect(ok(withData({ user_full_name: null }))).toBe(false)
    expect(ok(withData({ user_email_id: null }))).toBe(false)
    expect(ok(withData({ user_is_admin: "true" }))).toBe(false)
    expect(ok(withData({ user_status: 1 }))).toBe(false)
    expect(ok(withData({ user_job_title: null }))).toBe(false)
    expect(ok(withData({ user_profile_object_key: 5 }))).toBe(false)
  })

  it("checks an email the way the schema did", () => {
    for (const email of ["a@b.co", "first.last+tag@mail.example.org", "O'Brien@example.ie", "x_y-z@sub-domain.example.com"]) {
      expect(ok(withData({ user_email_id: email }))).toBe(true)
    }
    for (const email of ["", "plain", "a@b", "a@b.c", ".a@b.co", "a..b@b.co", "a.@b.co", "a@-b.co", "a@b..co", "a b@c.co", "a@1.2.3.4"]) {
      expect(ok(withData({ user_email_id: email }))).toBe(false)
    }
  })
})
