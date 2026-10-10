import { Table as TableIcon } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"

/**
 * A table's icon: the emoji its owner chose, or, when they chose none, the
 * table icon on a tile in the table's own hue (lib/campHue), so tables in a
 * list are told apart at a glance and each keeps its colour wherever it
 * shows. The fallback was a 📊 in four places, and then a grey icon.
 */
export function TableGlyph({ icon, id, size = "md", className }: { icon?: string | null; id?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const text = { sm: "text-base", md: "text-lg", lg: "text-2xl" }[size]
  if (icon && icon.trim()) {
    return <span className={cn(text, "leading-none", className)} aria-hidden="true">{icon}</span>
  }
  const px = { sm: 20, md: 24, lg: 32 }[size]
  return <IdentityMark id={id || "table"} variant="tile" size={px} icon={<TableIcon />} className={className} />
}
