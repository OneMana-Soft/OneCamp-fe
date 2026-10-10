"use client"

import { LoaderCircle, AlertCircle, AlertTriangle, Info, Mail, Fingerprint } from "@/lib/icons";
import { signInRefusal, type RefusalTone } from "@/lib/auth/signInRefusal";
import { signInWithPasskey } from "@/services/passkeyService";
import { passkeyErrorMessage, passkeysSupported } from "@/lib/auth/webauthn";
import { Button } from "@/components/ui/button"
import {useEffect, useState, useCallback, Suspense} from "react";
import authService, { type LoginOutcome } from "@/services/auth/AuthService";
import { assertUnreachable } from "@/lib/utils/assertUnreachable";
import { TwoFactorPrompt } from "@/components/auth/TwoFactorPrompt";
import { EnterpriseSSOButtons, OAuthButtons } from "@/components/auth/ProviderButtons";
import {app_home_path} from "@/types/paths";
import {useRouter, useSearchParams} from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils/helpers/cn"
import { AuthDivider, AuthField, AuthHeading, AuthShell, PasswordField, authControl } from "@/components/auth/AuthShell"
import { landingPath } from "@/lib/landing"

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

// How loud each kind of refusal reads: red only for a sign-in that broke;
// the theme's warning tint for one with something to do first; neutral for
// one that is nobody's fault (cancelled, timed out).
const REFUSAL_STYLE: Record<RefusalTone, { box: string; icon: string; Icon: typeof AlertCircle }> = {
  error: { box: "border-destructive/30 bg-destructive/5", icon: "text-destructive", Icon: AlertCircle },
  warning: { box: "border-warning/40 bg-warning/5", icon: "text-warning", Icon: AlertTriangle },
  neutral: { box: "border-border bg-muted", icon: "text-muted-foreground", Icon: Info },
};

function AuthErrorMessage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  if (!error) return null;

  // An allowlist by code; never display the raw `message` query param.
  const refusal = signInRefusal(error);
  const { box, icon, Icon } = REFUSAL_STYLE[refusal.tone];

  // One quiet box in the tone's tint: no side bar, shadow or slide-in, which
  // made a cancelled sign-in look like an outage.
  return (
    <div
      role={refusal.tone === "error" ? "alert" : "status"}
      data-tone={refusal.tone}
      className={`${box} flex items-start gap-3 rounded-lg border p-4 text-foreground`}
    >
      <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} />
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{refusal.title}</h2>
        <p className="text-sm text-muted-foreground">{refusal.message}</p>
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
  // Passwords are off here, and an admin has come for theirs (/?admin).
  const [adminPasswordOnly, setAdminPasswordOnly] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  // Read after mount: the server render can't know what the browser supports.
  const [canUsePasskey, setCanUsePasskey] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  useEffect(() => setCanUsePasskey(passkeysSupported()), []);

  // A pending second-factor challenge. Non-empty means the password step succeeded and the sign-in is
  // NOT finished, so the code prompt replaces the credential form until it clears.
  const [totpChallenge, setTotpChallenge] = useState("");
  const [totpPrompt, setTotpPrompt] = useState("");

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

  // Returns to the password step, of whichever form asked: email or directory (the tab is left as it
  // was). The password is cleared as well as the challenge: an expired challenge means
  // re-authenticating, and leaving the field populated invites a click on "Sign in" that looks like a
  // resume but is a fresh credential submission.
  const cancelTwoFactor = useCallback(() => {
    setTotpChallenge("");
    setTotpPrompt("");
    setPassword("");
    setEmailError("");
    setLdapPass("");
    setLdapError("");
  }, []);

  // Answers the challenge. Returns the failure for the prompt to render, or null on success.
  // Declared below `router` rather than beside the state it reads, because it closes over it —
  // `const` bindings are not hoisted, so placing it with the other 2FA state made this a
  // use-before-declaration that tsc caught.
  const submitTwoFactor = useCallback(
    async (code: string) => {
      const result = await authService.completeTOTPLogin(totpChallenge, code);
      if (result.status === "success") {
        router.push(app_home_path);
        return null;
      }
      return { msg: result.msg, expired: result.reason === "challenge_expired" };
    },
    [router, totpChallenge],
  );

  // What both password forms do with the answer: go in, ask for the code, or say why not, each form
  // in its own place. Shared, so the directory form asks for the second step exactly as the email form
  // does: the server asks after either password, and the same code step completes both.
  const followLoginOutcome = (result: LoginOutcome, showFailure: (failure: { msg: string; auth_method?: string }) => void) => {
    switch (result.status) {
      case "success":
        // Someone who has just joined opens on the channel they were put in.
        router.push(landingPath(result.landing) ?? app_home_path);
        break;
      case "totp_required":
        // The password was correct and there is NO session yet. Routing here would land the user in
        // an app that 401s every request and bounces them back to this screen — which is what the
        // old `if (result.ok)` did, because the server answers this case with HTTP 200.
        setTotpChallenge(result.challenge);
        setTotpPrompt(result.msg);
        break;
      case "failed":
        showFailure(result);
        break;
      // Makes the switch exhaustive as a BUILD constraint. Verified by deleting the totp_required
      // case: without this line tsc passes and the prompt simply never appears, which is the original
      // bug wearing a better type. With it, the build fails and names the missing case.
      //
      // Its runtime throw — reachable only if the server sends a status this build does not know —
      // lands in the caller's catch, so the user gets an error and a working form rather than a dead
      // button, and the console gets the unknown status.
      default:
        assertUnreachable(result, "login outcome");
    }
  };

  useEffect(() => {
    let cancelled = false;

    let bouncedFromProtected = false;
    if (typeof window !== "undefined") {
      bouncedFromProtected = sessionStorage.getItem("auth_bounce_guard") === "1";
      if (bouncedFromProtected) {
        sessionStorage.removeItem("auth_bounce_guard");
      }
    }

    // Asked for at once, beside the session probe rather than after it: a
    // visitor without a session (everyone arriving from "Try the demo") was
    // waiting for the probe, a refresh attempt and then these, one after
    // another, before the page could show or the demo start. A visitor who
    // turns out to be signed in costs two small public requests.
    const loginUI = Promise.all([
      authService.getEnabledProviders(),
      authService.checkAdminSetupRequired(),
    ]);
    // Read in resolveLoginUI; until then a failure mustn't go unhandled.
    loginUI.catch(() => {});

    // Resolve providers + admin-setup gate. Kept in a helper so both the
    // "already logged in" and "needs to log in" paths can reuse it, and so
    // the loading screen always resolves even if the session probe throws.
    const resolveLoginUI = async () => {
      try {
        const [runtimeProviders, adminRequired] = await loginUI;
        if (cancelled) return;

        if (runtimeProviders) {
          // Passwords off still takes an admin's: the way back in when single
          // sign-on breaks (the server checks it is an admin). It is offered
          // only at /?admin, so nobody else is shown a form that refuses them.
          const adminBreakGlass = !runtimeProviders.email && new URLSearchParams(window.location.search).has("admin");
          setProviders(adminBreakGlass ? { ...runtimeProviders, email: true } : runtimeProviders);
          setAdminPasswordOnly(adminBreakGlass);
          // If neither OAuth nor LDAP/SSO is on, fall back to email by default.
          if (adminBreakGlass || (!runtimeProviders.google && !runtimeProviders.github)) {
            setShowEmailLogin(true);
          }
          // The sign-up page sends someone who joins through the directory
          // here, to the directory's own form.
          if (runtimeProviders.ldap && new URLSearchParams(window.location.search).get("tab") === "directory") {
            setActiveTab("directory");
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

  const NO_PASSKEY_USED =
    "No passkey was used. If you haven't added one on this device yet, sign in another way, then add it from your profile under Security.";

  const handlePasskeyLogin = async () => {
    setPasskeyError("");
    setIsLoading(true);
    try {
      const result = await signInWithPasskey();
      if (result.ok) router.push(app_home_path);
      else setPasskeyError(result.msg ?? NO_PASSKEY_USED);
    } catch (error) {
      // A cancel and "this device has no passkey for this site" look the
      // same to the page, so both get the hint rather than silence.
      setPasskeyError(passkeyErrorMessage(error) ?? NO_PASSKEY_USED);
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
      followLoginOutcome(result, (failure) => {
        // When the backend reports the account uses a different auth method
        // (Google, GitHub, OIDC, SAML, LDAP), surface a method-specific hint
        // so the user knows where to click instead of just "invalid".
        const methodHint = failure.auth_method ? ssoMethodHint(failure.auth_method) : "";
        setEmailError(methodHint || failure.msg);
      });
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
      followLoginOutcome(result, (failure) => setLdapError(failure.msg));
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
      <AuthShell>
        <AuthHeading title="There's no way to sign in yet">
          Every sign-in method is turned off on this server. Ask whoever runs it to turn one on.
        </AuthHeading>
      </AuthShell>
    );
  }

  // The address this page is on, so somebody with two workspaces can tell
  // which one is asking. Only ever drawn in the browser (see isChecking).
  const workspaceHost = typeof window !== "undefined" ? window.location.host : "";
  const hasProviderButtons = hasOAuthProviders || hasEnterpriseSSO || canUsePasskey;

  return (
      <AuthShell>
          {totpChallenge ? (
            /*
              Replaces the credential form entirely rather than appearing beneath it. A screen showing
              both an email field and a code field invites re-submitting the password, which mints a new
              challenge and invalidates the one the user is holding -- so the obvious action would break
              the flow it appears to belong to.
            */
            <TwoFactorPrompt
              onSubmit={submitTwoFactor}
              onCancel={cancelTwoFactor}
              prompt={totpPrompt}
            />
          ) : (
          <>
          <AuthHeading title="Sign in">
            {workspaceHost && (
              <>to <span className="font-medium text-foreground" translate="no">{workspaceHost}</span></>
            )}
          </AuthHeading>

          <div className="space-y-6">
          <Suspense fallback={null}>
            <AuthErrorMessage />
          </Suspense>

          {/* Which kind of account: the workspace's own, or the company
              directory's. Tabs, because that is what they are. */}
          {isLdapEnabled && (
            <div role="tablist" aria-label="Sign in with" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              {([["standard", "OneCamp account"], ["directory", "Company directory"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`signin-tab-${value}`}
                  aria-selected={activeTab === value}
                  aria-controls={`signin-panel-${value}`}
                  onClick={() => setActiveTab(value)}
                  className={cn(
                    "h-9 rounded-sm text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                    activeTab === value ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {activeTab === "standard" ? (
            <div
              className="space-y-6"
              {...(isLdapEnabled ? { role: "tabpanel", id: "signin-panel-standard", "aria-labelledby": "signin-tab-standard" } : {})}
            >
              {/* The ways in that are one click: the accounts the workspace
                  trusts, its single sign-on, and this device's passkey. */}
              {hasProviderButtons && (
                <div className="space-y-2">
                  {hasOAuthProviders && (
                    <OAuthButtons
                      google={isGoogleEnabled}
                      github={isGithubEnabled}
                      busy={isLoading}
                      disabled={isLoading || isDemoLoading}
                      onGoogle={() => handleLogin(authService.loginWithGoogle)}
                      onGithub={() => handleLogin(authService.loginWithGithub)}
                    />
                  )}
                  {hasEnterpriseSSO && (
                    <EnterpriseSSOButtons oidc={isOidcEnabled} saml={isSamlEnabled} disabled={isLoading || isDemoLoading} />
                  )}
                  {canUsePasskey && (
                    <Button
                      variant="outline"
                      className={authControl}
                      disabled={isLoading || isDemoLoading}
                      onClick={handlePasskeyLogin}
                    >
                      <Fingerprint aria-hidden="true" />
                      Sign in with a passkey
                    </Button>
                  )}
                  {passkeyError && <p role="alert" className="pt-1 text-sm text-destructive">{passkeyError}</p>}
                </div>
              )}

              {hasProviderButtons && isEmailEnabled && <AuthDivider />}

              {isEmailEnabled && (
                <>
                  {!showEmailLogin ? (
                    <Button
                      variant="outline"
                      className={authControl}
                      disabled={isLoading || isDemoLoading}
                      onClick={() => setShowEmailLogin(true)}
                    >
                      <Mail aria-hidden="true" />
                      Sign in with email
                    </Button>
                  ) : (
                    <form onSubmit={handleEmailLogin} className="space-y-4" noValidate={false}>
                      <AuthField
                        id="signin-email"
                        name="email"
                        label="Email address"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="username"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        // Focused when it appears: the button that revealed it was a request to type here.
                        autoFocus={hasProviderButtons}
                      />
                      <PasswordField
                        id="signin-password"
                        name="password"
                        label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="current-password"
                        visible={showPassword}
                        onVisibleChange={setShowPassword}
                        error={emailError}
                        aside={
                          <Link href="/forgot-password" className="rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                            Forgot password?
                          </Link>
                        }
                      />

                      {adminPasswordOnly && (
                        <p className="text-xs text-muted-foreground">
                          Passwords are off on this workspace. Only admins can sign in with one.
                        </p>
                      )}

                      {/* On the demo build the demo button below is the page's one
                          filled button, so this one is outlined beside it. */}
                      <Button type="submit" variant={isDemoEnabled ? "outline" : "default"} className={authControl} disabled={isLoading}>
                        {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                        {isLoading ? "Signing in…" : "Sign in"}
                      </Button>
                    </form>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Directory Login (LDAP) */
            <form
              onSubmit={handleLdapLogin}
              className="space-y-4"
              role="tabpanel"
              id="signin-panel-directory"
              aria-labelledby="signin-tab-directory"
            >
              <AuthField
                id="ldap-user"
                name="username"
                label="Directory username or email"
                type="text"
                value={ldapUser}
                onChange={(e) => setLdapUser(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <PasswordField
                id="ldap-password"
                name="password"
                label="Directory password"
                value={ldapPass}
                onChange={(e) => setLdapPass(e.target.value)}
                required
                autoComplete="current-password"
                visible={showLdapPassword}
                onVisibleChange={setShowLdapPassword}
                error={ldapError}
              />

              <Button type="submit" variant={isDemoEnabled ? "outline" : "default"} className={authControl} disabled={isLoading}>
                {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {isLoading ? "Signing in…" : "Sign in with directory"}
              </Button>
            </form>
          )}

          {/* Demo Login Section */}
          {isDemoEnabled && (
            <div className="space-y-3">
              {hasAnyAuthMethod && <AuthDivider />}

              {/* A plain primary button in the theme's own colour: the
                  orange-to-amber gradient and rocket belonged to no token. */}
              <Button
                className={cn(authControl, "font-medium")}
                disabled={isLoading || isDemoLoading}
                onClick={handleDemoLogin}
              >
                {isDemoLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Try the demo, no sign up needed
              </Button>

              {demoError && (
                <p role="alert" className="text-sm text-destructive">{demoError}</p>
              )}

              <p className="text-xs text-muted-foreground">
                A shared workspace with sample people and work in it. It starts over every night.
              </p>
            </div>
          )}
          </div>
          </>
          )}
      </AuthShell>
  )
}
