"use client"

import React from "react"

import { CopyableCode } from "@/components/ui/copyable-code"
import { AlertTriangle } from "@/lib/icons"

/**
 * How to move the local inference engine to another version.
 *
 * WHY THIS IS ONE COMPONENT. The same instruction was written out by hand in three places — the engine
 * row in SystemStatsBar, and the two surfaces that report a model install failing because the engine is
 * too old (ModelInstaller, and each tile in ModelCatalog). Three copies of one operational fact, and
 * they had already drifted: one was HTML-escaped differently from the others, which is the fingerprint
 * of a copy-paste rather than a shared component.
 *
 * All three said:
 *
 *     docker compose pull ollama && docker compose up -d ollama
 *
 * which did not work on any OneCamp deployment. There is no compose.yml in the deploy directory — the
 * stack is `-f final-compose.yml` under a named project — so that line fails with "no configuration
 * file provided" wherever an admin ran it. And now that the image is pinned rather than floating,
 * `pull` on its own would fetch the version already installed and change nothing: the version lives in
 * .env, so the update is to edit it and recreate. Both halves of the old instruction were wrong, and
 * the reason nobody noticed is that the only person who could tell was already logged into a server.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. There is no button here. Replacing a container image requires
 * something in the deployment to hold the Docker socket, which is root-equivalent on the host, and the
 * service rendering this page runs AI agents against external MCP servers — the last process that
 * should have it. So this stays an operator action, and the product's job is to name the exact steps
 * instead of implying that a shell is somewhere else's problem.
 *
 * The copy affordance is the existing CopyableCode, which already handles the reset timer, the unmount
 * case, the screen-reader announcement and the clipboard-refused path. The three sites it replaces were
 * bare <code> elements with none of that.
 */
interface OllamaUpdateStepsProps {
  /**
   * The engine version running now, when the caller knows it. Used only for the rollback sentence: an
   * operator about to change a version is the one person who needs to be told what they are leaving.
   */
  currentVersion?: string
  /**
   * The version to move to. Optional because the two install-failure surfaces learn that the engine is
   * too old from the pull stream, which reports no number. Without it the steps stay correct and point
   * at the published list rather than inventing a target.
   */
  targetVersion?: string
  /**
   * "blocked" wraps the steps in the warning surface with a heading, for the places where an install
   * has just failed and this is the remedy. "plain" renders the steps alone, for the engine row that
   * already carries its own version badges and would only repeat itself.
   */
  variant?: "plain" | "blocked"
  /**
   * Named so the steps can also be reached from a stack where the engine is shared between workspaces.
   * Defaults on, because the multi-tenant layout is the one where guessing wrong restarts other
   * people's work.
   */
  showSharedHostNote?: boolean
}

/** Where published engine versions are listed. The plain version is the tag; there is no leading "v". */
const RELEASES_URL = "https://hub.docker.com/r/ollama/ollama/tags"

export function OllamaUpdateSteps({
  currentVersion,
  targetVersion,
  variant = "plain",
  showSharedHostNote = true,
}: OllamaUpdateStepsProps) {
  const steps = (
    // list-decimal rather than hand-written "1." / "2.": Tailwind's preflight removes list markers, so
    // the numbers had to be typed out, and an <ol> whose items each begin with their own number is read
    // twice by a screen reader. Restoring real markers lets the list number itself.
    <ol className="list-decimal space-y-2 pl-4 text-2xs text-muted-foreground marker:font-medium marker:text-foreground">
      <li className="space-y-1">
        <span className="block">
          {targetVersion ? (
            <>
              In the deployment&apos;s <code className="font-mono">.env</code>, set the engine version:
            </>
          ) : (
            <>
              In the deployment&apos;s <code className="font-mono">.env</code>, set{" "}
              <code className="font-mono">OLLAMA_IMAGE_TAG</code> to the release you want.{" "}
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Published versions
              </a>{" "}
              are tagged without a leading &quot;v&quot;.
            </>
          )}
        </span>
        {targetVersion && (
          <CopyableCode value={`OLLAMA_IMAGE_TAG=${targetVersion}`} label="engine version line" />
        )}
      </li>
      <li className="space-y-1">
        <span className="block">Then, from that same directory:</span>
        <CopyableCode value="make ollama_update" label="engine update command" />
      </li>
    </ol>
  )

  const notes = (
    <div className="space-y-1 text-2xs text-muted-foreground">
      <p>
        Only the engine restarts. Downloaded models live on the host disk, not inside the container, so
        they are untouched, and nothing else in the stack is recreated. Requests already in flight fail
        for the few seconds it is down.
      </p>
      <p>
        To roll back, put {currentVersion ? <span className="font-mono">{currentVersion}</span> : "the previous value"}{" "}
        back and run the same command again.
      </p>
      {showSharedHostNote && (
        <p>
          If one engine serves several workspaces on this host, it belongs to the shared stack instead —
          set the version in <span className="font-mono">shared.env</span> and run{" "}
          <span className="font-mono">make shared_ollama_update</span>. That restarts inference for every
          workspace on the host at once.
        </p>
      )}
    </div>
  )

  if (variant === "blocked") {
    return (
      <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Ollama update required
        </p>
        <p className="text-2xs text-muted-foreground">
          This model needs a newer engine than the one running. Update it, then install again.
        </p>
        {steps}
        {notes}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {steps}
      {notes}
    </div>
  )
}
