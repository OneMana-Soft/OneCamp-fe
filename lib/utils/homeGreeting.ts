/**
 * The line at the top of Home: "Good afternoon, Sam".
 *
 * Desktop and mobile each worked this out for themselves and disagreed:
 * desktop greeted by the full name and mobile by the username, so one
 * person was "Test" on a laptop and "Demo User" on their phone. One
 * function now, and it uses the first name, which is how people are
 * greeted: "Good morning, Priya", not "Good morning, Priya Nair".
 */
export function homeGreeting(hour: number, fullName?: string, userName?: string): string {
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
    const name = (fullName || "").trim() || (userName || "").trim()
    const first = name.split(/\s+/)[0]
    return first ? `${part}, ${first}` : `${part}`
}
