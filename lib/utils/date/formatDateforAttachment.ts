import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import { shortDate } from "@/lib/utils/date/shortDate";

export function formatDateForAttachment(dateString: string): string {

    if (isZeroEpoch(dateString)) return dateString;

    let date;

    // Check if it's likely an epoch timestamp (all digits)
    if (/^\d+$/.test(dateString)) {
        date = new Date(Number(dateString));
    } else {
        // Try parsing as a date string
        date = new Date(dateString);
    }

    // Validate the date
    if (isNaN(date.getTime())) return "Invalid Date";

    // The app's one date format: "9 Oct", "9 Oct 2025".
    return shortDate(date);
}
