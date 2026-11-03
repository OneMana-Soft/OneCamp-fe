/**
 * News nobody asked for (V-385): OneCamp AI's daily note, and any notice like
 * it. A toast that answers something the person just did is not news, and
 * never comes here: it shows at once, as it always has.
 *
 * News waits until nothing is in its way, and steps aside if something comes:
 *   - an open dialog (role dialog or alertdialog, data-state open, as Radix
 *     dialogs, sheets and drawers mark themselves): a toast sits above
 *     dialogs, and on a phone it covered the button of the form someone had
 *     just opened;
 *   - a work surface: an element marked data-work-surface, which a board's
 *     page and a call's stage set in their own chunks. On a phone the daily
 *     note sat over a board's lower canvas, where a finger meets the shapes,
 *     and took the taps meant for them (DESIGN-BUILD-96, miro-40 H1).
 * So news that comes while a board is open shows on the next ordinary page.
 *
 * A chunk of its own (app/firstLoad.test's SHELL_LAZY): only news brings it,
 * and it imports nothing, so no first screen carries it.
 */

/** What news waits for: an open dialog, or a work surface. */
const IN_THE_WAY = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-work-surface]'

let made = 0

/**
 * Shows news once nothing is in its way. show(mark) puts it up, marked
 * data-news={mark} (the Toaster hands a toast's other props to its element),
 * and returns how to take it down. While it is up, something coming into its
 * way takes it down, and it shows again once that has gone. Once it closes by
 * itself (its time ran out, or the person closed or followed it), the watch
 * ends. Returns a function that calls it off; news already up stays.
 */
export function showNews(show: (mark: string) => () => void, root: Document = document): () => void {
  const mark = `news-${++made}`
  let hide: (() => void) | null = null
  // Whether its element has been drawn since it was last shown: until then,
  // not finding it means it hasn't come yet, not that it has gone.
  let drawn = false
  const watch = new MutationObserver(() => check())
  const check = () => {
    const inTheWay = !!root.querySelector(IN_THE_WAY)
    if (!hide) {
      if (!inTheWay) hide = show(mark)
      return
    }
    if (root.querySelector(`[data-news="${mark}"][data-state="open"]`)) drawn = true
    else if (drawn) {
      watch.disconnect()
      return
    }
    if (inTheWay) {
      hide()
      hide = null
      drawn = false
    }
  }
  check()
  watch.observe(root.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "data-work-surface"] })
  return () => watch.disconnect()
}
