// A trash row's line under its name: who put it there and when, and when it
// goes for good on its own. The one line docs' trash and the tables' trash
// share (V-121), so both say it the same way, each date's full time in its
// title. The date it goes is only ever the server's: a trash that keeps what's
// in it sends none, and then none shows. "by" and the name sit in one inline
// box, so a narrow line breaks before "by", the name wraps only between its
// words, and only a single word longer than the line breaks inside itself.

import { agoOrDate, fullDateTime, shortDate } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"

const dated = (raw: string | undefined) => {
  const d = raw ? new Date(raw) : null
  return d && !isNaN(d.getTime()) ? d : null
}

export interface TrashMetaProps {
  /** What put it there: "Deleted", or "Archived" for docs' archive. */
  verb: string
  /** When. */
  at?: string
  /** Who, by name. */
  who?: string
  /** When it goes for good on its own, as the server says. */
  purgeAt?: string
  className?: string
}

export function TrashMeta({ verb, at, who, purgeAt, className }: TrashMetaProps) {
  const when = dated(at)
  const goes = dated(purgeAt)
  return (
    <p className={cn("break-words text-meta text-ink-3", className)}>
      {when && (
        <span title={fullDateTime(when)}>
          {verb} {agoOrDate(when)}
          {who ? (
            <>
              {" "}
              <span className="inline-block max-w-full">by {who}</span>
            </>
          ) : null}
        </span>
      )}
      {goes && (
        <span title={fullDateTime(goes)}>
          {when ? " · " : ""}goes for good on {shortDate(goes)}
        </span>
      )}
    </p>
  )
}
