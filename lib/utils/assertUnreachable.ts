/**
 * Turns an unhandled case in a discriminated union into a COMPILE error.
 *
 * TypeScript does not require a switch over a union to be exhaustive. A union alone therefore does not
 * make a caller handle every member — it only breaks the members it already reads. That gap is not
 * theoretical: the sign-in flow used to return `{ ok: boolean }`, and when a second outcome appeared
 * ("password correct, but not signed in yet") the boolean reported it as success and routed the user
 * into an app with no session. Widening the return to a union fixes the shape but, on its own, a switch
 * that silently omits the new member still compiles and still does nothing.
 *
 * Calling this from the `default` branch closes it. Every member the switch handles is narrowed away, so
 * `value` is `never` by the time it reaches here and the call type-checks. Miss one and the residue is
 * that member, which is not assignable to `never`, and the build fails naming the case you forgot.
 *
 * At RUNTIME it throws, which only happens when a value arrives that the types said was impossible —
 * an API returning a status this build has never heard of. Throwing surfaces that instead of continuing
 * with a value nothing knows how to interpret.
 *
 * @example
 *   switch (result.status) {
 *     case "success": return go();
 *     case "totp_required": return prompt();
 *     case "failed": return showError();
 *     default: assertUnreachable(result, "login outcome");
 *   }
 *
 * @param value The narrowed-to-`never` value from the default branch.
 * @param label What was being switched over, so the runtime message says where it happened.
 */
export function assertUnreachable(value: never, label = "value"): never {
    throw new Error(`Unhandled ${label}: ${describe(value)}`);
}

/**
 * Renders an unknown value for the message without ever throwing.
 *
 * JSON.stringify throws on circular structures and on BigInt. Calling it bare inside the error path meant
 * a circular value replaced "Unhandled login outcome" with "Converting circular structure to JSON" —
 * losing the diagnostic at the one moment it is needed, and reporting a serialisation fault as if it were
 * the actual problem. Caught by assertUnreachable.test.ts, which is why that case is pinned.
 */
function describe(value: unknown): string {
    try {
        // A discriminant is the useful part and is almost always a short string, so lead with it when one
        // is present: "login outcome: webauthn_required" beats a wall of nested object.
        if (value !== null && typeof value === "object") {
            const discriminant = (value as Record<string, unknown>).status
                ?? (value as Record<string, unknown>).type
                ?? (value as Record<string, unknown>).kind;
            if (typeof discriminant === "string") return discriminant;
        }
        const json = JSON.stringify(value);
        // undefined and functions stringify to undefined, not a string.
        return json ?? String(value);
    } catch {
        // Circular, BigInt, or a hostile toJSON. Any label beats losing the error.
        return Object.prototype.toString.call(value);
    }
}
