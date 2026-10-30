/** How long after a hold is released its click can still arrive. */
const RELEASE_CLICK_MS = 600;

export const pressNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Swallows the click that releasing a press sends. A phone follows the lifted
 * finger with a click on whatever is under it by then: the menu or sheet the
 * press just opened, its own item, or the row behind it. A new touch or press
 * first means a new tap, which keeps its click. For whatever acts on a
 * release: useLongPress, blockKeys, listReorder and the calendar's grid.
 */
export function swallowReleaseClick() {
  if (typeof window === "undefined") return;
  const until = pressNow() + RELEASE_CLICK_MS;
  const onClick = (e: MouseEvent) => {
    done();
    if (pressNow() > until) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const done = () => {
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("touchstart", done, true);
    window.removeEventListener("pointerdown", done, true);
    clearTimeout(timer);
  };
  window.addEventListener("click", onClick, true);
  window.addEventListener("touchstart", done, true);
  window.addEventListener("pointerdown", done, true);
  const timer = setTimeout(done, RELEASE_CLICK_MS);
}
