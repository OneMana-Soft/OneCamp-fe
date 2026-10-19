"use client"

import * as React from "react"

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"

/**
 * A picker's own sheet, on a phone, where the field is in no sheet (a page, a
 * dialog): titled with the field's name. Loaded when a field first opens one,
 * so a page with a date field doesn't carry the sheet (components/ui/date-field).
 */
export default function PickerSheet({
  label,
  open,
  onOpenChange,
  detent,
  children,
}: {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  detent: "medium" | "half"
  children: React.ReactNode
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} detent={detent}>
      <DrawerContent aria-describedby={undefined} header={<DrawerTitle className="text-title-3 text-ink">{label}</DrawerTitle>}>
        {children}
      </DrawerContent>
    </Drawer>
  )
}
