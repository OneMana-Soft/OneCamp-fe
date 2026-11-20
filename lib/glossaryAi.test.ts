import { describe, expect, it } from "vitest"

import { AI_NAMES } from "@/lib/aiNames"
import { GLOSSARY, retiredIn } from "@/lib/glossary"
import { GLOSSARY_AI } from "@/lib/glossaryAi"

/**
 * The AI edition's words (lib/glossaryAi.ts). app/glossaryGuard.test.ts counts
 * their retired words in this edition's copy; the fixtures that name them sit
 * here, AI-only like the rows, so the AI-free line carries none of them.
 */
const ROWS = [...GLOSSARY, ...GLOSSARY_AI]

describe("the AI edition's words", () => {
  it("keeps its rows in term order, apart from the shared terms, each marked for the AI edition", () => {
    const terms = GLOSSARY_AI.map((r) => r.term)
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, "en")))
    expect(GLOSSARY.map((r) => r.term).filter((t) => terms.includes(t))).toEqual([])
    expect(GLOSSARY_AI.filter((r) => r.edition !== "ai").map((r) => r.term)).toEqual([])
  })

  it("finds the AI's retired words with the AI rows, and the shared rows alone don't", () => {
    expect(retiredIn("AI teammates and an AI teammate", undefined, ROWS).map((r) => r.word)).toEqual(["AI teammate", "AI teammates"])
    expect(retiredIn("Save to memory, then Your AI assistants", "components/x.tsx", ROWS)).toEqual([
      { word: "Save to memory", term: "Remember this for AI" },
      { word: "Your AI assistants", term: "Your assistants" },
    ])
    expect(retiredIn("AI teammates, Save to memory and Your AI assistants")).toEqual([])
  })

  it("names the AI by the glossary's words", () => {
    for (const name of Object.values(AI_NAMES)) expect(GLOSSARY_AI.map((r) => r.term)).toContain(name)
  })
})
