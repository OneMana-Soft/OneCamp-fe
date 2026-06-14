"use client"

import { LoaderCircle, Rocket, AlertCircle, Mail, Lock, Eye, EyeOff } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import {ThemeToggle} from "@/components/themeProvider/theme-toggle";
import {useEffect, useState, Suspense} from "react";
import authService from "@/services/auth/AuthService";
import {app_home_path} from "@/types/paths";
import {useRouter, useSearchParams} from "next/navigation";
import Link from "next/link";

// Build-time defaults. These are fallbacks ONLY — the runtime
// /auth/providers endpoint is the source of truth, so admins can flip a
// provider on/off without redeploying the FE.
const buildTimeDefaults = {
  demo:   process.env.NEXT_PUBLIC_DEMO_MODE === "true",
  google: process.env.NEXT_PUBLIC_AUTH_GOOGLE !== "false",
  github: process.env.NEXT_PUBLIC_AUTH_GITHUB !== "false",
  email:  process.env.NEXT_PUBLIC_AUTH_EMAIL  !== "false",
  oidc:   process.env.NEXT_PUBLIC_AUTH_OIDC   === "true",
  saml:   process.env.NEXT_PUBLIC_AUTH_SAML   === "true",
  ldap:   process.env.NEXT_PUBLIC_AUTH_LDAP   === "true",
};

// Allowlist of SSO error codes the BE can return. Any unknown code is mapped
// to a generic message so attackers can't render arbitrary text via
// /?error=x&message=<phishing-text>.
const knownErrorMessages: Record<string, string> = {
  // OAuth (Google/GitHub)
  unauthorized:           "Your account is not authorized to access this workspace. Please contact your administrator for an invitation.",
  // OIDC
  oidc_disabled:          "OIDC sign-in is currently disabled.",
  oidc_misconfigured:     "OIDC is not fully configured. Contact your administrator.",
  oidc_invalid_request:   "The OIDC sign-in request was incomplete. Please try again.",
  oidc_invalid_state:     "Your sign-in session expired or was tampered with. Please try again.",
  oidc_state_mint_failed: "Could not start OIDC sign-in. Please try again later.",
  oidc_invalid_code:      "OIDC authorization failed. Please try again.",
  oidc_no_token:          "Your identity provider did not return an ID token.",
  oidc_verification_failed: "Could not verify the response from your identity provider.",
  oidc_invalid_claims:    "Could not read your identity provider's response.",
  oidc_no_email:          "Your identity provider did not provide a valid email.",
  oidc_email_unverified:  "Your identity provider reports this email as unverified. Verify it and try again.",
  // SAML
  saml_disabled:          "SAML sign-in is currently disabled.",
  saml_invalid:           "Invalid SAML response from your identity provider.",
  saml_no_email:          "Your SAML response did not include a usable email.",
  // Shared
  provision_failed:       "Could not provision your account. Please contact your administrator.",
  session_failed:         "Could not start your session. Please try again.",
  db_error:               "A temporary database issue occurred. Please try again.",
  resolution_failed:      "Could not resolve your account. Please try again.",
};

// ssoMethodHint maps an auth_method value the backend returns ("google",
// "github", "oidc", "saml", "ldap") to a friendly nudge. Empty for unknown.
function ssoMethodHint(method: string): string {
  switch (method) {
    case "google":
      return "This email signs in with Google. Use the Google button above.";
    case "github":
      return "This email signs in with GitHub. Use the GitHub button above.";
    case "oidc":
      return "This email signs in via your single sign-on provider (OIDC). Use the OIDC SSO button.";
    case "saml":
      return "This email signs in via your single sign-on provider (SAML). Use the SAML 2.0 button.";
    case "ldap":
      return "This email signs in via your directory. Use the Directory Login tab.";
    default:
      return "";
  }
}

function AuthErrorMessage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  if (!error) return null;

  // Use the allowlist; never display the raw `message` query param.
  const msg = knownErrorMessages[error] || "Sign-in failed. Please try again or contact your administrator.";

  return (
    <div className="bg-red-500/10 border-l-4 border-red-500 text-red-500 p-4 rounded-md shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-start">
        <AlertCircle className="h-5 w-5 mr-3 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-sm">Authentication Failed</h3>
          <p className="text-sm mt-1">{msg}</p>
        </div>
      </div>
    </div>
  );
}

export default function SignUp() {

  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [providers, setProviders] = useState(buildTimeDefaults);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Enterprise LDAP States
  const [activeTab, setActiveTab] = useState<"standard" | "directory">("standard");
  const [ldapUser, setLdapUser] = useState("");
  const [ldapPass, setLdapPass] = useState("");
  const [showLdapPassword, setShowLdapPassword] = useState(false);
  const [ldapError, setLdapError] = useState("");

  const isDemoEnabled = providers.demo;
  const isGoogleEnabled = providers.google;
  const isGithubEnabled = providers.github;
  const isEmailEnabled = providers.email;
  const isOidcEnabled = providers.oidc;
  const isSamlEnabled = providers.saml;
  const isLdapEnabled = providers.ldap;

  const hasOAuthProviders = isGoogleEnabled || isGithubEnabled;
  const hasEnterpriseSSO = isOidcEnabled || isSamlEnabled;
  const hasAnyAuthMethod = hasOAuthProviders || isEmailEnabled || isLdapEnabled || hasEnterpriseSSO;

  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    let bouncedFromProtected = false;
    if (typeof window !== "undefined") {
      bouncedFromProtected = sessionStorage.getItem("auth_bounce_guard") === "1";
      if (bouncedFromProtected) {
        sessionStorage.removeItem("auth_bounce_guard");
      }
    }

    // Resolve providers + admin-setup gate. Kept in a helper so both the
    // "already logged in" and "needs to log in" paths can reuse it, and so
    // the loading screen always resolves even if the session probe throws.
    const resolveLoginUI = async () => {
      try {
        const [runtimeProviders, adminRequired] = await Promise.all([
          authService.getEnabledProviders(),
          authService.checkAdminSetupRequired(),
        ]);
        if (cancelled) return;

        if (runtimeProviders) {
          setProviders(runtimeProviders);
          // If neither OAuth nor LDAP/SSO is on, fall back to email by default.
          if (!runtimeProviders.google && !runtimeProviders.github) {
            setShowEmailLogin(true);
          }
        } else if (!buildTimeDefaults.google && !buildTimeDefaults.github) {
          setShowEmailLogin(true);
        }

        if (adminRequired) {
          router.push('/admin-setup');
        } else {
          setIsChecking(false);
        }
      } catch {
        // Providers/admin-setup probe failed (e.g. BE unreachable). Render
        // the login page with build-time defaults rather than hang on the
        // blank loading screen.
        if (!cancelled) setIsChecking(false);
      }
    };

    // Session detection can't read the auth cookies: Authorization /
    // RefreshToken are HttpOnly (invisible to document.cookie by design),
    // so the BE is the only authoritative source of "am I logged in".
    // authService.hasActiveSession() probes a cheap authenticated endpoint
    // with credentials and (on a stale access token) a single silent
    // refresh, returning a plain boolean. We intentionally do NOT route
    // this through axiosInstance: its 401 interceptor would fire a
    // refresh→logout cascade (logout POST + storage clear) for every
    // anonymous visitor to the landing page, which is wasteful and
    // destructive. A self-contained probe keeps the logged-out path inert.
    //
    // Skip the probe when we were just bounced out of a protected route:
    // the BE logout that triggered the bounce may not have fully cleared
    // the session yet, and re-probing could ping-pong the user back in.
    const detectSessionThenResolve = async () => {
      if (!bouncedFromProtected) {
        const loggedIn = await authService.hasActiveSession();
        if (loggedIn) {
          // Live session. Redirect and stop; don't flip isChecking so the
          // login UI never flashes before the route change completes.
          if (!cancelled) router.push(app_home_path);
          return;
        }
      }
      await resolveLoginUI();
    };

    detectSessionThenResolve();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogin = async (action: () => Promise<void>) => {
    setIsLoading(true);
    setDemoError("");
    try {
      await action();
    } catch (error) {
      console.error('Error logging in:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setIsLoading(true);
    try {
      const result = await authService.loginWithEmail(email, password);
      if (result.ok) {
        router.push(app_home_path);
      } else {
        // When the backend reports the account uses a different auth method
        // (Google, GitHub, OIDC, SAML, LDAP), surface a method-specific hint
        // so the user knows where to click instead of just "invalid".
        const methodHint = result.auth_method ? ssoMethodHint(result.auth_method) : "";
        setEmailError(methodHint || result.msg);
      }
    } catch (error) {
      console.error('Email login error:', error);
      setEmailError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLdapLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLdapError("");
    setIsLoading(true);
    try {
      const result = await authService.loginWithLDAP(ldapUser, ldapPass);
      if (result.ok) {
        router.push(app_home_path);
      } else {
        setLdapError(result.msg);
      }
    } catch (error) {
      console.error('LDAP login error:', error);
      setLdapError("Failed to reach directory server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    setDemoError("");
    try {
      const result = await authService.loginAsDemo();
      if (result.ok) {
        router.push(app_home_path);
      } else {
        setDemoError(result.msg || "Demo login is currently unavailable. Please try again later.");
      }
    } catch (error) {
      console.error('Demo login error:', error);
      setDemoError("Something went wrong. Please try again.");
    } finally {
      setIsDemoLoading(false);
    }
  };

  if (isChecking) {
    return null;
  }

  if (!hasAnyAuthMethod && !isDemoEnabled) {
    return (
      <div className="min-h-screen text-foreground flex flex-col justify-center items-center px-4 py-12">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Login Methods Configured</h2>
        <p className="text-muted-foreground text-center max-w-sm">
          Please contact your administrator to enable at least one authentication method.
        </p>
      </div>
    );
  }

  return (
      <div className="min-h-screen text-foreground flex flex-col justify-center items-center px-4 py-12 relative bg-background/50">
        {/* Theme Toggle */}
        <div className="absolute right-4 top-4 md:right-8 md:top-8">
          <ThemeToggle/>
        </div>

        {/* Logo */}
        <div className="w-full max-w-sm mb-6 flex justify-center">
          <img
              src="/logo.svg"
              alt="OneCamp Logo"
              width={48}
              height={48}
              className="h-12 w-12 mx-auto"
          />
        </div>

        <div className="w-full max-w-sm space-y-6">

          <Suspense fallback={null}>
            <AuthErrorMessage />
          </Suspense>

          {/* Directory Switcher Tab */}
          {isLdapEnabled && (
            <div className="flex p-1 bg-muted/80 backdrop-blur rounded-lg border border-border/40 select-none">
              <button
                type="button"
                onClick={() => setActiveTab("standard")}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded-md transition-all duration-200 ${
                  activeTab === "standard"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Standard Sign In
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("directory")}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded-md transition-all duration-200 ${
                  activeTab === "directory"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Directory Login
              </button>
            </div>
          )}

          {activeTab === "standard" ? (
            <>
              {/* OAuth Buttons */}
              {hasOAuthProviders && (
                <div className="space-y-4">
                  {isGoogleEnabled && (
                    <Button variant="outline" className="w-full border-border/50 hover:bg-muted/50 transition-colors" disabled={isLoading || isDemoLoading} onClick={()=>handleLogin(authService.loginWithGoogle)}>
                      {isLoading ? (
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>
                      ) : (
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                        <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="currentColor"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>)}
                      Continue with Google
                    </Button>
                  )}

                  {isGithubEnabled && (
                    <Button variant="outline" className="w-full border-border/50 hover:bg-muted/50 transition-colors" disabled={isLoading || isDemoLoading} onClick={()=>handleLogin(authService.loginWithGithub)}>
                      {isLoading ? (
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>
                      ) : (
                          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                        <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"
                        />
                        </svg>
                      )}
                      Continue with GitHub
                    </Button>
                  )}
                </div>
              )}

              {/* DIVIDER between OAuth and Email */}
              {hasOAuthProviders && isEmailEnabled && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/50" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
                  </div>
                </div>
              )}

              {/* Email Login */}
              {isEmailEnabled && (
                <>
                  {!showEmailLogin ? (
                    <Button 
                      variant="outline" 
                      className="w-full border-border/50 hover:bg-muted/50 transition-colors" 
                      disabled={isLoading || isDemoLoading}
                      onClick={() => setShowEmailLogin(true)}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Sign in with Email
                    </Button>
                  ) : (
                    <form onSubmit={handleEmailLogin} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="space-y-2">
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-label="Email address"
                            className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring transition-all"
                          />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            autoComplete="current-password"
                            aria-label="Password"
                            className="w-full pl-10 pr-10 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {emailError && (
                        <p className="text-sm text-destructive font-medium">{emailError}</p>
                      )}

                      <Button type="submit" className="w-full shadow-sm" disabled={isLoading}>
                        {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : null}
                        Sign In
                      </Button>

                      <div className="flex justify-between text-sm">
                        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground transition-colors">
                          Forgot password?
                        </Link>
                      </div>
                    </form>
                  )}
                </>
              )}
            </>
          ) : (
            /* Directory Login (LDAP) */
            <form onSubmit={handleLdapLogin} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Directory Username or Email"
                    value={ldapUser}
                    onChange={(e) => setLdapUser(e.target.value)}
                    required
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Directory Username or Email"
                    className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring transition-all"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type={showLdapPassword ? "text" : "password"}
                    placeholder="Directory Password"
                    value={ldapPass}
                    onChange={(e) => setLdapPass(e.target.value)}
                    required
                    aria-label="Directory Password"
                    className="w-full pl-10 pr-10 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLdapPassword(!showLdapPassword)}
                    aria-label={showLdapPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showLdapPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {ldapError && (
                <p className="text-sm text-destructive font-medium">{ldapError}</p>
              )}

              <Button type="submit" className="w-full shadow-sm" disabled={isLoading}>
                {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : null}
                Sign in via Directory
              </Button>
            </form>
          )}

          {/* Enterprise Single Sign-On (SAML / OIDC) Grid */}
          {hasEnterpriseSSO && (
            <div className="space-y-4">
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-border/40"></div>
                <span className="flex-shrink mx-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Enterprise SSO</span>
                <div className="flex-grow border-t border-border/40"></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {isOidcEnabled && (
                  <Button 
                    variant="outline" 
                    className="w-full text-xs py-2 h-9 border-border/50 hover:bg-muted/50 transition-all duration-200" 
                    disabled={isLoading || isDemoLoading} 
                    onClick={() => authService.loginWithOIDC()}
                  >
                    <svg className="w-4 h-4 mr-1.5 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2zm1 10h-2v4h2v-4zm0-4h-2v2h2V8z" fill="currentColor"/>
                    </svg>
                    OIDC SSO
                  </Button>
                )}
                {isSamlEnabled && (
                  <Button 
                    variant="outline" 
                    className="w-full text-xs py-2 h-9 border-border/50 hover:bg-muted/50 transition-all duration-200" 
                    disabled={isLoading || isDemoLoading} 
                    onClick={() => authService.loginWithSAML()}
                  >
                    <svg className="w-4 h-4 mr-1.5 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor"/>
                    </svg>
                    SAML 2.0
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Demo Login Section */}
          {isDemoEnabled && (
            <>
              {hasAnyAuthMethod && (
                <div className="relative mb-4 mt-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/40" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>
              )}

              <Button
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200"
                disabled={isLoading || isDemoLoading}
                onClick={handleDemoLogin}
              >
                {isDemoLoading ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>
                ) : (
                  <Rocket className="mr-2 h-4 w-4" />
                )}
                Try Demo — No Sign Up Required
              </Button>

              {demoError && (
                <p className="text-sm text-destructive text-center font-medium">{demoError}</p>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Explore OneCamp with a pre-configured demo account. Data resets periodically.
              </p>
            </>
          )}

        </div>
      </div>
  )
}
