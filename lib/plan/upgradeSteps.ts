/**
 * How a free workspace becomes licensed, in the one sentence an admin needs.
 *
 * The free release is a build stamped with the seat limit; a licence bought with
 * the same email makes the next build unstamped (onemana-backend
 * LicenseSeatLimit). So the step after paying is to fetch that build, which the
 * install command does. Without this sentence an admin pays and sees nothing
 * change. Shared by the seat line and every locked-control notice.
 */
export const UPGRADE_STEPS =
  "Buy a licence with the email this workspace was installed with, then re-run your install command. Everything in the workspace stays."
