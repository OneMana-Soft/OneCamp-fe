/**
 * Whether a date the server sent is no date: left out, empty, or the zero time.
 * Left out is the graph's way of saying none (its reads leave unset dates out,
 * omitempty), so a field that never came is none, as an empty one is: read as
 * a date, it was Invalid Date, and a task without dates broke its page.
 */
export function isZeroEpoch(dateString: string | null | undefined): boolean {
    if (!dateString) {
        return true;
    }
    return (
        dateString == "0001-01-01T00:00:00Z" || dateString == "1970-01-01T00:00:00Z"
    );
}
