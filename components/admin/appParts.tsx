/**
 * A slash command, in code type on a quiet chip: "/giphy". No terminal icon:
 * the slash already says it is a command, and an icon that repeats its label
 * is noise. Used by the installed apps, the directory and the app editor.
 */
export function CommandChip({ command, hint }: { command: string; hint?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
      /{command}
      {hint ? <span className="opacity-60">{hint}</span> : null}
    </span>
  )
}
