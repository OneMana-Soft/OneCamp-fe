/**
 * A column that holds dates, money or counts says so in its meta
 * (`{ align: "right" }`), and its header and cells line up on the right, so
 * figures of different widths compare digit by digit.
 */
export function columnAlignClass(meta: unknown): string | undefined {
  return (meta as { align?: string } | undefined)?.align === "right" ? "text-right [&>div]:justify-end" : undefined
}
