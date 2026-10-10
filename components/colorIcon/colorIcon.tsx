import { cn } from "@/lib/utils/helpers/cn"
import { LucideIcon } from "lucide-react";
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

interface ProjectIconProps {
    /** What it marks: a project's or team's uuid, hashed onto its camp hue. */
    name: string
    size?: "dot" | "sm" | "xs" | "md" | "lg" | "xl"
    className?: string
    InnerIcon?: LucideIcon
    /** A colour the owner picked, which wins over the uuid's hue. */
    chosen?: string | null
}

const sizeClasses = {
    // A 6px dot: the project's colour as a marker beside its name, where a
    // filled square read as a second icon.
    dot: "h-1.5 w-1.5 !rounded-full",
    xs: "h-4 w-4 text-xs",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-xl",
}

/**
 * A project's (or team's) colour: its camp hue (lib/campHue hueFor), the same
 * one IdentityMark, the board, the timeline and the reports draw it in, so a
 * project is one colour wherever it appears. It was a twelve-colour palette of
 * its own, hashed differently, so the sidebar's dot and a chart's bar for the
 * same project could disagree.
 *
 * A dot or a small square is the hue's strong cut; a tile with an icon is the
 * tint with the icon in the strong cut. Decorative: the name beside it says
 * what it is (it used to carry the uuid as a tooltip).
 */
export function ColorIcon({ name, size = "md", className, InnerIcon, chosen }: ProjectIconProps) {
    const hue = hueFor(name, chosen)
    return (
        <div
            aria-hidden="true"
            data-hue={hue}
            className={cn(
                HUE_CLASS[hue],
                "flex shrink-0 items-center justify-center rounded font-semibold",
                InnerIcon ? "bg-hue-tint text-hue" : "bg-hue",
                sizeClasses[size],
                className,
            )}
        >
            {InnerIcon && <InnerIcon/>}
        </div>
    )
}
