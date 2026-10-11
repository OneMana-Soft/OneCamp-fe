import { describe, expect, it } from "vitest"
import { arrivedKeys } from "./arrival"

// Design v3 chat, C18: live things arrive; history never moves.
const item = (k: string) => ({ key: k, type: "item" })
const list = (...k: string[]) => k.map(item)

describe("which rows arrived", () => {
  it("is what was appended at the end while the reader followed it", () => {
    expect([...arrivedKeys(list("a", "b"), list("a", "b", "c"), true)]).toEqual(["c"])
  })
  it("is nothing on the first load, a prepend, a switch, or while scrolled up", () => {
    expect(arrivedKeys([], list("a", "b"), true).size).toBe(0)
    expect(arrivedKeys(list("b", "c"), list("a", "b", "c"), true).size).toBe(0)
    expect(arrivedKeys(list("a", "b"), list("x", "y", "z"), true).size).toBe(0)
    expect(arrivedKeys(list("a", "b"), list("a", "b", "c"), false).size).toBe(0)
  })
  it("is nothing for a backlog of more than three in one change", () => {
    expect(arrivedKeys(list("a"), list("a", "b", "c", "d", "e"), true).size).toBe(0)
    expect(arrivedKeys(list("a"), list("a", "b", "c", "d"), true).size).toBe(3)
  })
  it("counts messages, not a day's heading that came with them", () => {
    const next = [...list("a"), { key: "sep", type: "separator" }, item("b")]
    expect([...arrivedKeys(list("a"), next, true)]).toEqual(["b"])
  })
})
