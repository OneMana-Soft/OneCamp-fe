import { describe, expect, it } from "vitest"

import { signInReturn } from "./importSignIn"

describe("coming back from signing in at a tool", () => {
  it("is nothing when the address holds no sign-in", () => {
    expect(signInReturn("?tab=import")).toBeNull()
    expect(signInReturn("")).toBeNull()
  })

  it("names the tool that connected, and keeps the rest of the address", () => {
    expect(signInReturn("?tab=import&connected=basecamp")).toMatchObject({ provider: "basecamp", ok: true, title: "Basecamp connected", search: "?tab=import" })
  })

  it("says why a sign-in didn't connect, by the server's code", () => {
    const why = (q: string) => signInReturn(q)?.description
    expect(why("?connect_error=cancelled&provider=basecamp")).toBe("The sign-in was cancelled, so nothing changed.")
    expect(why("?connect_error=token_rejected&provider=jira")).toBe("It didn't accept the sign-in. Connect again.")
    // Jira's four ways of not settling a site (providers/jira/oauth.go): Atlassian
    // listed none, the account sees no Jira site, the address typed isn't one it
    // reaches, or it reaches several and none was named. One sentence fits all four.
    expect(why("?connect_error=sign_in_incomplete&provider=jira")).toBe("The sign-in couldn't settle which site to import from. Connect again with the site's address, or with an account that can see it.")
    expect(why("?connect_error=provider_error&provider=basecamp")).toBe("Something went wrong signing in. Connect again.")
  })
})
