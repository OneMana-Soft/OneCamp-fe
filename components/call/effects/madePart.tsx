"use client"

// The made background's part (meet-09): the composer, a lazy chunk of its own
// (AiBackground.tsx), in its frame (composerFrame.tsx), which holds the place
// while it comes. One that can't load (offline for a moment) says so in the
// frame and is asked for again on Try again, on the next Make one, and when
// the browser is back online: never a reload, which would leave the call. Only
// a release that took the chunk away reloads, once, as every lazy part does
// (lib/loadChunk). chooserPart hands it to the chooser for a member whose
// workspace's AI is on, so a guest never loads it; it is imported from every
// call page's first load (livekit/callDevices), so it builds once (callBuildsOnceGuard).

import { lazyPart } from "@/lib/lazy/lazyPart"
import { ComposerLoading, ComposerUnloaded, type ComposerProps } from "./composerFrame"

const composer = lazyPart<ComposerProps>(() => import("./AiBackground").then((m) => m.default), { placeholder: ComposerLoading, failed: ComposerUnloaded })

export default composer.Part
