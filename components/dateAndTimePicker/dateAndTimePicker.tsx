import {Input} from "@/components/ui/input";
import {Calendar} from "@/components/ui/calendar";

export function DateAndTimePicker({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  const timeString = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`

  function setDateFromCalendar(newDate: Date | undefined) {
    if (!newDate) return

    newDate.setHours(value.getHours())
    newDate.setMinutes(value.getMinutes())
    onChange(newDate)
  }

  function setDateFromTimeField(newTimeString: string) {
    const newDate = new Date(value)
    const [hours, minutes] = newTimeString.split(':').map(Number)

    newDate.setHours(hours)
    newDate.setMinutes(minutes)

    try {
      newDate.toISOString()
      onChange(newDate)
    } catch {
      // Invalid date, do nothing
    }
  }

  return (
    <>
      <Calendar initialFocus mode='single' selected={value} onSelect={setDateFromCalendar} />
      <Input type='time' value={timeString} onChange={(e)=>{
        e.preventDefault()
        setDateFromTimeField(e.target.value)
      }
      }
        className='text-center'
      />

    </>
  )
}
