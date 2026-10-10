export function formatTimeForReplyCount(dateString: string | number): string {
    if (typeof dateString === "number") {
        dateString = dateString * 1000; // Convert seconds to milliseconds
    }
    const dateObject = new Date(dateString);
    const currentDate = new Date();
    const timeDiff = currentDate.getTime() - dateObject.getTime();
    const secondsDiff = timeDiff / 1000;
    const daysDiff = Math.floor(secondsDiff / (3600 * 24));
    const monthsDiff = Math.floor(daysDiff / 30);
    const yearsDiff = Math.floor(daysDiff / 365);

    // Today
    if (dateObject.toDateString() === currentDate.toDateString()) {
        return `Today at ${dateObject.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    // Yesterday
    else if (daysDiff <= 1) {
        return `Yesterday at ${dateObject.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    // Less than a month
    else if (daysDiff < 30) {
        return `${daysDiff} day${daysDiff === 1 ? '' : 's'} ago`;
    }
    // Months ago
    else if (monthsDiff < 12) {
        return `${monthsDiff} month${monthsDiff === 1 ? '' : 's'} ago`;
    }
    // Years ago
    else {
        return `${yearsDiff} year${yearsDiff === 1 ? '' : 's'} ago`;
    }
}