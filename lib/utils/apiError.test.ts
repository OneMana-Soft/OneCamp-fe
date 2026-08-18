import { describe, expect, it } from "vitest"

import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "./apiError"

describe("apiErrorMessage", () => {
  it("prefers the server's msg", () => {
    const error = {
      response: { data: { msg: "provider groq: the stored API key can no longer be decrypted" } },
      message: "Request failed with status code 409",
    }
    expect(apiErrorMessage(error, "fallback")).toBe(
      "provider groq: the stored API key can no longer be decrypted",
    )
  })

  it("falls back to the transport message when there is no envelope", () => {
    // A network failure never reaches a handler, so there is nothing to read msg from.
    expect(apiErrorMessage({ message: "Network Error" }, "fallback")).toBe("Network Error")
  })

  it("falls back to the caller's text when nothing useful was said", () => {
    expect(apiErrorMessage({ response: { data: {} } }, "Provider unreachable")).toBe(
      "Provider unreachable",
    )
    expect(apiErrorMessage(new Error(""), "Provider unreachable")).toBe("Provider unreachable")
  })

  it("treats an empty msg as absent rather than showing a blank toast", () => {
    expect(apiErrorMessage({ response: { data: { msg: "" } }, message: "boom" }, "f")).toBe("boom")
  })

  it("ignores the err and error keys, which carry raw driver strings", () => {
    // The server's redaction exists to keep these out of a browser; reading them here would undo
    // it from the client side.
    const error = {
      response: {
        data: {
          err: 'pq: duplicate key value violates unique constraint "users_email_key"',
          error: 'pq: null value in column "channel_id" violates not-null constraint',
        },
      },
    }
    expect(apiErrorMessage(error, "Something went wrong")).toBe("Something went wrong")
  })

  it("survives the shapes a catch block can actually receive", () => {
    expect(apiErrorMessage(undefined, "f")).toBe("f")
    expect(apiErrorMessage(null, "f")).toBe("f")
    expect(apiErrorMessage("a thrown string", "f")).toBe("f")
    expect(apiErrorMessage({ response: null }, "f")).toBe("f")
    expect(apiErrorMessage({ response: { data: null } }, "f")).toBe("f")
    expect(apiErrorMessage({ response: { data: "not an object" } }, "f")).toBe("f")
  })

  it("returns an empty string when no fallback was given", () => {
    expect(apiErrorMessage({})).toBe("")
  })
})

describe("apiErrorCode", () => {
  it("reads the condition label", () => {
    const error = { response: { data: { msg: "...", code: "provider_key_unreadable" } } }
    expect(apiErrorCode(error)).toBe("provider_key_unreadable")
  })

  it("returns an empty string when the server sent no code", () => {
    expect(apiErrorCode({ response: { data: { msg: "..." } } })).toBe("")
    expect(apiErrorCode({ message: "Network Error" })).toBe("")
    expect(apiErrorCode(undefined)).toBe("")
  })

  it("ignores a non-string code instead of coercing it", () => {
    // A number would compare false against every known code anyway; returning "" makes that
    // explicit rather than leaving `409 === "conflict"` to look like a real comparison.
    expect(apiErrorCode({ response: { data: { code: 409 } } })).toBe("")
  })
})

describe("apiErrorStatus", () => {
  it("reads the HTTP status", () => {
    expect(apiErrorStatus({ response: { status: 409, data: {} } })).toBe(409)
  })

  it("returns 0 when the request never got a response", () => {
    // A network failure has no status at all. 0 keeps `!== 409` behaving sensibly for it.
    expect(apiErrorStatus({ message: "Network Error" })).toBe(0)
    expect(apiErrorStatus(undefined)).toBe(0)
    expect(apiErrorStatus({ response: null })).toBe(0)
  })

  it("ignores a non-numeric status", () => {
    expect(apiErrorStatus({ response: { status: "409" } })).toBe(0)
  })
})
