import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PREVIEW_SANDBOX, frameDocument } from "./uiStudioFrame"

// The AI UI Designer's preview frame shares the app's origin, which its PNG
// export needs, so whatever runs in it runs as the app. The model's markup is
// stripped of scripts by pattern on the server, and <img/onerror=…> got
// through; the frame's own policy must run none of it.

function policyOf(doc: string): Record<string, string[]> {
  const content = doc.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? ""
  return Object.fromEntries(
    content
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...sources]) => [name, sources]),
  )
}

describe("the UI Designer's preview frame", () => {
  it("runs only the Tailwind CDN: no inline script, no event handler", () => {
    const policy = policyOf(frameDocument('<img/onerror="parent.document.title=1" src=x>'))
    expect(policy["script-src"]).toEqual(["https://cdn.tailwindcss.com", "'unsafe-eval'"])
    expect(policy["default-src"]).toEqual(["'none'"])
    expect(policy["img-src"]).toEqual(["data:"])
  })

  it("needs no inline script of its own", () => {
    const doc = frameDocument("<p>Hello</p>")
    const scripts = [...doc.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1])
    expect(scripts).toEqual([' src="https://cdn.tailwindcss.com"'])
  })

  it("keeps the markup's place in the body", () => {
    expect(frameDocument("<main>screen</main>")).toContain("<body><main>screen</main></body>")
  })

  // allow-same-origin stays because the PNG export reads the frame's document.
  // If that ever stops being true, this is the reminder to drop it.
  it("shares the app's origin only because the PNG export reads the frame", () => {
    expect(PREVIEW_SANDBOX).toBe("allow-scripts allow-same-origin")
    const studio = readFileSync(resolve(__dirname, "boardUIStudio.tsx"), "utf8")
    expect(studio).toMatch(/iframeRef\.current\?\.contentDocument/)
    expect(studio).not.toMatch(/postMessage/)
    expect(studio.match(/sandbox=\{PREVIEW_SANDBOX\}/g)).toHaveLength(2)
    expect(studio).not.toMatch(/sandbox="/)
  })
})
