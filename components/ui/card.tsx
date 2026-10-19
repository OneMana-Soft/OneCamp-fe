import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * A card (design v3, DESIGN_V3 §2 and admin §1.3): a raised surface, r12 and
 * e1, on the card ground, with no border. It was the pre-v3 card, a 1 px grey
 * line on the sheet, which is the wireframe look v3 replaced (SHADCN-AUDIT,
 * 17 Oct 2026). A card used as a plain container says so: `border-none
 * shadow-none bg-transparent`. A border is never a call site's
 * (cardSurface.test). Each part names its slot, as shadcn's does.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card"
    className={cn(
      "rounded-lg bg-card text-card-foreground shadow-e1",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

/**
 * The header: the title and description in one column, and a CardAction, when
 * there is one, at the top right beside both (shadcn's grid).
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-header"
    className={cn(
      "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 p-4 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
      className
    )}
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
    data-slot="card-title"
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
    data-slot="card-description"
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

/**
 * A header's action (a button or a menu), placed by the header's grid: top
 * right, beside the title and description. In a header under 24rem (a
 * phone, a narrow column) it goes under the description, at the start, so
 * the title keeps its width.
 */
const CardAction = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-action"
    className={cn(
      "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
      "@max-[24rem]/card-header:col-start-1 @max-[24rem]/card-header:row-span-1 @max-[24rem]/card-header:row-start-3 @max-[24rem]/card-header:justify-self-start",
      className
    )}
    {...props}
  />
))
CardAction.displayName = "CardAction"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} data-slot="card-content" className={cn("p-4 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-footer"
    className={cn("flex items-center p-4 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardAction, CardContent }
