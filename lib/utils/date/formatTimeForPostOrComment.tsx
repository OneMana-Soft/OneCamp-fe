export function formatTimeForPostOrComment(dateString: string | number, onlyTime: boolean = false): string {
    if(typeof(dateString) == "number") {
        dateString = dateString * 1000
    }
    const dateObject = new Date(dateString);
    if (isNaN(dateObject.getTime())) {
        return "";
    }
    const currentDate = new Date();
    const yesterday = new Date();
    yesterday.setDate(currentDate.getDate() - 1);

    if (
        dateObject.toDateString() === currentDate.toDateString() || onlyTime
    ) {
        return dateObject.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (
        dateObject.toDateString() === yesterday.toDateString()
    ) {
        return "Yesterday " + dateObject.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
        const day = dateObject.getDate();
        const month = dateObject.getMonth() + 1;
        const year = dateObject.getFullYear() % 100; // Get the last two digits of the year
        return `${day < 10 ? '0' + day : day}/${month < 10 ? '0' + month : month}/${year} ` + dateObject.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
}