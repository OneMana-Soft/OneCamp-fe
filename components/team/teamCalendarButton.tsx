import { Button } from "@/components/ui/button"
import { Calendar } from "@/lib/icons"
import { useContainerCalendar } from "@/lib/calendar/useContainerCalendar"

/** The team's own calendar (gcal-14): its members' time off and the events made on it, opened by the one opener. */
export function TeamCalendarButton({ teamId, className }: { teamId: string; className?: string }) {
  const calendar = useContainerCalendar("team", teamId)
  return (
    <Button variant="outline" size="sm" className={className} busy={calendar.busy} onClick={() => void calendar.open()}>
      <Calendar />
      Team calendar
    </Button>
  )
}
