"use client"

import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"

/**
 * Whether the signed-in person is the public demo's shared visitor, as their
 * own profile says (user_demo_visitor, from the server's helpers.IsDemoVisitor).
 * Everyone who opens the demo is that one account, so the demo refuses it a
 * password, two-step sign-in, passkeys and personal accounts; the app leaves
 * those out for the visitor instead of offering what always fails (QA SH-07,
 * 14 Oct 2026). The demo's own team, and every other server, see them as ever.
 */
export function useDemoVisitor(): boolean {
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    return self.data?.data?.user_demo_visitor === true
}

/** Why the demo's sign-in stays as it is: the server's own words (helpers.DemoSignInMsg). */
export const DEMO_SIGN_IN_LINE =
    "The demo is shared by everyone who opens it, so how it signs in stays as it is. Install OneCamp free to set your own password, two-step sign-in and passkeys."

/** Why the demo connects nobody's own accounts: the server's own words (helpers.DemoPersonalAccountMsg). */
export const DEMO_ACCOUNTS_LINE =
    "The demo is shared by everyone who opens it, so it never connects anyone's own Google, GitHub or Slack account: the next visitor would see it. Install OneCamp free to try this with yours."
