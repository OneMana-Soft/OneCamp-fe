"use client"

/**
 * A board's embed code in its share card (miro-34): another site may frame a
 * board's link at <link>/embed (lib/security/framing.ts). A link made earlier
 * can't show its token again, so the code comes with a new link. The card's
 * slot draws it (GuestLinkSection extra), and only the board's share dialog
 * imports it: the other share dialogs carry none of it.
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { embedCode } from "@/lib/embeds/embedCode"
import { Check, Code } from "@/lib/icons"

/** Before a link is made (link ""), the note; with a new link, its embed code and the copy hint for both. */
export function BoardEmbedRow({ link, name }: { link: string; name?: string }) {
  if (!link) {
    return (
      <p className="basis-full text-meta text-ink-3" data-embed-note="">
        A new link also gives the code to embed this board in a website.
      </p>
    )
  }
  return (
    <>
      <EmbedCodeCopy code={embedCode(link, name?.trim() || "Shared board")} />
      <p className="text-meta text-ink-3">Copy the link or the embed code now: neither is shown again.</p>
    </>
  )
}

/**
 * The embed code, copied with one press. Where the clipboard is blocked, the
 * code shows in a field to select and copy by hand.
 */
function EmbedCodeCopy({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false)
  const [shown, setShown] = React.useState(false)
  return (
    <div className="grid gap-1.5" data-embed-code="">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 justify-self-start gap-1.5 px-2 text-ui-sm font-medium text-ink-2"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            setShown(true)
          }
        }}
      >
        {copied ? <Check className="size-3.5 text-[var(--camp-moss-ink)]" aria-hidden="true" /> : <Code className="size-3.5" aria-hidden="true" />}
        {copied ? "Copied" : "Copy embed code"}
      </Button>
      {shown ? (
        <textarea
          value={code}
          readOnly
          rows={3}
          aria-label="Embed code"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full resize-none rounded-lg bg-raised px-2.5 py-2 font-mono text-meta text-ink-2 shadow-e1 outline-none focus-visible:focus-halo"
        />
      ) : null}
    </div>
  )
}
