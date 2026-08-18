import { describe, expect, it } from "vitest"

import {
  MCP_TOKEN_PLACEHOLDER,
  mcpClientConfig,
  mcpCurlExample,
  mcpEndpointUrl,
} from "./mcpEndpoint"

const BETA = "https://onecamp-backend.onemana.dev/"

describe("mcpEndpointUrl", () => {
  it("joins a base that ends in a slash without doubling it", () => {
    // This is the real shape of NEXT_PUBLIC_BACKEND_URL in .env.production, and the reason this
    // helper exists: a template literal adding its own slash yields "//v1/mcp", which works behind
    // one proxy and 404s behind the next.
    expect(mcpEndpointUrl(BETA)).toBe("https://onecamp-backend.onemana.dev/v1/mcp")
  })

  it("joins a base with no trailing slash", () => {
    expect(mcpEndpointUrl("https://onecamp-backend.onemana.dev")).toBe(
      "https://onecamp-backend.onemana.dev/v1/mcp",
    )
  })

  it("collapses several trailing slashes", () => {
    expect(mcpEndpointUrl("http://localhost:3000///")).toBe("http://localhost:3000/v1/mcp")
  })

  it("tolerates surrounding whitespace, which env files collect", () => {
    expect(mcpEndpointUrl("  https://example.dev/  ")).toBe("https://example.dev/v1/mcp")
  })

  it("returns an empty string rather than inventing a hostname", () => {
    // A plausible-looking wrong URL inside a block people copy without reading is worse than an
    // obvious absence the UI can report.
    expect(mcpEndpointUrl(undefined)).toBe("")
    expect(mcpEndpointUrl("")).toBe("")
    expect(mcpEndpointUrl("   ")).toBe("")
  })

  it("keeps a base that already has a path prefix", () => {
    // Some deployments sit behind a path-based proxy.
    expect(mcpEndpointUrl("https://example.dev/onecamp/")).toBe("https://example.dev/onecamp/v1/mcp")
  })
})

describe("mcpClientConfig", () => {
  it("produces a pasteable mcpServers block with the real token", () => {
    const config = mcpClientConfig("oc_deadbeef", BETA)

    expect(JSON.parse(config)).toEqual({
      mcpServers: {
        onecamp: {
          url: "https://onecamp-backend.onemana.dev/v1/mcp",
          headers: { Authorization: "Bearer oc_deadbeef" },
        },
      },
    })
  })

  it("is valid JSON, indented, and newline-terminated for a config file", () => {
    const config = mcpClientConfig("oc_deadbeef", BETA)

    expect(() => JSON.parse(config)).not.toThrow()
    expect(config).toContain('\n  "mcpServers"')
    expect(config.endsWith("\n")).toBe(true)
  })

  it("falls back to an obvious placeholder when no token is available", () => {
    // The admin card has no credential to show — it is configuring the surface, not minting a token.
    const config = mcpClientConfig(undefined, BETA)

    expect(config).toContain(MCP_TOKEN_PLACEHOLDER)
    expect(MCP_TOKEN_PLACEHOLDER).toMatch(/^oc_/)
  })
})

describe("mcpCurlExample", () => {
  it("calls tools/list at the resolved endpoint", () => {
    const curl = mcpCurlExample("oc_deadbeef", BETA)

    expect(curl).toContain("https://onecamp-backend.onemana.dev/v1/mcp")
    expect(curl).toContain("Authorization: Bearer oc_deadbeef")
    expect(curl).toContain('"method":"tools/list"')
  })

  it("sends valid JSON-RPC 2.0 in the body", () => {
    // The body is pasted into a shell, so a malformed payload here is a support ticket rather than a
    // test failure. Parsed rather than eyeballed.
    const curl = mcpCurlExample("oc_deadbeef", BETA)
    const body = curl.match(/-d '(.+)'$/)?.[1]

    expect(body, "the -d payload should be extractable").toBeDefined()
    expect(JSON.parse(body as string)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    })
  })

  it("does not single-quote the token, which would break the shell quoting", () => {
    // The payload is wrapped in single quotes; a stray one in the header line would terminate it
    // early and silently send a different request.
    expect(mcpCurlExample("oc_deadbeef", BETA)).not.toMatch(/Authorization: Bearer [^\n]*'/)
  })
})
