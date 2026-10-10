"use client"

import { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LoaderCircle } from "@/lib/icons";
import { AuthField, PasswordField } from "@/components/auth/AuthShell";
import AuthService from "@/services/auth/AuthService";
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance";

/**
 * Whether this account has a password. Throws when the server couldn't be
 * asked, which is not the same answer as "no": the sign-in service's own
 * check returns false for both, and this row then told someone with a
 * password "No password yet" and offered to set one.
 */
async function checkHasPassword(): Promise<boolean> {
    const res = await axiosInstance.get("/auth/has-password", OWN_ERRORS);
    return res.data?.has_password === true;
}

export function ChangePasswordSection() {
    // null while it is checked, "failed" when it couldn't be.
    const [hasPassword, setHasPassword] = useState<boolean | null | "failed">(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const load = useCallback(() => {
        setHasPassword(null);
        checkHasPassword()
            .then(setHasPassword)
            .catch(() => setHasPassword("failed"));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const resetForm = () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setError("");
        setShowCurrentPassword(false);
        setShowNewPassword(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (hasPassword && !currentPassword) {
            setError("Enter your current password first.");
            return;
        }

        if (newPassword.length < 8) {
            setError("Use at least 8 characters for the new password.");
            return;
        }

        if (newPassword.length > 72) {
            setError("Use 72 characters or fewer for the new password.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("The two new passwords are different. Type the same one in both.");
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await AuthService.changePassword(currentPassword, newPassword);
            if (result.ok) {
                setSuccess(result.msg || "Password changed.");
                setHasPassword(true);
                resetForm();
                setTimeout(() => {
                    setIsExpanded(false);
                    setSuccess("");
                }, 2000);
            } else {
                setError(result.msg || "Couldn't change your password. Try again.");
            }
        } catch {
            setError("Couldn't change your password. Check your connection and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // The row keeps its place while it is checked, so the rows under it do
    // not jump when the answer comes.
    if (hasPassword === null) {
        return (
            <div role="status" aria-label="Checking your password" className="flex items-center justify-between gap-6 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-2 pt-0.5" aria-hidden="true">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3 w-3/5" />
                </div>
                <Skeleton className="h-8 w-32 shrink-0" aria-hidden="true" />
            </div>
        );
    }

    if (hasPassword === "failed") {
        return (
            <div className="flex items-center justify-between gap-6 px-4 py-3">
                <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-medium leading-5">Couldn&apos;t check your password</h3>
                    <p className="text-xs text-muted-foreground text-pretty">
                        Nothing has changed. This is usually a connection problem: try again in a moment.
                    </p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={load}>
                    Try again
                </Button>
            </div>
        );
    }

    const title = hasPassword ? "Change password" : "Set a password";
    const description = hasPassword
        ? "The password you sign in with by email."
        : "You sign in another way. Add a password to sign in by email too.";

    return (
        <div className="space-y-4 px-4 py-3">
            <div className="flex items-center justify-between gap-6">
                <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-medium leading-5">{hasPassword ? "Password" : "No password yet"}</h3>
                    <p className="text-xs text-muted-foreground text-pretty">{description}</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    aria-expanded={isExpanded}
                    onClick={() => {
                        setIsExpanded(!isExpanded);
                        if (isExpanded) resetForm();
                    }}
                >
                    {isExpanded ? "Cancel" : title}
                </Button>
            </div>

            {success && !isExpanded && (
                <p role="status" className="text-sm text-success-ink">{success}</p>
            )}

            {isExpanded && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {hasPassword && (
                        <PasswordField
                            id="current-password"
                            name="current-password"
                            label="Current password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                            visible={showCurrentPassword}
                            onVisibleChange={setShowCurrentPassword}
                        />
                    )}

                    <PasswordField
                        id="new-password"
                        name="new-password"
                        label="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        hint="At least 8 characters."
                        required
                        minLength={8}
                        visible={showNewPassword}
                        onVisibleChange={setShowNewPassword}
                    />

                    <AuthField
                        id="confirm-new-password"
                        name="confirm-new-password"
                        label="Type the new one again"
                        type={showNewPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={8}
                    />

                    {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
                    {success && <p role="status" className="text-sm text-success-ink">{success}</p>}

                    <div className="flex justify-end">
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                            {isSubmitting ? "Saving…" : hasPassword ? "Change password" : "Set password"}
                        </Button>
                    </div>
                </form>
            )}
        </div>
    );
}
