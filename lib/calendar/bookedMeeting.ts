/**
 * A meeting someone booked through a booking page (CAL-BUG-4).
 *
 * A booking is an ordinary event on its owner's calendar, so deleting it or
 * dragging it to another time used to leave the guest untold: they turned up
 * to a meeting that was gone, or at the old time. The server now cancels or
 * moves the booking and emails the guest where it can; before the owner
 * confirms, the calendar names the guest and says whether they'll be told
 * (they can't be when the workspace sends no email). Pure.
 */
export interface EventBooking {
  guest_name: string
  page_title: string
  /** The guest is emailed about the change: false when the workspace sends no email. */
  guest_told: boolean
}

export interface BookedConfirm {
  title: string
  description: string
  confirmText: string
}

/** The confirmation before deleting or moving a booked meeting; `when` is the new time, for a move. */
export function bookedMeetingConfirm(b: EventBooking, action: "delete" | "move", when?: string): BookedConfirm {
  const guest = b.guest_name.trim() || "Your guest"
  const through = b.page_title.trim() ? ` through ${b.page_title.trim()}` : ""
  const booked = `${guest} booked it${through}.`
  const untold = "They won't be told: this workspace doesn't send email, so let them know yourself."
  if (action === "delete") {
    return {
      title: "Delete this booked meeting?",
      description: `${booked} ${b.guest_told ? "We'll email them that it's cancelled." : untold}`,
      confirmText: b.guest_told ? `Delete and tell ${guest}` : "Delete meeting",
    }
  }
  return {
    title: "Move this booked meeting?",
    description: `${booked} ${b.guest_told ? `We'll email them the new time${when ? `, ${when}` : ""}.` : untold}`,
    confirmText: b.guest_told ? `Move and tell ${guest}` : "Move meeting",
  }
}
