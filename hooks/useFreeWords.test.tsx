import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useFreeWords } from "@/hooks/useFreeWords"
import { freeWords } from "@/lib/search/query"

describe("the free words of a search", () => {
  it("are undefined until the grammar is here, then the text without its filters", async () => {
    const { result, rerender } = renderHook(({ text }) => useFreeWords(text), { initialProps: { text: "budget from:@sam during:past_7_days" } })
    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBe("budget"))
    rerender({ text: "what is the launch date in:#launch" })
    expect(result.current).toBe("what is the launch date")
  })

  // Before the grammar is here, a text without a colon is already its words
  // (app/app/search/searchWordsLate.test.tsx holds the grammar back). That
  // answer is the grammar's own: on every case of the shared fixture without
  // a colon, its free words are the text, trimmed.
  it("agree with the grammar on every text without a colon", () => {
    const { cases } = JSON.parse(readFileSync(join(process.cwd(), "testdata/searchquery/parse.json"), "utf8")) as { cases: { text: string }[] }
    const plain = cases.map((c) => c.text).filter((t) => !t.includes(":"))
    expect(plain.length).toBeGreaterThan(50)
    for (const text of plain) expect(freeWords(text), text).toBe(text.trim())
  })
})
