import { cn } from "@/lib/utils/helpers/cn";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "shimmer" | "circle";
}

function Skeleton({ className, variant = "shimmer", ...props }: SkeletonProps) {
  if (variant === "circle") {
    return (
      <div
        className={cn(
          "rounded-full bg-muted",
          "animate-pulse",
          className
        )}
        {...props}
      />
    );
  }

  if (variant === "default") {
    return (
      <div
        className={cn("animate-pulse rounded-md bg-muted", className)}
        {...props}
      />
    );
  }

  // Shimmer variant (modern, default)
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0",
        "before:-translate-x-full",
        "before:animate-shimmer",
        "before:bg-gradient-to-r",
        "before:from-transparent before:via-muted-foreground/10 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton }
