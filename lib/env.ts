/**
 * The environment's check: the backend's address is required and must be a
 * URL, and the app's own address, when set, must be one too. A missing or
 * malformed one fails fast in production (logged in development).
 *
 * Written by hand: it ran on every first screen, and Zod with it (18 KB on
 * the wire, fluid-15). The other public values are optional strings, which
 * the build gives as strings or leaves out.
 */
// Zod's url() is exactly this: whatever the URL constructor accepts.
const isUrl = (v: string | undefined): boolean => {
  if (typeof v !== "string") return false;
  try {
    return new URL(v).href.length > 0;
  } catch {
    return false;
  }
};

/** What's wrong with the environment, if anything. Pure. */
export function envProblems(env: { NEXT_PUBLIC_BACKEND_URL?: string; NEXT_PUBLIC_APP_URL?: string }): string[] {
  const out: string[] = [];
  if (!isUrl(env.NEXT_PUBLIC_BACKEND_URL)) out.push("NEXT_PUBLIC_BACKEND_URL must be a URL");
  // As Zod's optional URL did: absent is fine, an empty value is not.
  if (env.NEXT_PUBLIC_APP_URL !== undefined && !isUrl(env.NEXT_PUBLIC_APP_URL)) out.push("NEXT_PUBLIC_APP_URL must be a URL");
  return out;
}

const problems = envProblems({
  NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (problems.length) {
  console.error("❌ Invalid environment variables:", problems);
  // In dev, we log it. In prod, this should prevent the build or start.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Invalid environment variables. Check the logs for details.");
  }
}
