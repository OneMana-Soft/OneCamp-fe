import { greetingNameOf, type PersonNameFields } from "@/lib/personName"

/**
 * The line at the top of Home: "Good afternoon, Sam".
 *
 * Desktop and mobile each worked this out for themselves and disagreed:
 * desktop greeted by the full name and mobile by the username, so one
 * person was "Test" on a laptop and "Demo User" on their phone. One
 * function now, greeting by the member's given name (lib/personName's
 * greetingNameOf): "Good morning, Priya", not "Good morning, Priya Nair".
 */
export function homeGreeting(hour: number, who?: PersonNameFields | null): string {
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
    const first = greetingNameOf(who)
    return first ? `${part}, ${first}` : `${part}`
}
