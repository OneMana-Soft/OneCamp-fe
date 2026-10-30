import { describe, expect, it } from "vitest"
import { MAX_OPTION, MAX_OPTIONS, MAX_POLL_QUESTION, MAX_QUESTION, pollOptions, pollProblem, questionGroups, questionProblem, type CallQuestionView } from "./activities"

// A call's polls and questions on this side (calls package A): a form checks
// what the server checks (business/Poll's Normalize, business/CallQA), so it
// never sends what the server refuses, and the questions read in two groups.

describe("a poll's options as the server keeps them", () => {
  it("trims them, drops blanks and drops repeats in any case, keeping the first", () => {
    expect(pollOptions(["  Yes ", "", "no", "YES", " ", "No", "Maybe"])).toEqual(["Yes", "no", "Maybe"])
  })
})

describe("what stops a poll being started", () => {
  const ok = { question: "Ship on Friday?", options: ["Yes", "No"] }

  it("is nothing for a question and two different options", () => {
    expect(pollProblem(ok)).toBeNull()
  })

  it("is a question missing, or over the server's length in characters, not bytes", () => {
    expect(pollProblem({ ...ok, question: "   " })).toBe("Write the question first.")
    expect(pollProblem({ ...ok, question: "🎉".repeat(MAX_POLL_QUESTION) })).toBeNull()
    expect(pollProblem({ ...ok, question: "a".repeat(MAX_POLL_QUESTION + 1) })).toBe(`Keep the question under ${MAX_POLL_QUESTION} characters.`)
  })

  it("is an option over the server's length", () => {
    expect(pollProblem({ ...ok, options: ["Yes", "n".repeat(MAX_OPTION + 1)] })).toBe(`Keep each option under ${MAX_OPTION} characters.`)
  })

  it("is fewer than two different options, counted as the server counts them", () => {
    expect(pollProblem({ ...ok, options: ["Yes", " yes ", ""] })).toBe("Give at least two different options.")
  })

  it("is more options than a poll may have", () => {
    const many = Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => `Option ${i + 1}`)
    expect(pollProblem({ ...ok, options: many })).toBe(`A poll can have at most ${MAX_OPTIONS} options.`)
    expect(pollProblem({ ...ok, options: many.slice(0, MAX_OPTIONS) })).toBeNull()
  })
})

describe("what stops a question being asked", () => {
  it("is nothing written, or more than the server keeps, in characters", () => {
    expect(questionProblem(" \n ")).toBe("Write your question first.")
    expect(questionProblem("Will the recording be shared?")).toBeNull()
    expect(questionProblem("é".repeat(MAX_QUESTION))).toBeNull()
    expect(questionProblem("é".repeat(MAX_QUESTION + 1))).toBe(`Keep a question under ${MAX_QUESTION} characters.`)
  })
})

describe("the questions a reader sees", () => {
  const q = (id: string, state: CallQuestionView["state"]): CallQuestionView => ({ id, text: id, votes: 0, state, at: "" })

  it("splits what's still to answer from what's answered, each in the server's order", () => {
    const groups = questionGroups([q("pinned", "open"), q("done", "answered"), q("most voted", "open"), q("older done", "answered")])
    expect(groups.open.map((x) => x.id)).toEqual(["pinned", "most voted"])
    expect(groups.answered.map((x) => x.id)).toEqual(["done", "older done"])
  })
})
