/**
 * Whether the last thing the person did was with a pointer or a key.
 *
 * Design v3's keyboard rule (shell, "Motion vocabulary"): nothing a keystroke
 * triggers animates its result. J/K, G then X, ⌘\ and Esc are instant; the
 * same change made with the mouse may fade in. Read at the moment of the
 * change, so a surface can decide whether to play its 120ms fade.
 */

let last: "pointer" | "key" = "pointer"
let listening = false

function listen() {
  if (listening || typeof window === "undefined") return
  listening = true
  window.addEventListener("pointerdown", () => { last = "pointer" }, { capture: true, passive: true })
  window.addEventListener("keydown", (e) => {
    // A modifier on its own is not an action.
    if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) last = "key"
  }, { capture: true, passive: true })
}

/** True when the last input was a pointer (or nothing yet). */
export function lastInputWasPointer(): boolean {
  listen()
  return last === "pointer"
}

/** Starts listening, so the first answer is a real one. Call once a surface mounts. */
export function watchInputModality(): void {
  listen()
}

/**
 * For a menu's onCloseAutoFocus: focus goes back to the trigger when a key
 * closed the menu (the keyboard path, which needs to know where it is), and
 * stays put when a pointer did. Radix put it back either way, and Chrome drew
 * the 2px ring on the trigger the mouse had just used: the sidebar's foot
 * wore one after every pick from the profile menu.
 */
export function returnFocusOnlyForKeys(e: Event): void {
  if (lastInputWasPointer()) e.preventDefault()
}
