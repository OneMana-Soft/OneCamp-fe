"use client"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "@/lib/icons";
import { AuthField, PasswordField } from "@/components/auth/AuthShell";
import AuthService from "@/services/auth/AuthService";

export function ChangePasswordSection() {
    const [hasPassword, setHasPassword] = useState<boolean | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        AuthService.hasPassword().then((res) => {
            setHasPassword(res.hasPassword);
        });
    }, []);

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
            setError("Something went wrong. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (hasPassword === null) return null;

    const title = hasPassword ? "Change password" : "Set a password";
    const description = hasPassword
        ? "The password you sign in with by email."
        : "You sign in another way. Add a password to sign in by email too.";

    return (
        <div className="space-y-4 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-medium">{hasPassword ? "Password" : "No password yet"}</h3>
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
                <p role="status" className="text-sm text-success">{success}</p>
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

                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    {success && <p role="status" className="text-sm text-success">{success}</p>}

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
