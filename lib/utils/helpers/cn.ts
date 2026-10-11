import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge, told about design v3's own scales (app/globals.css @theme).
 *
 * WITHOUT THIS, A ROLE BESIDE A COLOUR VANISHED. tailwind-merge only knows
 * Tailwind's stock names, so it read `text-display` or `text-meta` as an
 * unknown text COLOUR, and `cn("text-display", "text-foreground")` kept the
 * colour and dropped the size: Home's "Good morning, Sam" rendered at 14px on
 * the first v3 shots (11 Oct). The same went for the elevation ladder
 * (`shadow-e1` against `shadow-none`) and the 450 weight.
 *
 * Three waves fixed this apart (calendar 740b054f, hub 19f73e9c, chat
 * 8c731b44); this is their union, plus the motion curves (`ease-spring`
 * beside `ease-out` kept both). A new @theme scale belongs here too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["3xs", "2xs", "micro", "meta", "ui-sm", "ui", "body", "body-lg", "heading", "title-1", "title-2", "title-3", "display", "doc-title"] },
      ],
      shadow: [{ shadow: ["e1", "sel", "e2", "e3", "e4", "sheet", "primary", "overlay", "dialog"] }],
      "font-weight": [{ font: ["book"] }],
      ease: [{ ease: ["standard", "push", "spring"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
