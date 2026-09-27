import { cn } from './cn'

export const CONTAINER_STYLES = {
    base: cn(
        // Replace Radix-specific origin classes with shadcn/ui equivalents
        'origin-top-right',
        'origin-top-left',
        'origin-top',
        'origin-bottom-right',
        'origin-bottom-left',
        'origin-bottom',
        'origin-right',
        'origin-left'
    ),
    animation: cn(
        // Use shadcn/ui animation utilities
        'animate-in fade-in-0 zoom-in-95',
        'animate-out fade-out-0 zoom-out-95',
        'duration-100 ease-in-out'
    ),
    borders: 'border border-border', // Use shadcn/ui border classes
    background: 'bg-background', // Use shadcn/ui background classes
    shadows: 'shadow-sm', // Use shadcn/ui shadow classes
    rounded: 'rounded-md' // Use shadcn/ui rounded classes
}
