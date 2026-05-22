import { cn } from "@/lib/utils/helpers/cn"
import { LucideIcon } from "lucide-react";

interface ProjectIconProps {
    name: string
    size?: "sm" | "xs" | "md" | "lg" | "xl"
    className?: string
    InnerIcon?: LucideIcon
}

// Curated color palette inspired by Asana
const colors = [
    "bg-[#4573D2] text-white", // Blue
    "bg-[#E362E3] text-white", // Purple
    "bg-[#EA4E9D] text-white", // Pink
    "bg-[#E8384F] text-white", // Red
    "bg-[#FD612C] text-white", // Orange
    "bg-[#FDC23C] text-white", // Yellow
    "bg-[#7BC86C] text-white", // Green
    "bg-[#26C6DA] text-white", // Cyan
    "bg-[#9C6ADE] text-white", // Violet
    "bg-[#FF7043] text-white", // Deep Orange
    "bg-[#66BB6A] text-white", // Light Green
    "bg-[#42A5F5] text-white", // Light Blue
]

const sizeClasses = {
    xs: "h-4 w-4 text-xs",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-xl",
}

// Generate consistent hash from string
function hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
}

// Get color based on name hash
function getColorForName(name: string): string {
    const hash = hashString(name)
    return colors[hash % colors.length]
}

export function ColorIcon({ name, size = "md", className, InnerIcon}: ProjectIconProps) {
    const colorClass = getColorForName(name)

    return (
        <div
            className={cn(
                "flex shrink-0 items-center justify-center rounded font-semibold",
                sizeClasses[size],
                colorClass,
                className,
            )}
            title={name}
        >
            {InnerIcon && <InnerIcon/>}
        </div>
    )
}
