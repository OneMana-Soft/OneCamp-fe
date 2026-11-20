import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

// V-1086: axios's own fetch adapter writes "User-Agent: axios/<version>" on
// every request. Chromium drops it; Firefox sends it, so the CORS preflight
// asks for user-agent, which the API's allowed headers don't list, and the
// request is refused before it leaves (on Firefox, every session refresh).
// lib/http/browserFetch is that adapter without the header: a request that
// names axios's own ("fetch") brings it back, so only that module may.
const DIRS = ["app", "components", "context", "hooks", "lib", "services", "store"]
const HOME = "lib/http/browserFetch.ts"
const NAMES_AXIOS_FETCH = /adapter\s*:\s*(\[[^\]]*)?["'`]fetch["'`]|getAdapter\(\s*(\[[^\]]*)?["'`]fetch["'`]/

describe("axios's own fetch adapter", () => {
  it("is named by lib/http/browserFetch.ts alone", () => {
    const offenders = sourceFiles(DIRS, /\.tsx?$/).filter((f) => f !== HOME && NAMES_AXIOS_FETCH.test(readFileSync(f, "utf8")))
    expect(offenders).toEqual([])
  })

  it("knows each way a request can name it", () => {
    for (const named of [`adapter: "fetch"`, `adapter:'fetch'`, "adapter: `fetch`", `adapter: ["xhr", "fetch"]`, `axios.getAdapter("fetch")`]) {
      expect(NAMES_AXIOS_FETCH.test(named), named).toBe(true)
    }
    for (const fine of [`adapter: browserFetch`, `fetchOptions: { keepalive: true }`, `adapter: "xhr"`]) {
      expect(NAMES_AXIOS_FETCH.test(fine), fine).toBe(false)
    }
  })
})
