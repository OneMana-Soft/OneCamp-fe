import { cn } from "@/lib/utils/helpers/cn";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Kept for compatibility. "shimmer" and "default" now look the same: a block
   * in surface-3 (--muted was 1.03:1 on the page and all but vanished) that breathes slowly (animate-shimmer in globals.css). The
   * sweeping highlight is gone because DESIGN.md rules out perpetual decorative
   * loops, and a page of twenty sweeping bars was the busiest thing on screen
   * at the one moment there was nothing to read. "circle" is the round one for
   * avatars and status dots. Reduced motion stops the breathing entirely.
   */
  variant?: "default" | "shimmer" | "circle";
}

function Skeleton({ className, variant = "shimmer", ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-shimmer bg-highlight",
        variant === "circle" ? "rounded-full" : "rounded-md",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
