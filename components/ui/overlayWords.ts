/**
 * An overlay with no words under its title leaves aria-describedby out, so a
 * screen reader isn't pointed at nothing. Kept apart from overlayMode, which
 * every date field reads.
 */
export const noWords = (description?: string) => (description ? {} : { "aria-describedby": undefined })
