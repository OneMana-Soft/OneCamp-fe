import { daysFromToday, dueWords } from "@/components/task/DueLabel"
import { clockTime } from "@/lib/utils/date/clock"

/** A deadline after what waits for it: "by today, 5:00 PM", "by 25 Oct, 3:07 AM". Apart from DueLabel, which every task list loads. */
export function dueByWords(d: Date, now: Date = new Date()): string {
  const words = dueWords(d, now)
  return `by ${Math.abs(daysFromToday(d, now)) <= 1 ? words.toLowerCase() : words}, ${clockTime(d)}`
}
