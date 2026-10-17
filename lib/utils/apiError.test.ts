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

  // Decision, 16 Oct 2026 (the owner's, delegated): nobody sees raw server text or transport
  // jargon. A request that got no answer never reaches a handler, so there is no msg to read, and
  // axios's own words ("timeout of 30000ms exceeded") reached people as they were: it says what
  // happened in plain words now. An Error the app threw itself still says its own words.
  it("says a request that got no answer in plain words, never axios's", () => {
    const timedOut = { isAxiosError: true, code: "ECONNABORTED", message: "timeout of 30000ms exceeded" }
    expect(apiErrorMessage(timedOut, "fallback")).toBe("The server took too long to answer. Try again in a moment.")
    expect(apiErrorMessage({ isAxiosError: true, code: "ERR_NETWORK", message: "Network Error" }, "fallback")).toBe(
      "The server could not be reached. Check your connection and try again in a moment.",
    )
    expect(apiErrorMessage({ isAxiosError: true, code: "ECONNRESET", message: "socket hang up" }, "fallback")).toBe(
      "Couldn't reach the server. Try again.",
    )
    expect(apiErrorMessage(new Error("The call server didn't answer. Try again."), "fallback")).toBe(
      "The call server didn't answer. Try again.",
    )
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

describe("apiErrorMessage for an answer with no words of its own", () => {
  // Admin cards showed axios's "Request failed with status code 403" as their
  // error: the machinery, not the problem.
  const answered = (status: number, data: unknown = {}) => ({ response: { status, data }, message: `Request failed with status code ${status}` })

  it("says what the status means", () => {
    expect(apiErrorMessage(answered(403), "fallback")).toBe("You don't have permission to do that.")
    expect(apiErrorMessage(answered(404), "fallback")).toBe("It may have been deleted or moved.")
    expect(apiErrorMessage(answered(502))).toBe("The server hit a problem. Try again in a moment.")
  })

  it("says what the status means over a bare no, or a blank message", () => {
    expect(apiErrorMessage(answered(403, { msg: "unauthorized" }), "fallback")).toBe("You don't have permission to do that.")
    expect(apiErrorMessage(answered(409, { msg: "   " }), "fallback")).toBe("Someone changed this at the same time. Refresh and try again.")
  })

  // QA SH-02: an invitation refused with an empty 403 said "Check your
  // connection and try again", the caller's words, blaming the network.
  it("says a 403 is about permission, whatever the caller would have said", () => {
    const callers = ["Couldn't send the invitation. Check your connection and try again.", "They weren't invited. Try again.", ""]
    for (const fallback of callers) {
      expect(apiErrorMessage(answered(403), fallback)).toBe("You don't have permission to do that.")
      expect(apiErrorMessage(answered(403, { msg: "" }), fallback)).toBe("You don't have permission to do that.")
      expect(apiErrorMessage(answered(403, { msg: "Forbidden" }), fallback)).toBe("You don't have permission to do that.")
    }
  })

  // QA DSA-15: a comment answered 500 said "Failed to create comment", the
  // server's developer text.
  it("never shows a server fault's developer text: the caller's words, else the status's", () => {
    for (const msg of ["Failed to create comment", "failed to update field", "Failed to get dgraph team member list"]) {
      expect(apiErrorMessage(answered(500, { msg }), "Couldn't post your comment. Try again.")).toBe("Couldn't post your comment. Try again.")
      expect(apiErrorMessage(answered(503, { msg }))).toBe("The server hit a problem. Try again in a moment.")
    }
    expect(apiErrorMessage(answered(500), "The request wasn't sent. Try again in a moment.")).toBe("The request wasn't sent. Try again in a moment.")
    // A server fault's own words for people stay, and a refusal's "Failed to …" is a reason.
    expect(apiErrorMessage(answered(503, { msg: "Couldn't open the doc just now. Try again in a moment." }), "x")).toBe("Couldn't open the doc just now. Try again in a moment.")
    expect(apiErrorMessage(answered(400, { msg: "Failed to read the date: use YYYY-MM-DD." }), "x")).toBe("Failed to read the date: use YYYY-MM-DD.")
  })

  it("uses the caller's words for a status with none of its own, and never axios's", () => {
    expect(apiErrorMessage(answered(418), "The check could not be run.")).toBe("The check could not be run.")
    expect(apiErrorMessage(answered(418))).toBe("Try again in a moment.")
    expect(apiErrorMessage(answered(401))).not.toMatch(/status code/)
  })

  it("still prefers the server's own words", () => {
    expect(apiErrorMessage(answered(403, { msg: "Only the workspace owner can run the check." }))).toBe("Only the workspace owner can run the check.")
  })
})

describe("apiErrorMessage without a server answer", () => {
  it("puts axios's transport words into a sentence a person can act on", () => {
    const msg = apiErrorMessage({ message: "Network Error" }, "fallback")
    expect(msg).not.toBe("Network Error")
    expect(msg).toMatch(/could not be reached/)
  })
  it("still prefers the server's own message", () => {
    expect(apiErrorMessage({ message: "Network Error", response: { data: { msg: "Gmail is busy." } } })).toBe("Gmail is busy.")
  })
})
