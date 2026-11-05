import { cn } from "@/lib/utils/helpers/cn"
import { nameList, nameParts } from "@/lib/utils/format/nameList"

/**
 * Who is in something, as one line beside their faces, in nameList's words
 * ("Maya, Jonas and 2 others"; count takes in people with no name): a name
 * may be cut, the count never is (as MiddleName keeps a file's type). Where
 * the line has under 10rem, the count reads "+2" so the names keep their room;
 * it is heard in full either way. It fills the room it is given (flex-1): it
 * measures that room, not its words.
 */
export function PeopleLine({ names, count, className }: { names: string[]; count: number; className?: string }) {
  const words = nameList(names, 2, count)
  const [shown, rest] = nameParts(names, 2, count)
  if (!words) return null
  if (!rest || !shown.length) return <span data-people-line="" className={cn("min-w-0 truncate", className)}>{words}</span>
  const head = shown.join(", ")
  return (
    <span data-people-line="" className={cn("@container min-w-0 flex-1", className)}>
      <span className="sr-only">{words}</span>
      <span aria-hidden="true" className="flex min-w-0">
        <span className="truncate">{head}</span>
        <span className="shrink-0 whitespace-pre @max-[10rem]:hidden">{words.slice(head.length)}</span>
        <span className="hidden shrink-0 whitespace-pre @max-[10rem]:inline"> +{rest}</span>
      </span>
    </span>
  )
}
