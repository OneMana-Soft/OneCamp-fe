import dynamic from "next/dynamic"

/** A picker's own sheet (components/ui/date-field-sheet), loaded when a field or a combobox first opens one. */
export const PickerSheet = dynamic(() => import("@/components/ui/date-field-sheet"), { ssr: false })
