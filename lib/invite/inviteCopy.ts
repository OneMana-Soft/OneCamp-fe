// The honest words about invitations and mailed links, one table for every
// surface that invites or offers a reset link (SHELL-02, SHELL-26, ADMIN-21).

/** What the invite button does. */
export const inviteVerb = (emailOn: boolean) => (emailOn ? "Send" : "Create")

/** What inviting someone promises, before anything is sent. */
export const invitePromise = (emailOn: boolean) =>
  emailOn ? "Each gets an email with a link to join, good for seven days." : "This server can't send email yet, so you'll get a link to share with each person yourself."

/** Over links whose emails didn't go; only an admin is sent to Admin › Email. */
export const unsentLine = (emailOn: boolean, { admin = true } = {}) =>
  emailOn ? "Some emails didn't go. Share their links yourself." : `Email isn't set up yet. Share these links${admin ? ", or set up email in Admin › Email" : " yourself"}.`

export const COPY_LINKS = "Copy all links"

export const linksCopied = (n: number) => `${n} invitation link${n === 1 ? "" : "s"} copied`

/** What Copy all links copies: an address and its link a line. */
export const linksText = (rows: ReadonlyArray<{ email: string; link: string }>) => rows.map((r) => `${r.email} — ${r.link}`).join("\n")

/** Forgot password without email: about the workspace, never the address. */
export const RESET_EMAIL_OFF = "This workspace can't send email yet, so no link will arrive. Ask your workspace admin to set up email or to help you sign in."
