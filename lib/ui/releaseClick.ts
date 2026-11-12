export const pressNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Swallows the click that releasing a press sends: a phone follows the
 * lifted finger with a click on whatever is under it by then (the menu or
 * sheet the press opened, its item, the row behind it). Until a new press,
 * a key or 2.5 s on (a release may send none, V-878): at 6x CPU it came
 * 1.4 s on, onto the event card's scrim, and shut it (V-872). A key's click
 * (detail 0) is no release's.
 * For useLongPress, blockKeys, listReorder and the calendar's grid.
 */
export function swallowReleaseClick() {
  if (typeof window === "undefined") return;
  const onClick = (e: MouseEvent) => {
    if (e.detail === 0) return;
    done();
    e.preventDefault();
    e.stopPropagation();
  };
  const ends = ["touchstart", "pointerdown", "keydown"];
  const done = () => {
    clearTimeout(bound);
    window.removeEventListener("click", onClick, true);
    for (const type of ends) window.removeEventListener(type, done, true);
  };
  const bound = setTimeout(done, 2_500);
  window.addEventListener("click", onClick, true);
  for (const type of ends) window.addEventListener(type, done, true);
}
