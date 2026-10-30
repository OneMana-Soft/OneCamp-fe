/**
 * Who holds something now, read with useSyncExternalStore: hold() lasts until
 * its release, which lets go once; held() is true while anyone holds. Held from
 * an effect, so unmounting lets go (components/error/pillPlace, context/LoadingContext).
 */
export function holdStore() {
  let count = 0
  const listeners = new Set<() => void>()
  const tell = () => listeners.forEach((fn) => fn())
  return {
    subscribe: (fn: () => void) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    held: () => count > 0,
    hold: () => {
      count++
      tell()
      let held = true
      return () => {
        if (!held) return
        held = false
        count--
        tell()
      }
    },
  }
}

/** The server snapshot: nobody holds it yet. */
export const heldOnServer = () => false
