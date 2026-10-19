/**
 * Whether an event's notes are rich text (HTML): they carry a tag of the rich
 * editors' (the old forms', a seed's, Google Calendar's), where an address in
 * angle brackets is not one. Apart from lib/calendar/notes, so the event's
 * page can tell how to draw them without the editor's conversions.
 */
const TAG = /<\/?(p|br|div|span|a|b|strong|i|em|u|s|del|ul|ol|li|h[1-6]|blockquote|pre|code|hr|img|table|thead|tbody|tr|td|th|mark|font|section)\b[^<>]*>/i

export const isRichNotes = (notes: string | undefined | null): boolean => !!notes && TAG.test(notes)
