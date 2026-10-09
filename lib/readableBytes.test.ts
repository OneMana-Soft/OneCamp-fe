import { describe, expect, it } from "vitest"
import { readableBytes } from "./readableBytes"

describe("a size as the server writes it", () => {
  it("matches helpers.ReadableBytes", () => {
    expect(readableBytes(0)).toBe("0 B")
    expect(readableBytes(512)).toBe("512 B")
    expect(readableBytes(1536)).toBe("1.5 KB")
    expect(readableBytes(5 * 1024 ** 3)).toBe("5 GB")
    expect(readableBytes(7730941132)).toBe("7.2 GB")
    expect(readableBytes(640 * 1024 ** 2)).toBe("640 MB")
    expect(readableBytes(-3)).toBe("0 B")
  })
})
