import { describe, expect, it } from "vitest"
import { envProblems } from "./env"

// The environment's check, written by hand so the first screen doesn't
// carry Zod (fluid-15). It keeps the schema's verdicts: the backend's
// address is required and must parse as a URL; the app's own address may be
// left out, but if given (even empty) it must parse too.
describe("envProblems", () => {
  const backend = "https://api.example.com/"

  it("passes a backend address and no app address", () => {
    expect(envProblems({ NEXT_PUBLIC_BACKEND_URL: backend })).toEqual([])
  })

  it("passes both addresses", () => {
    expect(envProblems({ NEXT_PUBLIC_BACKEND_URL: backend, NEXT_PUBLIC_APP_URL: "https://app.example.com" })).toEqual([])
  })

  it("flags a missing backend address", () => {
    expect(envProblems({})).toEqual(["NEXT_PUBLIC_BACKEND_URL must be a URL"])
  })

  it("flags a backend address that is not a URL, or is empty", () => {
    expect(envProblems({ NEXT_PUBLIC_BACKEND_URL: "api.example.com" })).toHaveLength(1)
    expect(envProblems({ NEXT_PUBLIC_BACKEND_URL: "" })).toHaveLength(1)
  })

  it("flags an app address that is given but not a URL, empty included", () => {
    expect(envProblems({ NEXT_PUBLIC_BACKEND_URL: backend, NEXT_PUBLIC_APP_URL: "app" })).toEqual(["NEXT_PUBLIC_APP_URL must be a URL"])
    expect(envProblems({ NEXT_PUBLIC_BACKEND_URL: backend, NEXT_PUBLIC_APP_URL: "" })).toEqual(["NEXT_PUBLIC_APP_URL must be a URL"])
  })
})
