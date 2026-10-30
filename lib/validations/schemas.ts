import type { ResponseShape } from "@/hooks/useFetch";
import type { UserProfileInterface } from "@/types/user";

/**
 * The self profile's check: the protected route runs it on /user/profile
 * before the shell draws, and the admin card on the same read.
 *
 * Written by hand, with the verdicts of the Zod schema it replaces (pinned
 * in schemas.test.ts): it ran on every first screen, and Zod came with it
 * (18 KB on the wire, fluid-15). The body and its profile must be objects;
 * the profile needs a uuid-shaped id and a name; the fields below must be of
 * their kind when present; everything else passes through untouched.
 */

// Zod 3's own patterns, so an id or an email it accepted still passes.
const uuidRe = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
const emailRe = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;

type Rule = (v: unknown) => boolean;
const text: Rule = (v) => typeof v === "string";
const optional = (rule: Rule): Rule => (v) => v === undefined || rule(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const profileRules: Record<string, Rule> = {
  user_uuid: (v) => text(v) && uuidRe.test(v as string),
  user_name: text,
  user_full_name: optional(text),
  user_email_id: optional((v) => text(v) && emailRe.test(v as string)),
  user_profile_object_key: optional((v) => v === null || text(v)),
  user_is_admin: optional((v) => typeof v === "boolean"),
  user_status: optional(text),
  user_job_title: optional(text),
};

export const UserProfileResponseSchema: ResponseShape<UserProfileInterface> = {
  parse(body: unknown): UserProfileInterface {
    if (!isRecord(body)) throw new Error("Self profile: the response isn't an object");
    if (!optional(text)(body.msg)) throw new Error("Self profile: msg isn't text");
    const profile = body.data;
    if (!isRecord(profile)) throw new Error("Self profile: data isn't an object");
    const wrong = Object.keys(profileRules).filter((key) => !profileRules[key](profile[key]));
    if (wrong.length) throw new Error(`Self profile: unexpected ${wrong.join(", ")}`);
    // Fresh objects, as the schema returned, holding the same values.
    return { ...body, data: { ...profile } } as unknown as UserProfileInterface;
  },
};
