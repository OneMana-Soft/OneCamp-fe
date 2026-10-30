import { reloadForNewBuild } from "@/lib/newBuild"

/** Code fetched when needed (an import()). warm() asks ahead, once at a time, and never rejects; a failure is asked
 * again next time. use() is the module, or null: a chunk the server says is gone (a deploy) reloads the page once
 * (lib/chunkRecovery's one probe), else said(why). */
export function lazyChunk<M>(load: () => Promise<M>) {
  let asked: Promise<M> | null = null
  const fetch = () =>
    (asked ??= load().catch((e: unknown) => {
      asked = null
      throw e
    }))
  return {
    warm: (): void => void fetch().catch(() => undefined),
    use: (said: (cause: unknown) => void): Promise<M | null> =>
      fetch().catch(async (e: unknown) => {
        if (!(await reloadForNewBuild(e))) said(e)
        return null
      }),
  }
}
