import { Table as TableIcon } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"

/**
 * A table's icon: a tile in the table's own hue (lib/campHue), holding the
 * emoji its owner chose or, when they chose none, the table icon. So tables in
 * a list are told apart at a glance, each keeps its colour wherever it shows,
 * and every icon in a list is the same shape: an emoji stood bare beside the
 * tiles, a little larger and on no ground. The fallback was a 📊 in four
 * places, and then a grey icon.
 */
export function TableGlyph({ icon, id, size = "md", className }: { icon?: string | null; id?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const px = { sm: 20, md: 24, lg: 32 }[size]
  const emoji = icon?.trim()
  return (
    <IdentityMark
      id={id || "table"}
      variant="tile"
      size={px}
      icon={emoji ? <span aria-hidden="true" className="leading-none" style={{ fontSize: Math.round(px * 0.55) }}>{emoji}</span> : <TableIcon />}
      className={cn("shrink-0", className)}
    />
  )
}
