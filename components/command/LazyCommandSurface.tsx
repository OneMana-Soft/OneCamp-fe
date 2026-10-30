"use client"

import type { CommandSurfaceContext } from "@/components/command/useCommandRunner"
import { lazyPart } from "@/lib/lazy/lazyPart"

const Surface = lazyPart<CommandSurfaceContext>(() => import("@/components/command/CommandSurface").then((m) => m.default)).Part
const Catalog = lazyPart<{ channelId?: string }>(() => import("@/components/command/useCommandCatalog").then((m) => m.CatalogReader)).Part

/**
 * The command surface, loaded after the conversation draws rather than with
 * it: its runner, Block Kit cards and command service were about 29 KB of
 * source on every conversation page. Its code starts loading as the composer
 * draws it, and its catalog beside it, not after it: a "/" typed in a
 * conversation's first instant waited on both. Offline, it stays nothing and
 * loads once the browser is back online (lib/lazy/lazyPart). next/dynamic
 * threw to the page's error boundary.
 */
export function LazyCommandSurface(ctx: CommandSurfaceContext) {
  return (
    <>
      <Catalog channelId={ctx.channelId} />
      <Surface {...ctx} />
    </>
  )
}
