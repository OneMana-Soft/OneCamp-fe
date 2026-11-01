/**
 * Makes this runtime name zones as WebKit does (V-135): each name is read as
 * given, so "Asia/Calcutta" stays "Asia/Calcutta". Chromium, Firefox and Node
 * read a zone's other names as one. Formatting is unchanged, so every zone
 * keeps its clock. Returns the undo. Reset modules first, so that no formatter
 * kept from before is used.
 */
export function readZoneNamesAsGiven(): () => void {
  const Real = Intl.DateTimeFormat
  Intl.DateTimeFormat = new Proxy(Real, {
    construct(target, args) {
      const made: Intl.DateTimeFormat = Reflect.construct(target, args)
      const given = (args[1] as Intl.DateTimeFormatOptions | undefined)?.timeZone
      if (given) {
        const real = made.resolvedOptions.bind(made)
        made.resolvedOptions = () => ({ ...real(), timeZone: given })
      }
      return made
    },
  })
  return () => {
    Intl.DateTimeFormat = Real
  }
}
