/**
 * Runs fn once no dialog is open, for news that isn't urgent (the daily note
 * from OneCamp AI): a toast sits above dialogs, and on a phone it covered the
 * button of the form someone had just opened. Returns a function that calls it
 * off. A dialog here is anything open with role dialog or alertdialog, as
 * Radix dialogs, sheets and drawers mark themselves.
 */
export function whenNoDialogOpen(fn: () => void, root: Document = document): () => void {
  const anyOpen = () => !!root.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
  if (!anyOpen()) {
    fn()
    return () => {}
  }
  const watch = new MutationObserver(() => {
    if (anyOpen()) return
    watch.disconnect()
    fn()
  })
  watch.observe(root.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] })
  return () => watch.disconnect()
}
