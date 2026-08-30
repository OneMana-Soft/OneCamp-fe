/**
 * What the workspace assistant says about itself on its profile.
 *
 * One string, because the desktop dialog and the mobile sheet both render it
 * and a claim about what the assistant does is exactly the kind of copy that
 * gets corrected in one place and left stale in the other.
 *
 * "recorded calls" is load-bearing rather than padding. The recap is built from
 * the transcript, the transcript is only written while a recording is running,
 * so a call nobody recorded produces no recap at all. The previous wording,
 * "posts meeting recaps", promised something the product does not do for the
 * majority of calls, and the absence is silent when it disappoints someone.
 */
export const ASSISTANT_BIO =
    "is your workspace assistant. It recaps recorded calls, answers questions in a DM or when you @mention it in a channel, and runs your agents and automations."

/** The desktop profile has room for the invitation; the mobile sheet does not. */
export const ASSISTANT_BIO_WITH_INVITE = `${ASSISTANT_BIO} Message it anytime to ask about your workspace.`

/** Shown when the assistant has no configured display name. */
export const ASSISTANT_DEFAULT_NAME = "OneCamp AI"
