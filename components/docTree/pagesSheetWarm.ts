// The phone's Pages sheet, made ready on the docs home's quiet (fluid-06,
// Fix 3): its code, its three groups' first levels in the tree's cache and
// its rows' menu, so a tap on Pages, and then on a row's "⋯", fetches
// nothing. A module of its own, light enough for the docs home to carry: the
// sheet comes with import() when it's called.

/**
 * Loads the Pages sheet's code, reads its groups' first levels ahead and
 * fetches its rows' menu. It never rejects: when the code can't come, a tap
 * on Pages fetches it again (lib/lazy/lazyPart), and says so if it can't.
 */
export function warmPagesSheet(): Promise<void> {
  return import("@/components/docTree/PagesSheet").then(
    (m) => m.warmSheet(),
    () => undefined,
  )
}
