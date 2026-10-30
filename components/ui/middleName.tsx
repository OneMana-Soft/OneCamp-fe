import { cn } from "@/lib/utils/helpers/cn"
import { splitForMiddle } from "@/lib/utils/file/fileTypeHue"

/**
 * A file name cut in the middle by the room it has ("q4-launch-checkou…final.png"):
 * the start gives way and the end, with the file's type, always shows
 * (splitForMiddle). The whole name is its title.
 */
export function MiddleName({ name, className }: { name: string; className?: string }) {
  const [head, tail] = splitForMiddle(name)
  return (
    <span className={cn("flex min-w-0", className)} title={name} data-middle-name="">
      <span className="truncate">{head}</span>
      {tail && <span className="shrink-0 whitespace-pre">{tail}</span>}
    </span>
  )
}
