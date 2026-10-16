import { afterEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ ok: true, data: {} })))
vi.mock("@/services/publicApi", () => ({ publicCall: call }))

const { sendForm } = await import("./formService")
const { numberSigns } = await import("@/lib/format/number")

afterEach(() => call.mockClear())

// The server reads a number answer in the signs its sender writes numbers
// with, which the form sends with the answers, as the tables' requests do.
describe("sending a form", () => {
  it("sends the answers as typed, with the sender's number signs", async () => {
    await sendForm("tok", { seats: "1,5" }, "")
    const [, init] = call.mock.calls[0] as unknown as [string, { body: string }]
    expect(JSON.parse(init.body)).toEqual({ answers: { seats: "1,5" }, website: "", ...numberSigns() })
  })
})
