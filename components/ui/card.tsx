import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    // Flat by design. A card sits IN the page, it does not float above it, so its
    // edge is a border — the shadow it used to carry was redundant with that
    // border and made every static panel read as a physical object. Elevation is
    // reserved for surfaces that genuinely float (see shadow-overlay).
    // rounded-lg (10px) rather than xl (14px): the softer radius made dense
    // panels look inflated next to their own 6-8px inner controls.
    className={cn(
      "rounded-lg border bg-card text-card-foreground",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-4", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

/**
 * A card's title. A div by default, as before. Pass `as="h2" | "h3" | "h4"`
 * when the card is a section of the page, so the title is a heading a
 * screen-reader user can jump to and the outline stays in order. The look
 * does not change with the level (h2 and h3 pick up the display face, as
 * every heading does).
 */
const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { as?: "div" | "h2" | "h3" | "h4" }
>(({ className, as: Tag = "div", ...props }, ref) => (
  <Tag
    // The ref type stays HTMLDivElement so existing callers' refs still
    // type-check; at runtime it is whichever element was rendered.
    ref={ref as React.Ref<HTMLDivElement & HTMLHeadingElement>}
    className={cn("font-medium leading-none", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-4 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
