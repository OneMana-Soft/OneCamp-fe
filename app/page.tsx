"use client"

import { LoaderCircle, Fingerprint, Lock } from "@/lib/icons";
import { signInRefusal } from "@/lib/auth/signInRefusal";
import { SIGN_IN_LABELS, otherWayInHint } from "@/lib/auth/signInHints";
import { signInWithPasskey } from "@/services/passkeyService";
import { passkeyErrorMessage, passkeysSupported } from "@/lib/auth/webauthn";
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {useEffect, useRef, useState, useCallback, Suspense} from "react";
import authService, { type LoginOutcome } from "@/services/auth/AuthService";
import { assertUnreachable } from "@/lib/utils/assertUnreachable";
import { TwoFactorPrompt } from "@/components/auth/TwoFactorPrompt";
import { EnterpriseSSOButtons, OAuthButtons } from "@/components/auth/ProviderButtons";
import {app_home_path} from "@/types/paths";
import {useRouter, useSearchParams} from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils/helpers/cn"
import { AuthDivider, AuthField, AuthHeading, AuthNotice, AuthPlaceholder, AuthShell, IdentityChip, PasswordField, authControl } from "@/components/auth/AuthShell"
import { SpotPlug } from "@/components/ui/graphics/spots"
import { forgetMember, holdAppBoot, leaveAppBoot } from "@/lib/appBoot"
import { SignInSide } from "@/components/auth/SignInSide"
import { landingPath } from "@/lib/landing"
import { useNamedWorkspace } from "@/hooks/useWorkspaceName"


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

function AuthErrorMessage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  if (!error) return null;

  // An allowlist by code; never display the raw `message` query param.
  const refusal = signInRefusal(error);

  // The notice card (design v3, F2): a tile in the tone (danger for a
  // sign-in that broke, sun for one with something to do first, neutral for
  // one that is nobody's fault), the title and one sentence. Not red text,
  // which made a cancelled sign-in look like an outage.
  return <AuthNotice tone={refusal.tone} title={refusal.title}>{refusal.message}</AuthNotice>;
}

/**
 * The page while it asks whether somebody is signed in: its own frame, and a
 * placeholder in the shape of the heading and buttons that may follow. It was
 * a blank page for as long as the API took. Nothing in it says "Sign in",
 * because the visitor may be signed in and on their way through to the app.
 */
function SignInChecking() {
  return (
    <AuthShell side={<SignInSide />}>
      <AuthPlaceholder label="Checking whether you're signed in" providers fields={1} buttons={1} />
    </AuthShell>
  );
}

type SignInTab = "standard" | "directory"

/**
 * Which kind of account, when the server has a company directory: the
 * workspace's own, or the directory's. Radix tabs, so the arrow keys move
 * between them (and Home and End) as WAI-ARIA's tabs pattern has it, and Tab
 * goes on into the form. Without a directory there is one form and no tabs.
 */
function SignInTabs({ tabbed, value, onValueChange, children }: { tabbed: boolean; value: SignInTab; onValueChange: (tab: SignInTab) => void; children: React.ReactNode }) {
  if (!tabbed) return <>{children}</>
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v === "directory" ? "directory" : "standard")} className="space-y-6">
      <TabsList aria-label="Sign in with" className="grid h-auto w-full grid-cols-2 gap-1 rounded-md">
        <TabsTrigger value="standard" className="h-9 rounded-sm">{SIGN_IN_LABELS.accountTab}</TabsTrigger>
        <TabsTrigger value="directory" className="h-9 rounded-sm">{SIGN_IN_LABELS.directoryTab}</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  )
}

/** A sign-in form: its tab's panel when there are tabs, the form alone when not. */
function SignInPanel({ tabbed, value, children }: { tabbed: boolean; value: SignInTab; children: React.ReactElement }) {
  return tabbed ? <TabsContent value={value} asChild className="mt-0">{children}</TabsContent> : children
}

export default function SignInPage() {

  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [providers, setProviders] = useState(buildTimeDefaults);
  // The workspace's name, the server's first (hooks/useWorkspaceName); "Sign
  // in" alone when nobody has named it.
  const workspace = useNamedWorkspace();
  // The two-step email (owner decision D3, Linear's and Clerk's): the address
  // first, then the password slides in with the address as an identity chip.
  // `back` plays the slide the other way when the person changes the address.
  const [emailStep, setEmailStep] = useState<{ step: "email" | "password"; back: boolean }>({ step: "email", back: false });
  // Bumped on each refused password, to shake the field again.
  const [refusals, setRefusals] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);
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
  const [activeTab, setActiveTab] = useState<SignInTab>("standard");
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

  // Into the app, on the app's splash (lib/appBoot): it is up at once, over
  // this page, while the app's code comes, and the app takes it over. A
  // member's start page has it up already, from its first paint. `settled`
  // when the demo's starting screen, the same scene, is what it covers.
  const enterApp = useCallback((path: string, settled = false) => {
    holdAppBoot({ settled });
    router.push(path);
  }, [router]);

  // Nobody is signed in here: the start page is the sign-in page, so the
  // splash its first paint showed for a member's browser fades from over it,
  // and the next start shows this page from the first paint.
  useEffect(() => {
    if (!isChecking) leaveAppBoot();
  }, [isChecking]);

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
        enterApp(app_home_path);
        return null;
      }
      return { msg: result.msg, expired: result.reason === "challenge_expired" };
    },
    [enterApp, totpChallenge],
  );

  // What both password forms do with the answer: go in, ask for the code, or say why not, each form
  // in its own place. Shared, so the directory form asks for the second step exactly as the email form
  // does: the server asks after either password, and the same code step completes both.
  const followLoginOutcome = (result: LoginOutcome, showFailure: (failure: { msg: string; auth_method?: string }) => void) => {
    switch (result.status) {
      case "success":
        // Someone who has just joined opens on the channel they were put in.
        enterApp(landingPath(result.landing) ?? app_home_path);
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

  // The demo button: a server in demo mode signs the visitor in to the shared
  // demo account (anywhere else /demo-login refuses, and this says so).
  const handleDemoLogin = useCallback(async () => {
    setIsDemoLoading(true);
    setDemoError("");
    try {
      const result = await authService.loginAsDemo();
      if (result.ok) {
        enterApp(app_home_path);
        // Still loading until the app's page replaces this one: clearing it here
        // drew the sign-in page under a visitor already on their way in.
        return;
      }
      setDemoError(result.msg || "The demo isn't available right now. Try again in a few minutes.");
    } catch (error) {
      console.error('Demo login error:', error);
      setDemoError("The demo didn't start. Try again.");
    }
    setIsDemoLoading(false);
  }, [enterApp]);

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
          // The sign-up page sends someone who joins through the directory
          // here, to the directory's own form.
          if (runtimeProviders.ldap && new URLSearchParams(window.location.search).get("tab") === "directory") {
            setActiveTab("directory");
          }
        }

        if (adminRequired) {
          leaveAppBoot();
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
          if (!cancelled) enterApp(app_home_path);
          return;
        }
        // Not a member's browser after all (the session has ended): the next
        // start is the sign-in page from its first paint, with no splash.
        forgetMember();
      }
      await resolveLoginUI();
    };

    detectSessionThenResolve();

    return () => {
      cancelled = true;
    };
  }, [router, enterApp]);

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
      if (result.ok) enterApp(app_home_path);
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
        // When the server says the account signs in another way (Google,
        // GitHub, single sign-on, the directory), say which, by the words on
        // the control to press, so the person knows where to go instead of
        // reading "invalid".
        const methodHint = failure.auth_method ? otherWayInHint(failure.auth_method, providers) : "";
        setEmailError(methodHint || failure.msg);
        setRefusals((n) => n + 1);
        // Kept, not cleared: a typo is fixed in place.
        passwordRef.current?.focus();
      });
    } catch (error) {
      console.error('Email login error:', error);
      setEmailError("Signing in didn't finish. Try again.");
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
      setLdapError("Signing in didn't finish. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return <SignInChecking />;
  }

  if (!hasAnyAuthMethod && !isDemoEnabled) {
    return (
      <AuthShell side={<SignInSide />}>
        <AuthHeading title="There's no way to sign in yet" art={<SpotPlug size={96} />}>
          Every sign-in method is turned off on this server. Ask whoever runs it to turn one on.
        </AuthHeading>
      </AuthShell>
    );
  }

  // The address this page is on, so somebody with two workspaces can tell
  // which one is asking. Only ever drawn in the browser (see isChecking).
  const workspaceHost = typeof window !== "undefined" ? window.location.host : "";
  const hasProviderButtons = hasOAuthProviders || hasEnterpriseSSO || canUsePasskey;
  const busy = isLoading || isDemoLoading;

  const continueWithEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    if (!email.trim()) {
      setEmailError("Enter the email you sign in with.");
      return;
    }
    setEmailStep({ step: "password", back: false });
  };

  const changeEmail = () => {
    setEmailError("");
    setPassword("");
    setEmailStep({ step: "email", back: true });
  };

  return (
      <AuthShell side={<SignInSide />}>
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
          <AuthHeading display title={workspace ? <>Sign in to <span translate="no">{workspace}</span></> : "Sign in"}>
            {workspaceHost && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Lock className="h-3.5 w-3.5 text-faint-foreground" aria-hidden="true" />
                <span translate="no">{workspaceHost}</span>
              </span>
            )}
          </AuthHeading>

          <div className="space-y-6">
          <Suspense fallback={null}>
            <AuthErrorMessage />
          </Suspense>

          {/* Which kind of account: the workspace's own, or the company
              directory's. Tabs, because that is what they are. Never during
              a second-factor challenge, which replaces this whole branch: the
              password step is done, and another way to sign in beside the
              code would say the sign-in can start over in place. Keep the
              tabs inside it (directorySignInTwoStep.test.tsx checks). */}
          <SignInTabs tabbed={isLdapEnabled} value={activeTab} onValueChange={setActiveTab}>
          {activeTab === "standard" ? (
            <SignInPanel tabbed={isLdapEnabled} value="standard">
            <div className="space-y-5">
              {/* The ways in that are one click, in one grid: Google and
                  GitHub side by side, the single sign-on and this device's
                  passkey full width under them. */}
              {hasProviderButtons && (
                <div className="space-y-2">
                  <div className="auth-providers" data-providers="">
                    {hasOAuthProviders && (
                      <OAuthButtons
                        google={isGoogleEnabled}
                        github={isGithubEnabled}
                        busy={isLoading}
                        disabled={busy}
                        onGoogle={() => handleLogin(authService.loginWithGoogle)}
                        onGithub={() => handleLogin(authService.loginWithGithub)}
                      />
                    )}
                    {hasEnterpriseSSO && (
                      <EnterpriseSSOButtons oidc={isOidcEnabled} saml={isSamlEnabled} disabled={busy} />
                    )}
                    {canUsePasskey && (
                      <Button
                        variant="secondary"
                        size="lg"
                        className={cn(authControl, "auth-wide")}
                        disabled={busy}
                        onClick={handlePasskeyLogin}
                      >
                        <Fingerprint aria-hidden="true" />
                        Sign in with a passkey
                      </Button>
                    )}
                  </div>
                  {/* A cancelled passkey is nobody's fault: a quiet line, no red. */}
                  {passkeyError && <p role="status" className="text-xs text-muted-foreground">{passkeyError}</p>}
                </div>
              )}

              {hasProviderButtons && isEmailEnabled && <AuthDivider />}

              {isEmailEnabled && (emailStep.step === "email" ? (
                <form
                  key="email-step"
                  onSubmit={continueWithEmail}
                  className={cn("space-y-3", emailStep.back && "auth-step-back")}
                  noValidate
                >
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
                    error={emailError || undefined}
                    autoFocus={emailStep.back}
                  />
                  {/* On the demo build the demo button below is the page's one
                      filled button, so this one is secondary beside it. */}
                  <Button type="submit" size="lg" variant={isDemoEnabled ? "secondary" : "default"} className={authControl} disabled={busy}>
                    Continue with email
                  </Button>
                </form>
              ) : (
                <form key="password-step" onSubmit={handleEmailLogin} className="auth-step-in space-y-4">
                  {/* The address, kept for the password manager and shown as who is signing in. */}
                  <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
                  <IdentityChip email={email} onChange={isLoading ? undefined : changeEmail} />
                  <PasswordField
                    ref={passwordRef}
                    id="signin-password"
                    name="password"
                    label="Password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (emailError) setEmailError("");
                    }}
                    required
                    minLength={8}
                    autoComplete="current-password"
                    autoFocus
                    readOnly={isLoading}
                    visible={showPassword}
                    onVisibleChange={setShowPassword}
                    error={emailError}
                    shakeKey={refusals}
                    aside={
                      <Link href="/forgot-password" className="rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                        Forgot password?
                      </Link>
                    }
                  />

                  {adminPasswordOnly && (
                    <p className="auth-hint">
                      Passwords are off on this workspace. Only admins can sign in with one.
                    </p>
                  )}

                  <Button type="submit" size="lg" variant={isDemoEnabled ? "secondary" : "default"} className={authControl} aria-busy={isLoading || undefined}>
                    {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                    {isLoading ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              ))}
            </div>
            </SignInPanel>
          ) : (
            /* Directory Login (LDAP) */
            <SignInPanel tabbed={isLdapEnabled} value="directory">
            <form onSubmit={handleLdapLogin} className="space-y-4">
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
                readOnly={isLoading}
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
                readOnly={isLoading}
              />

              <Button type="submit" size="lg" variant={isDemoEnabled ? "secondary" : "default"} className={authControl} aria-busy={isLoading || undefined}>
                {isLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {isLoading ? "Signing in…" : "Sign in with directory"}
              </Button>
            </form>
            </SignInPanel>
          )}
          </SignInTabs>

          {/* Demo Login Section */}
          {isDemoEnabled && (
            <div className="space-y-3">
              {hasAnyAuthMethod && <AuthDivider />}

              <Button
                size="lg"
                className={authControl}
                disabled={busy}
                onClick={() => void handleDemoLogin()}
              >
                {isDemoLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Try the demo, no sign-up needed
              </Button>

              {demoError && (
                <p role="alert" className="auth-field-error">{demoError}</p>
              )}

              <p className="auth-hint">
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
