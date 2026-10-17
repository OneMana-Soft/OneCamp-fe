/**
 * jsdom has no PointerEvent: without one, a pointer event carries no
 * coordinates, id or type, and Motion's drag finds no page point. This one is
 * a MouseEvent with a pointerId, a pointerType ("mouse" unless given), whether
 * it is the primary pointer, and pageX/pageY (the client point: nothing
 * scrolls the page in jsdom). The one stand-in for every test that presses.
 */
export class PointerEventForTests extends MouseEvent {
  pointerId: number
  pointerType: string
  isPrimary: boolean
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? "mouse"
    this.isPrimary = init.isPrimary ?? true
  }
  get pageX() {
    return this.clientX
  }
  get pageY() {
    return this.clientY
  }
}

/** Puts the stand-in on window where jsdom has no PointerEvent: fireEvent's pointer events then carry it. */
export function installPointerEvent(): void {
  if (typeof window.PointerEvent !== "undefined") return
  Object.defineProperty(window, "PointerEvent", { configurable: true, writable: true, value: PointerEventForTests })
}
