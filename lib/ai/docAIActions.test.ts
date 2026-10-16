import { describe, expect, it } from "vitest"
import {
  DOC_AI_ACTIONS,
  DOC_AI_TONES,
  isQuestion,
  matchOffer,
  modelLine,
  offerFor,
  outputKind,
  readerOffer,
  stillWorkingLine,
  typedAction,
  workingLabel,
  type DocAIActionId,
} from "./docAIActions"

// The doc AI bar's offer (ai-search-io §2.1, P0-5): what it lists where it was
// opened, what typed words do, and how it names the model before anything is
// sent (P0-6).

const ids = (groups: ReturnType<typeof offerFor>) => groups.map((g) => [g.group, g.actions.map((a) => a.id)])

describe("what the bar offers", () => {
  it("offers ways to change a selection, then to ask about it", () => {
    expect(ids(offerFor({ hasSelection: true, docEmpty: false }))).toEqual([
      ["Edit", ["improve", "fix", "shorter", "longer", "simplify", "tone", "translate"]],
      ["Ask", ["explain", "summarize", "ask"]],
    ])
  })

  it("offers ways to go on at a caret, and the whole doc's actions", () => {
    const groups = offerFor({ hasSelection: false, docEmpty: false })
    expect(ids(groups)).toEqual([
      ["Write", ["continue", "summarize", "action_items"]],
      ["This doc", ["translate", "ask"]],
    ])
    expect(groups[1].actions[0].label).toBe("Translate this doc")
  })

  it("offers only questions about blocks chosen apart, which one answer can't be written back into", () => {
    expect(ids(offerFor({ hasSelection: true, docEmpty: false, scattered: true }))).toEqual([["Ask", ["explain", "summarize", "ask"]]])
    expect(typedAction("make them shorter", { hasSelection: true, docEmpty: false, askMode: false, scattered: true })).toBe("ask")
  })

  it("starts an empty doc from its project's open tasks, and offers nothing it can't do there", () => {
    expect(ids(offerFor({ hasSelection: false, docEmpty: true, projectTasks: true }))).toEqual([["Start", ["draft_from_tasks"]]])
    expect(offerFor({ hasSelection: false, docEmpty: true })).toEqual([])
  })

  it("narrows to what was typed, by name or by the words an action is known by", () => {
    const offer = offerFor({ hasSelection: true, docEmpty: false })
    expect(ids(matchOffer(offer, "short"))).toEqual([["Edit", ["shorter"]]])
    expect(ids(matchOffer(offer, "formal"))).toEqual([["Edit", ["tone"]]])
    expect(ids(matchOffer(offer, "fren"))).toEqual([["Edit", ["translate"]]])
    expect(ids(matchOffer(offer, "  "))).toEqual(ids(offer))
    expect(matchOffer(offer, "zzz")).toEqual([])
  })

  it("names the five tones the server takes", () => {
    expect(DOC_AI_TONES.map((t) => t.id)).toEqual(["professional", "casual", "direct", "confident", "friendly"])
  })
})

describe("typed words", () => {
  it("change a selection, unless they ask about it", () => {
    const sel = { hasSelection: true, docEmpty: false, askMode: false }
    expect(typedAction("make it a table", sel)).toBe("edit")
    expect(typedAction("what does this mean?", sel)).toBe("ask")
  })

  it("write at a caret, draft an empty doc, and answer a question", () => {
    expect(typedAction("a haiku about launches", { hasSelection: false, docEmpty: false, askMode: false })).toBe("write")
    expect(typedAction("a rollout checklist", { hasSelection: false, docEmpty: true, askMode: false })).toBe("draft")
    expect(typedAction("who owns the launch", { hasSelection: false, docEmpty: false, askMode: false })).toBe("ask")
    expect(typedAction("make it shorter", { hasSelection: false, docEmpty: false, askMode: true })).toBe("ask")
  })

  it("read as a question by their mark or their first word", () => {
    expect(isQuestion("Is this ready?")).toBe(true)
    expect(isQuestion("how do we ship")).toBe(true)
    expect(isQuestion("ship it")).toBe(false)
  })
})

describe("the model, named before anything is sent", () => {
  it("says a local model runs on the workspace's own server", () => {
    expect(modelLine({ name: "qwen3:4b", label: "qwen3 4B", provider: "ollama", local: true })).toBe("Runs on your server · qwen3 4B")
    expect(stillWorkingLine({ name: "qwen3:4b", label: "qwen3 4B", provider: "ollama", local: true })).toBe("Still writing · local model")
  })

  it("says where the text goes for a hosted one", () => {
    expect(modelLine({ name: "gpt-4.1-mini", label: "gpt-4.1-mini", provider: "openai", provider_label: "OpenAI", local: false })).toBe(
      "Sent to OpenAI · gpt-4.1-mini",
    )
    expect(modelLine({ name: "m", label: "m", provider: "x", local: false })).toBe("Sent to a hosted model · m")
    expect(stillWorkingLine(null)).toBe("Still writing")
    expect(modelLine(null)).toBe("")
  })
})

describe("the words", () => {
  it("are British and in sentence case", () => {
    const words = [...Object.values(DOC_AI_ACTIONS).map((a) => a.label), ...(Object.keys(DOC_AI_ACTIONS) as DocAIActionId[]).map(workingLabel)]
    for (const w of words) {
      expect(w, w).not.toMatch(/summariz|organiz|color\b/i)
      expect(w[0], w).toBe(w[0].toUpperCase())
      // After the first word, only "AI" is capitalised.
      expect(w.split(" ").slice(1).filter((x) => /^[A-Z]/.test(x) && x !== "AI"), w).toEqual([])
    }
    expect(workingLabel("summarize")).toBe("Summarising")
    expect(DOC_AI_ACTIONS.summarize.label).toBe("Summarise")
  })
})

// Docs incident follow-up (15 Oct 2026): how an answer is given follows what
// the person may do, in one place.
describe("how an answer is given", () => {
  it("is the action's own for someone who may change the doc", () => {
    expect(outputKind("summarize", true)).toBe("write")
    expect(outputKind("improve", true)).toBe("transform")
    expect(outputKind("explain", true)).toBe("answer")
  })

  it("is read in the bar for someone who may not: a summary, never put in the doc", () => {
    expect(outputKind("summarize", false)).toBe("answer")
    expect(outputKind("explain", false)).toBe("answer")
    // A transform stays one: the offer leaves it out, and the server refuses it.
    expect(outputKind("improve", false)).toBe("transform")
  })

  it("offers a reader what the server answers for view, by the same rule", () => {
    const needs = { explain: "view", ask: "view", summarize: "view", translate: "view", continue: "edit", improve: "edit" }
    const offered = (place: Parameters<typeof offerFor>[0]) => ids(readerOffer(offerFor(place), needs))
    expect(offered({ hasSelection: true, docEmpty: false })).toEqual([["Ask", ["explain", "summarize", "ask"]]])
    // At the caret too, under one heading: a reader's summary is read, so
    // never under "Write".
    expect(offered({ hasSelection: false, docEmpty: false })).toEqual([["Ask", ["summarize", "ask"]]])
    expect(offered({ hasSelection: false, docEmpty: true })).toEqual([])
    expect(readerOffer(offerFor({ hasSelection: true, docEmpty: false }), null)).toEqual([])
  })
})
