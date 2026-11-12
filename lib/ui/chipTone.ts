/** A chip's tint (components/ui/chip), in a module of its own so a page that draws no Chip, a guest's, takes it alone. */
export const CHIP_TONE = {
  sun: "bg-camp-sun-tint text-camp-sun-ink shadow-none",
  danger: "bg-destructive/10 text-danger-ink shadow-none",
  /** The one picked (a single choice's, ChipChoice): the brand tint a picked row and a sheet's pick take. */
  brand: "bg-brand-muted text-brand-text shadow-none",
}

export type ChipTone = keyof typeof CHIP_TONE
