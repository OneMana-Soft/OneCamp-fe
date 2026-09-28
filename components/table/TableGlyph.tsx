import { Table as TableIcon } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A table's icon: the emoji its owner chose, or the product's table icon when
 * they chose none. The fallback was a 📊 in four places, which put a stock
 * emoji on every untitled table in a product otherwise drawn in one icon set.
 */
export function TableGlyph({ icon, size = "md", className }: { icon?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const text = { sm: "text-base", md: "text-lg", lg: "text-2xl" }[size]
  const box = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" }[size]
  if (icon && icon.trim()) {
    return <span className={cn(text, "leading-none", className)} aria-hidden="true">{icon}</span>
  }
  return <TableIcon className={cn(box, "shrink-0 text-muted-foreground", className)} aria-hidden="true" />
}
