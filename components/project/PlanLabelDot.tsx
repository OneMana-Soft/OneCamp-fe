import { HueDot } from "@/components/ui/chip"
import { StatusDot } from "@/components/ui/statusWord"
import { statusHueOf } from "@/lib/taskStatus"

export function PlanLabelDot({ color }: { color: string }) {
  const hue = statusHueOf(color)
  return hue === "neutral" ? <StatusDot tone="neutral" /> : <HueDot hue={hue} />
}
