import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { apiErrorCode, apiErrorMessage } from "@/lib/utils/apiError"

/**
 * Managing your own second factor.
 *
 * ON THE CLIENT CHOICE: these go through axiosInstance, while the login-side call in AuthService uses
 * raw fetch. That is not an inconsistency, it is the difference between the two situations. These are
 * authenticated in-app requests, so they want what axiosInstance provides — the X-CSRF-Token echo the
 * BE requires on this route group, and the 401→refresh handshake, since a settings page is exactly
 * where a short-lived access token expires while someone reads the screen. The login-side call has no
 * session yet, and axiosInstance's 401 interceptor would answer that with a logout cascade.
 *
 * Every method resolves rather than throws. A settings card needs to render a message either way, and
 * the failures here are almost all expected states — a mistyped code, an operator who has not set
 * TOTP_KEK — not exceptions. `code` is carried through because the caller has to distinguish them:
 * "that code was wrong" is the user's problem to fix, "TOTP_KEK is not set" is not.
 *
 * adminReset at the bottom is the one method that acts on somebody ELSE's factor. It is here rather
 * than in a separate admin service because it is the same feature from the other side, and the two
 * ways a second factor can be removed should be readable together.
 */

/** What the settings screen needs to decide which state to render. */
export interface TwoFactorStatus {
    /** True only for a CONFIRMED enrolment — the state that challenges at login. */
    enrolled: boolean
    /**
     * An enrolment was started and never confirmed.
     *
     * DELIBERATELY NOT BRANCHED ON IN THE UI, which is worth stating so it does not look forgotten.
     * The state is inert: login challenges on `enrolled` alone, and BeginTOTPEnrollment mints a fresh
     * secret every time rather than resuming, so an abandoned setup neither enforces anything nor
     * needs clearing — pressing "Turn on" again simply starts clean. Modelled because it is part of
     * the endpoint's contract and a future screen may want it.
     */
    pendingEnrolment: boolean
    /** Counted so a user can notice they are low BEFORE the one occasion they need one. */
    unusedRecoveryCodes: number
}

/** A started-but-unconfirmed enrolment. */
export interface TwoFactorEnrollment {
    /** Base32, for the "enter it manually" path when a camera is unavailable. */
    secret: string
    /** otpauth:// URI — what the QR code encodes. */
    uri: string
}

export type TwoFactorResult<T> =
    | { ok: true; data: T }
    | { ok: false; msg: string; code: string }

function failure(error: unknown, fallback: string): { ok: false; msg: string; code: string } {
    return { ok: false, msg: apiErrorMessage(error, fallback), code: apiErrorCode(error) }
}

class TwoFactorService {
    /** Reads the caller's own 2FA state. */
    static async getStatus(): Promise<TwoFactorResult<TwoFactorStatus>> {
        try {
            const res = await axiosInstance.get(GetEndpointUrl.GetTwoFactorStatus)
            const d = res.data?.data ?? {}
            return {
                ok: true,
                data: {
                    enrolled: d.enrolled === true,
                    pendingEnrolment: d.pending_enrolment === true,
                    // Coerced rather than defaulted to 0 on a falsy check: 0 IS the meaningful value
                    // here — no recovery codes left — and `|| 0` would render it identically to a
                    // field the server never sent.
                    unusedRecoveryCodes: Number(d.unused_recovery_codes ?? 0),
                },
            }
        } catch (error) {
            return failure(error, "Could not read your two-factor status.")
        }
    }

    /**
     * Starts an enrolment and returns the secret to scan.
     *
     * Nothing about the account changes yet — the server stores the enrolment unconfirmed — so
     * abandoning the screen cannot lock anyone out, and calling this twice is safe.
     */
    static async beginSetup(): Promise<TwoFactorResult<TwoFactorEnrollment>> {
        try {
            const res = await axiosInstance.post(PostEndpointUrl.BeginTwoFactorSetup)
            const d = res.data?.data ?? {}
            return { ok: true, data: { secret: String(d.secret ?? ""), uri: String(d.uri ?? "") } }
        } catch (error) {
            // 409 totp_kek_missing arrives here. Left for the caller to recognise, because it is the one
            // failure the user cannot act on and so needs different words.
            return failure(error, "Could not start two-factor setup.")
        }
    }

    /**
     * Confirms the first code and turns the factor on.
     *
     * The recovery codes in the response are shown HERE AND NOWHERE ELSE — the server keeps only their
     * hashes — so this return value is the user's single opportunity to save them.
     */
    static async confirmSetup(code: string): Promise<TwoFactorResult<string[]>> {
        try {
            const res = await axiosInstance.post(PostEndpointUrl.ConfirmTwoFactorSetup, { code })
            const codes = res.data?.data?.recovery_codes
            return { ok: true, data: Array.isArray(codes) ? codes.map(String) : [] }
        } catch (error) {
            return failure(error, "Could not turn on two-factor authentication.")
        }
    }

    /** Turns the factor off. Requires a current code, since this is an attacker's first move. */
    static async disable(code: string): Promise<TwoFactorResult<null>> {
        try {
            await axiosInstance.post(PostEndpointUrl.DisableTwoFactor, { code })
            return { ok: true, data: null }
        } catch (error) {
            return failure(error, "Could not turn off two-factor authentication.")
        }
    }

    /**
     * Clears ANOTHER member's second factor. Admin-only, and audited server-side.
     *
     * Lives beside the self-service methods rather than in its own file because it is the same feature
     * seen from the other side, and a reader working out how 2FA can be turned off should find both
     * answers in one place. It is a genuinely different operation, though: `disable` above proves
     * possession of the factor before removing it, which is exactly why it cannot help the two cases
     * this exists for — a phone lost along with the recovery codes, and every enrolled user at once if
     * the server's TOTP_KEK is ever replaced, since their stored secrets then decrypt for nobody.
     *
     * `wasEnrolled` distinguishes a real removal from a no-op on an account that had nothing enabled.
     * Reported rather than smoothed over, because "done" for an account that was never protected reads
     * as though a factor was removed, and an admin acting on a support request needs to know which
     * happened before they tell the user to try again.
     */
    static async adminReset(userUuid: string): Promise<TwoFactorResult<{ wasEnrolled: boolean }>> {
        try {
            const res = await axiosInstance.post(PostEndpointUrl.AdminResetTwoFactor, {
                user_uuid: userUuid,
            })
            return { ok: true, data: { wasEnrolled: res.data?.data?.was_enrolled === true } }
        } catch (error) {
            // The server refuses a self-targeted reset with code "totp_self_reset_refused"; that would
            // otherwise be a way for a stolen admin session to strip its own factor without a code.
            // Passed through so the caller can show the refusal's own wording, which names the remedy.
            return failure(error, "Could not reset two-factor authentication.")
        }
    }
}

export default TwoFactorService
