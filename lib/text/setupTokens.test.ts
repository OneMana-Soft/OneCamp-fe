import { describe, expect, it } from "vitest"

import { setupTokens } from "./setupTokens"

describe("a server's setup sentence", () => {
  it("sets its settings as code and its address as a link, the words as they were", () => {
    const sentence =
      "Signing in to Basecamp isn't set up on this server. Register an app at launchpad.37signals.com/integrations, then set BASECAMP_OAUTH_CLIENT_ID and BASECAMP_OAUTH_CLIENT_SECRET."
    const tokens = setupTokens(sentence)
    expect(tokens).toEqual([
      { kind: "text", text: "Signing in to Basecamp isn't set up on this server. Register an app at " },
      { kind: "link", text: "launchpad.37signals.com/integrations", href: "https://launchpad.37signals.com/integrations" },
      { kind: "text", text: ", then set " },
      { kind: "code", text: "BASECAMP_OAUTH_CLIENT_ID" },
      { kind: "text", text: " and " },
      { kind: "code", text: "BASECAMP_OAUTH_CLIENT_SECRET" },
      { kind: "text", text: "." },
    ])
    expect(tokens.map((t) => t.text).join("")).toBe(sentence)
  })

  it("keeps a full address as it is, and leaves file names, single capitals and plain words alone", () => {
    expect(setupTokens("See https://developer.atlassian.com/console/myapps/ for the API.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "https://developer.atlassian.com/console/myapps/", href: "https://developer.atlassian.com/console/myapps/" },
      { kind: "text", text: " for the API." },
    ])
    expect(setupTokens("Set it in final-compose.yml or .env, then restart the API.")).toEqual([
      { kind: "text", text: "Set it in final-compose.yml or .env, then restart the API." },
    ])
  })

  // One matcher for a link in text (lib/links/webLink), shared with linksAsHosts (CR-31's SF): a host
  // pasted with a path on any domain is a link, and a host inside an email address is not.
  it("links a host with a path on any domain, and leaves an email address's host alone", () => {
    expect(setupTokens("Set it up at zoom.us/account/apps.")).toEqual([
      { kind: "text", text: "Set it up at " },
      { kind: "link", text: "zoom.us/account/apps", href: "https://zoom.us/account/apps" },
      { kind: "text", text: "." },
    ])
    expect(setupTokens("Ask admin@acme.co for the key.")).toEqual([{ kind: "text", text: "Ask admin@acme.co for the key." }])
  })

  it("is the sentence alone when it names nothing", () => {
    expect(setupTokens("Basecamp is connected by signing in, and this server isn't set up for that yet.")).toEqual([
      { kind: "text", text: "Basecamp is connected by signing in, and this server isn't set up for that yet." },
    ])
  })
})
