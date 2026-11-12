"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * Plain DOM: Radix drew a Provider and two spans more, and again on load, on
 * every avatar. A load unhides the image and marks its Avatar
 * data-avatar-loaded, whose CSS hides the fallback: no render, no flash.
 */
const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(({ className, ...props }, ref) => (
  <span ref={ref} className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)} {...props} />
))
Avatar.displayName = "Avatar"

const LOADED = "data-avatar-loaded"

function show(img: HTMLImageElement, root: Element | null, loaded: boolean) {
  img.hidden = !loaded
  root?.toggleAttribute(LOADED, loaded)
}

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(({ className, src, onLoad, onError, ...props }, ref) => {
  const img = React.useRef<HTMLImageElement | null>(null)
  const setRef = React.useCallback(
    (el: HTMLImageElement | null) => {
      img.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )
  React.useLayoutEffect(() => {
    const el = img.current
    if (!el) return
    // Kept: in cleanup the image has left its parent.
    const root = el.parentElement
    // One already loaded (cached) shows before the paint.
    show(el, root, el.complete && el.naturalWidth > 0)
    return () => void root?.removeAttribute(LOADED)
  }, [src])
  if (!src) return null
  return (
    <img
      ref={setRef}
      src={src}
      // Its load unhides it; a render leaves the attribute be.
      hidden
      className={cn("aspect-square h-full w-full", className)}
      onLoad={(e) => {
        show(e.currentTarget, e.currentTarget.parentElement, true)
        onLoad?.(e)
      }}
      onError={(e) => {
        show(e.currentTarget, e.currentTarget.parentElement, false)
        onError?.(e)
      }}
      {...props}
    />
  )
})
AvatarImage.displayName = "AvatarImage"

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-sidebar-accent text-muted-foreground",
      "[[data-avatar-loaded]>&]:hidden",
      className,
    )}
    {...props}
  />
))
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
