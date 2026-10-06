import { Fragment } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { textBlocks } from "@/lib/projectUpdates"

/** An update's note: paragraphs and lists, as text (never markup). */
export function UpdateText({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed text-foreground", className)}>
      {textBlocks(body).map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5 marker:text-muted-foreground">
            {b.items.map((it, j) => (
              <li key={j} className="break-words">{it}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="break-words">
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {l}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  )
}
