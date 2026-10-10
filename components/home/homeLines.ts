/**
 * Home's two vertical lines.
 *
 * Every block on Home (the greeting band, the setup and demo cards, the AI
 * cards and the lists) starts its first glyph on one line, `homeInset` in from
 * the column's edge (16px on a phone, 20px from md), and its text on a second
 * line a 24px glyph and a 12px gap further in. Section labels and rows without
 * a glyph start on the first line; titles and rows that follow a glyph start on
 * the second.
 *
 * Measured on 10 Oct at 1440, text in Home's one column started at eight
 * different x positions (330, 339, 350, 361, 364, 371, 373 and 387) and glyphs
 * at three, because each block chose its own padding (8, 16, 20 or 28px) and
 * its own gap (6, 8, 10 or 12px) after a 16, 24 or 32px glyph. The task panel,
 * the owner's bar, keeps its values on one line; Home now does too.
 */

/** Where a block's first glyph, or its text when it has none, starts. */
export const homeInset = "px-4 md:px-5"

/** The 24px column a row's glyph sits in: a tile fills it, a 16px icon centres in it. */
export const homeGlyph = "flex w-6 shrink-0 justify-center"

/** Between the glyph column and the text: 12px. */
export const homeGap = "gap-3"

/**
 * For text that sits under a title which follows a glyph (a card's one line of
 * explanation): the inset plus the glyph and the gap, so it starts where the
 * title does.
 */
export const homeTextInset = "pl-[3.25rem] pr-4 md:pl-[3.5rem] md:pr-5"
