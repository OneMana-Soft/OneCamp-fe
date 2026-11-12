"use client";
import { X, Share } from "@/lib/icons";
import type { PwaPromptKind } from "@/lib/utils/pwaPrompt";

// The PWA card's words and buttons, which PwaInstallPrompt draws inside its
// corner card, beside the logo, once there is something to suggest: a chunk of
// its own, so no page's first load carries them. It only presents; the prompt
// decides when, and what Install and Not now do. It reaches nothing the root
// layout doesn't already have (app/firstLoad.test.ts).

export default function PwaInstallCardBody({
  kind,
  onInstall,
  onDismiss,
}: {
  kind: Exclude<PwaPromptKind, null>;
  onInstall: () => void;
  onDismiss: () => void;
  /** For the prompt's fallback when this code can't come; the body itself never calls it. */
  onUnavailable: () => void;
}) {
  return (
    <>
      {kind === "install" ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Add OneCamp to your home screen</p>
            <p className="text-xs text-muted-foreground">Opens like an app, with notifications.</p>
          </div>
          <button
            onClick={onInstall}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Install
          </button>
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Add OneCamp to your home screen</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Tap <Share className="mx-0.5 inline h-3 w-3 text-foreground" /> Share, then <strong>Add to Home Screen</strong>.
          </p>
        </div>
      )}
      <button
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Not now"
      >
        <X className="h-4 w-4" />
      </button>
    </>
  );
}
