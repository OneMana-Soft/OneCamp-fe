"use client"

import {LoaderCircle, Rocket, AlertCircle, Mail, Lock, Eye, EyeOff} from "lucide-react"
import { Button } from "@/components/ui/button"
import {ThemeToggle} from "@/components/themeProvider/theme-toggle";
import {useEffect, useState, Suspense} from "react";
import authService from "@/services/auth/AuthService";
import {checkRefreshCookieExists} from "@/lib/utils/helpers/getCookie";
import {app_home_path} from "@/types/paths";
import {useRouter, useSearchParams} from "next/navigation";
import Link from "next/link";

const isDemoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const isGoogleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE !== "false";
const isGithubEnabled = process.env.NEXT_PUBLIC_AUTH_GITHUB !== "false";
const isEmailEnabled = process.env.NEXT_PUBLIC_AUTH_EMAIL !== "false";
const hasOAuthProviders = isGoogleEnabled || isGithubEnabled;
const hasAnyAuthMethod = hasOAuthProviders || isEmailEnabled;

function AuthErrorMessage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const message = searchParams.get('message');

  if (!error || !message) return null;

  return (
    <div className="bg-red-500/10 border-l-4 border-red-500 text-red-500 p-4 rounded-md shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-start">
        <AlertCircle className="h-5 w-5 mr-3 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-sm">Authentication Failed</h3>
          <p className="text-sm mt-1">{message}</p>
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
  const [showEmailLogin, setShowEmailLogin] = useState(!hasOAuthProviders);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (checkRefreshCookieExists()) {
      router.push(app_home_path);
    } else {
      // Check if admin setup is required
      authService.checkAdminSetupRequired().then((required) => {
        if (required) {
          router.push('/admin-setup');
        } else {
          setIsChecking(false);
        }
      });
    }
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
        setEmailError(result.msg);
      }
    } catch (error) {
      console.error('Email login error:', error);
      setEmailError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    setDemoError("");
    try {
      const success = await authService.loginAsDemo();
      if (success) {
        router.push(app_home_path);
      } else {
        setDemoError("Demo login is currently unavailable. Please try again later.");
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

  if (!isGoogleEnabled && !isGithubEnabled && !isEmailEnabled && !isDemoEnabled) {
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
      <div className="min-h-screen text-foreground flex flex-col justify-center items-center px-4 py-12 relative">
        {/* Theme Toggle */}
        <div className="absolute right-4 top-4 md:right-8 md:top-8">
          <ThemeToggle/>
        </div>

        {/* Logo */}
        <div className="w-full max-w-sm mb-8 flex justify-center">
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

          {/* OAuth Buttons */}
          {hasOAuthProviders && (
            <div className="space-y-4">
              {isGoogleEnabled && (
                <Button variant="outline" className="w-full" disabled={isLoading || isDemoLoading} onClick={()=>handleLogin(authService.loginWithGoogle)}>
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
                <Button variant="outline" className="w-full" disabled={isLoading || isDemoLoading} onClick={()=>handleLogin(authService.loginWithGithub)}>
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
                <span className="w-full border-t" />
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
                  className="w-full" 
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
                        className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
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
                        className="w-full pl-10 pr-10 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {emailError && (
                    <p className="text-sm text-destructive">{emailError}</p>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading}>
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

          {/* Demo Login Section */}
          {isDemoEnabled && (
            <>
              {hasAnyAuthMethod && (
                <div className="relative mb-4 mt-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
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
                <p className="text-sm text-destructive text-center">{demoError}</p>
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
