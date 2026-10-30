/**
 * Where a span's end goes when its start moves to next: it keeps its length
 * (an hour when it had none), as the event form's start and a proposal's
 * From both do. Pure.
 */
export function movedEnd(start: Date, end: Date, next: Date): Date {
  const length = end.getTime() - start.getTime()
  return new Date(next.getTime() + (length > 0 ? length : 60 * 60 * 1000))
}
