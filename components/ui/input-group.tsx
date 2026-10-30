"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { inputSizing } from "@/components/ui/inputSizing"

/**
 * AN INPUT GROUP (shadcn/ui's): the group is the field, with field-surface's
 * states (app/globals.css) round its text and addons; a press on an addon
 * focuses the text. InputGroup > Addon · Input · Addon (end) > Button
 *
 * The group carries its text's invalid and disabled states as data-invalid
 * and data-disabled, read off the InputGroupInput among its children, so the
 * field's CSS is keyed on the group itself rather than a :has() that Chrome
 * checks again on every change inside it (app/selectorKeyGuard.test.ts).
 */
const InputGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<"div"> & { dense?: boolean }>(
  ({ className, dense, children, ...props }, ref) => {
    const text = textOf(children)
    return (
      <div
        ref={ref}
        role="group"
        data-slot="input-group"
        data-invalid={text?.["aria-invalid"] === true || text?.["aria-invalid"] === "true" ? "" : undefined}
        data-disabled={text?.disabled ? "" : undefined}
        className={cn(
          "field-surface group/input-group relative flex w-full min-w-0 items-center rounded-md",
          inputSizing(className, dense),
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
InputGroup.displayName = "InputGroup"

/** The props of the group's text: the InputGroupInput among its own children (app/inputGroupGuard.test.ts keeps it there). */
function textOf(children: React.ReactNode): React.ComponentProps<"input"> | undefined {
  let text: React.ComponentProps<"input"> | undefined
  React.Children.forEach(children, (child) => {
    if (React.isValidElement<React.ComponentProps<"input">>(child) && child.type === InputGroupInput) text = child.props
  })
  return text
}

const addonVariants = cva(
  "flex shrink-0 cursor-text select-none items-center gap-1.5 text-ink-3 [&>svg]:pointer-events-none [&>svg]:size-4 [&>svg]:shrink-0 group-data-[disabled]/input-group:opacity-50",
  {
    variants: {
      align: {
        "inline-start": "order-first h-full ps-2.5 has-[>button]:ps-1",
        "inline-end": "order-last h-full pe-2.5 has-[>button]:pe-1",
      },
    },
    defaultVariants: { align: "inline-start" },
  },
)

function InputGroupAddon({ className, align = "inline-start", onMouseDown, ...props }: React.ComponentProps<"div"> & VariantProps<typeof addonVariants>) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(addonVariants({ align }), className)}
      onMouseDown={(e) => {
        onMouseDown?.(e)
        if (e.defaultPrevented || (e.target as HTMLElement).closest("button, a, input, textarea, [role=button]")) return
        e.preventDefault()
        e.currentTarget.parentElement?.querySelector<HTMLElement>("[data-slot=input-group-control]")?.focus()
      }}
      {...props}
    />
  )
}

/** The text: no surface of its own; 16px on a phone so iOS does not zoom. */
const InputGroupInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    data-slot="input-group-control"
    className={cn(
      // w-full: an input's min-content is its size attribute's width.
      "h-full w-full min-w-0 flex-1 self-stretch rounded-[inherit] bg-transparent px-2.5 text-base text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed md:text-sm",
      "group-has-[>[data-align=inline-start]]/input-group:ps-1.5 group-has-[>[data-align=inline-end]]/input-group:pe-1.5",
      "[&::-webkit-search-cancel-button]:appearance-none",
      className,
    )}
    {...props}
  />
))
InputGroupInput.displayName = "InputGroupInput"

/** Clear, Copy, Show: a ghost 24px button with Button's 44px touch target. */
function InputGroupButton({ className, variant = "ghost", size = "icon-xs", type = "button", ...props }: React.ComponentProps<typeof Button>) {
  return <Button data-slot="input-group-button" type={type} variant={variant} size={size} className={cn("shrink-0", className)} {...props} />
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput }
