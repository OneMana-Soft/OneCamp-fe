import { describe, expect, it } from "vitest"

import { fileSize, formatFileSizeForAttachment as size } from "./formatFileSizeForAttachment"

// One way to write a file's size (design review, 21 Oct 2026): Docs & Files'
// rows, its preview and versions, every attachment, the project's files and
// an upload's refusal all say it the same way. It was "645 Bytes" and
// "23.51 KB" in the rows, "2.0 MB" in a refusal and "2.4 MB" on a card.

describe("a file's size", () => {
  it("says whole bytes under a kilobyte", () => {
    expect(size(645)).toBe("645 bytes")
    expect(size(9)).toBe("9 bytes")
    expect(size(1)).toBe("1 byte")
    expect(size(1023)).toBe("1023 bytes")
  })

  it("says a kilobyte and up with one decimal, none when it is whole", () => {
    expect(size(24_064)).toBe("23.5 KB")
    expect(size(24_074)).toBe("23.5 KB")
    expect(size(1_423)).toBe("1.4 KB")
    expect(size(1024)).toBe("1 KB")
    expect(size(880_640)).toBe("860 KB")
    expect(size(2_202_010)).toBe("2.1 MB")
    expect(size(2_516_582)).toBe("2.4 MB")
    expect(size(5 * 1024 ** 3)).toBe("5 GB")
  })

  it("never says 1024 of a unit", () => {
    // 1,023.97 KB rounds to 1024.0: it is 1 MB.
    expect(size(1_048_550)).toBe("1 MB")
    expect(size(1_048_500)).toBe("1023.9 KB")
    expect(size(1024 ** 3 - 1)).toBe("1 GB")
  })

  it("says 0 bytes for a size that isn't one", () => {
    for (const n of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(size(n)).toBe("0 bytes")
  })

  // A line of facts leaves out a size that isn't one: a recording that captured nothing said "0 bytes" in its
  // player's header (DB-28 on V-32), where its row said nothing. The row, the player and a project's file card take
  // this one function.
  it("says nothing for a file with no size, where a line of facts leaves it out", () => {
    expect(fileSize(2_516_582)).toBe("2.4 MB")
    expect(fileSize(645)).toBe("645 bytes")
    for (const n of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(fileSize(n)).toBe("")
  })
})
