import { describe, expect, it } from "vitest"
import { withItsWords } from "./downloadRefusal"
import { apiErrorStatus, refusalReason } from "@/lib/utils/apiError"

// An answer asked for as a file comes back as one when the server refuses
// too: its words are read back from it, as any other answer's are. jsdom's
// Blob has no text(), so the answer here is one by its shape.
describe("a refusal that came as a file", () => {
  it("hands back the refusal's own words, read from the file", async () => {
    const why = "This table has too many rows to work out a formula or a rollup over all of them yet."
    const refused = Object.assign(new Error("Request failed with status code 422"), { response: { status: 422, data: { type: "application/json", text: async () => JSON.stringify({ msg: why }) } } })
    const e = await withItsWords(refused).catch((x: unknown) => x)
    expect(apiErrorStatus(e)).toBe(422)
    expect(refusalReason(e)).toBe(why)
  })

  it("keeps a failed answer as it came when it holds no words of the server's", async () => {
    const page = { type: "text/html", text: async () => "<html>Bad gateway</html>" }
    const failed = Object.assign(new Error("Request failed with status code 502"), { response: { status: 502, data: page } })
    const e = await withItsWords(failed).catch((x: unknown) => x)
    expect((e as { response: { data: unknown } }).response.data).toBe(page)
  })
})
