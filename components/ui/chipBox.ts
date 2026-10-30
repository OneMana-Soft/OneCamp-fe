// A chip's box, for a row that must know its chips' widths before it draws
// them (a note's tag chips: the ones that fit whole, then "+2"). Apart from
// the chip itself (components/ui/chip), so the pages that only draw chips
// never carry the measuring.
import { textWidth } from "@/lib/rowFit"

/**
 * A chip's box as the `chip` utility draws it (8px each side, a 6px dot and
 * the 6px gap after it, words at 12/510). chipBox.test pins these to
 * globals.css and to HueDot.
 */
export const CHIP_BOX = { side: 8, dot: 6, gap: 6, size: 12, weight: 510 } as const

/** A chip's width in px for `words` in the page's font `family`, with its dot or without. */
export function chipWidth(words: string, family: string, dot = false): number {
  const b = CHIP_BOX
  return Math.ceil(textWidth(words, `${b.weight} ${b.size}px ${family}`) + 2 * b.side + (dot ? b.dot + b.gap : 0))
}
