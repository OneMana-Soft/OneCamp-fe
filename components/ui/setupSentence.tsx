import { setupTokens } from "@/lib/text/setupTokens"

/**
 * A server's setup sentence ("…isn't set up on this server. Register an app at
 * launchpad.37signals.com/integrations, then set BASECAMP_OAUTH_CLIENT_ID…"),
 * word for word, with its settings in the app's inline code (chat's: the press
 * overlay, r4) and its addresses as links that open in a new tab.
 */
export function SetupSentence({ text }: { text: string }) {
  return (
    <span className="[overflow-wrap:anywhere]">
      {setupTokens(text).map((t, i) =>
        t.kind === "code" ? (
          <code key={i} className="rounded-[4px] bg-press px-1 py-px font-mono text-[0.9em] text-foreground">
            {t.text}
          </code>
        ) : t.kind === "link" ? (
          <a key={i} href={t.href} target="_blank" rel="noreferrer noopener" className="text-foreground underline underline-offset-2">
            {t.text}
          </a>
        ) : (
          t.text
        ),
      )}
    </span>
  )
}
