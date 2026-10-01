import { describe, expect, it } from "vitest"
import { routableModels, routeValue, routesFromValues, type AuthorizedModel } from "./aiModelService"

const m = (over: Partial<AuthorizedModel>): AuthorizedModel => ({
  id: "1", provider_id: "p1", provider_kind: "openai", provider_label: "OpenAI", model: "gpt-x", label: "",
  enabled: true, provider_enabled: true, context_window_tokens: 0, max_output_tokens: 0, ...over,
})

describe("model routing helpers", () => {
  it("offers only models that can run", () => {
    const list = [m({ id: "a" }), m({ id: "b", enabled: false }), m({ id: "c", provider_enabled: false })]
    expect(routableModels(list).map((x) => x.id)).toEqual(["a"])
  })

  it("round-trips a route through the select, and drops the default", () => {
    const v = routeValue({ provider_id: "p1", model: "llama3.2:3b" })
    expect(routesFromValues({ summaries: v, meetings: "" })).toEqual({
      summaries: { provider_id: "p1", model: "llama3.2:3b" },
    })
    expect(routeValue(undefined)).toBe("")
  })

  it("keeps a model name that itself contains a bar", () => {
    expect(routesFromValues({ memory: "p9|org/model|v2" })).toEqual({ memory: { provider_id: "p9", model: "org/model|v2" } })
  })
})
