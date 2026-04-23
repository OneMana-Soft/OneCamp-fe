"use client"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Lock, Shield, LoaderCircle, CheckCircle2 } from "lucide-react";
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

        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        if (newPassword.length > 72) {
            setError("Password must not exceed 72 characters");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        if (hasPassword && !currentPassword) {
            setError("Current password is required");
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await AuthService.changePassword(currentPassword, newPassword);
            if (result.ok) {
                setSuccess(result.msg || "Password updated successfully");
                setHasPassword(true);
                resetForm();
                setTimeout(() => {
                    setIsExpanded(false);
                    setSuccess("");
                }, 2000);
            } else {
                setError(result.msg || "Failed to update password");
            }
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (hasPassword === null) return null;

    const title = hasPassword ? "Change Password" : "Set Password";
    const description = hasPassword
        ? "Update your password for email login"
        : "Add a password to enable email login";

    return (
        <div className="bg-muted/10 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full">
                        <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-medium">{title}</h3>
                        <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setIsExpanded(!isExpanded);
                        if (isExpanded) resetForm();
                    }}
                >
                    {isExpanded ? "Cancel" : title}
                </Button>
            </div>

            {isExpanded && (
                <form onSubmit={handleSubmit} className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {hasPassword && (
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type={showCurrentPassword ? "text" : "password"}
                                placeholder="Current password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="pl-10 pr-10 bg-background/50 border-0 shadow-none h-12 focus-visible:ring-1"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    )}

                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            type={showNewPassword ? "text" : "password"}
                            placeholder="New password (min 8 characters)"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="pl-10 pr-10 bg-background/50 border-0 shadow-none h-12 focus-visible:ring-1"
                            required
                            minLength={8}
                        />
                        <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>

                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="password"
                            placeholder="Confirm new password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="pl-10 bg-background/50 border-0 shadow-none h-12 focus-visible:ring-1"
                            required
                            minLength={8}
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-destructive animate-in fade-in">{error}</p>
                    )}

                    {success && (
                        <div className="flex items-center space-x-2 text-sm text-green-600 dark:text-green-400 animate-in fade-in">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{success}</span>
                        </div>
                    )}

                    <Button type="submit" className="w-full h-12" disabled={isSubmitting}>
                        {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        {title}
                    </Button>
                </form>
            )}
        </div>
    );
}
