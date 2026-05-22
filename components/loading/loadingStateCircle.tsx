import { LoaderCircle } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn"

interface LoadingStateCircleProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-10 w-10",
};

export const LoadingStateCircle = ({
  size = "lg",
  className,
  label,
}: LoadingStateCircleProps) => {
    return (
        <div className={cn("flex items-center justify-center gap-2", className)}>
            <LoaderCircle className={cn("animate-spin text-muted-foreground", sizeClasses[size])} />
            {label && (
                <span className="text-xs text-muted-foreground">{label}</span>
            )}
        </div>
    )
}
