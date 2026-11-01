import * as React from "react"

/** Where an OverlaySheetTitle tells the OverlaySheet it is in (components/ui/overlaySheet) its id. */
export const TitledBy = React.createContext<React.Dispatch<React.SetStateAction<string | null>> | null>(null)

/**
 * The title a sheet's content shows, the task's name: inside an OverlaySheet,
 * the sheet takes its name from it, so a screen reader hears the task's own
 * name, and the toasts' slot keeps off the title it can see
 * (components/ui/toastFootSlot, V-111). Anywhere else, a plain div.
 *
 * A module of its own, so content that loads apart from the sheet (the task
 * panel) never imports the sheet itself: that import gave the sheet a place
 * in the panel's chunks and re-cut every /app route's shared ones.
 */
export function OverlaySheetTitle(props: React.HTMLAttributes<HTMLDivElement>) {
  const tell = React.useContext(TitledBy)
  const id = React.useId()
  React.useLayoutEffect(() => {
    if (!tell) return
    tell(id)
    return () => tell((by) => (by === id ? null : by))
  }, [tell, id])
  return <div {...props} id={id} />
}
