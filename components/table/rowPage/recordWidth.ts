import * as React from "react"

/**
 * How a record opens: beside the grid (a side panel), or as a page across
 * the window, its fields above its page (tables T2). Each person's choice,
 * remembered in this browser alone; the side panel when it can't be read.
 */
const KEY = "tables.record.asPage"

function readAsPage(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

export function useRecordAsPage(): [boolean, (asPage: boolean) => void] {
  const [asPage, setAsPage] = React.useState(false)
  React.useEffect(() => {
    setAsPage(readAsPage())
  }, [])
  const choose = React.useCallback((next: boolean) => {
    setAsPage(next)
    try {
      if (next) window.localStorage.setItem(KEY, "1")
      else window.localStorage.removeItem(KEY)
    } catch {
      // kept for this visit only
    }
  }, [])
  return [asPage, choose]
}
