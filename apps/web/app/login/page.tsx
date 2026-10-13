'use client';

import React, { useState, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());

  const rawRedirect = searchParams.get('redirectTo');
  const safeRedirect =
    rawRedirect &&
    rawRedirect.startsWith('/') &&
    !rawRedirect.startsWith('//') &&
    !rawRedirect.includes(':') &&
    !rawRedirect.includes('\\')
      ? rawRedirect
      : '/';

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (searchParams.get('error') === 'oauth_failed') {
      setMessage({
        type: 'error',
        text: 'Google authentication could not be completed. Please try again.',
      });
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage({ type: 'error', text: 'Please enter both email and password.' });
      setLoading(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setMessage({ type: 'error', text: 'Please enter a valid email address.' });
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
      setLoading(false);
      return;
    }

    const displayName = name.trim() || trimmedEmail.split('@')[0];

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: displayName,
            },
          },
        });

        if (error) {
          setMessage({
            type: 'error',
            text: error.message || 'Failed to create account. Please check your details.',
          });
          setLoading(false);
          return;
        }

        if (data?.session) {
          setMessage({
            type: 'success',
            text: 'Account registered successfully! Redirecting...',
          });
          setTimeout(() => {
            router.push(safeRedirect);
            router.refresh();
          }, 600);
        } else {
          // Email confirmation is required by Supabase
          setMessage({
            type: 'success',
            text: 'Account registered! Please check your email inbox to verify your account before signing in.',
          });
          setLoading(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          setMessage({
            type: 'error',
            text: error.message || 'Invalid email or password.',
          });
          setLoading(false);
          return;
        }

        setMessage({
          type: 'success',
          text: 'Signed in successfully! Redirecting...',
        });
        setTimeout(() => {
          router.push(safeRedirect);
          router.refresh();
        }, 600);
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Authentication request failed. Please check connection.',
      });
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const callbackUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(safeRedirect)}`
          : undefined;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
        },
      });

      if (error) {
        setMessage({
          type: 'error',
          text: error.message || 'Google Sign-In failed to start.',
        });
        setLoading(false);
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Failed to initiate Google Sign-In.',
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col justify-between antialiased font-sans">
      {/* Top Header */}
      <header className="w-full border-b border-border bg-surface-container-lowest sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-13 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-primary text-on-primary flex items-center justify-center">
              <span
                className="material-symbols-outlined text-[14px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                train
              </span>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-on-surface">Exprest</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success"></span>
          </div>

          <span className="text-[12px] text-text-tertiary font-mono">
            Secure Authentication
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-6 my-6">
        <div className="w-full max-w-[420px] bg-surface-container-lowest border border-border rounded-2xl p-7 shadow-sm">
          {/* Header Title */}
          <div className="text-center mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center mx-auto mb-3 shadow-xs">
              <span
                className="material-symbols-outlined text-[20px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                train
              </span>
            </div>
            <h1 className="text-[20px] font-semibold text-on-surface tracking-tight">
              {isSignUp ? 'Create your Exprest account' : 'Sign in to Exprest'}
            </h1>
            <p className="text-[13px] text-secondary mt-1">
              {isSignUp
                ? 'Track live trains, save favorite routes & receive delay alerts'
                : 'Access your saved routes, live telemetry & radar alerts'}
            </p>
          </div>

          {/* Toggle Switch */}
          <div className="flex bg-surface-container rounded-xl p-1 mb-5 border border-border">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setMessage(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                !isSignUp
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setMessage(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                isSignUp
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              Register
            </button>
          </div>

          {/* Alert Message */}
          {message && (
            <div
              className={`p-3 mb-5 rounded-xl border text-[13px] flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {message.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <span>{message.text}</span>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-surface-container-lowest hover:bg-surface-container border border-border rounded-xl text-[13px] font-medium text-on-surface shadow-xs transition-all active:scale-[0.99] disabled:opacity-60 mb-4"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span>{isSignUp ? 'Sign up with Google' : 'Sign in with Google'}</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center mb-4">
            <div className="border-t border-border w-full"></div>
            <span className="bg-surface-container-lowest px-2.5 text-text-tertiary uppercase tracking-wider text-[11px] font-mono">
              Or with email
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isSignUp && (
              <div>
                <label className="block text-[12px] font-medium text-secondary mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Rahul Sharma"
                  required={isSignUp}
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-border rounded-xl text-[13px] text-on-surface placeholder:text-text-tertiary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-secondary mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full px-3 py-2 bg-surface-container-lowest border border-border rounded-xl text-[13px] text-on-surface placeholder:text-text-tertiary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[12px] font-medium text-secondary">Password</label>
                {!isSignUp && (
                  <span className="text-[11px] text-secondary hover:text-on-surface cursor-pointer">
                    Forgot password?
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-border rounded-xl text-[13px] text-on-surface placeholder:text-text-tertiary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-[17px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary hover:bg-neutral-800 text-on-primary rounded-xl text-[13px] font-medium transition-all active:scale-[0.98] disabled:opacity-60 shadow-sm mt-1"
            >
              {loading
                ? isSignUp
                  ? 'Creating account...'
                  : 'Signing in...'
                : isSignUp
                ? 'Create Account'
                : 'Sign In'}
            </button>
          </form>

          {/* Terms note */}
          <p className="text-[11px] text-text-tertiary text-center mt-5">
            By continuing, you agree to Exprest&apos;s Terms of Service and Privacy Policy.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border py-3 text-center text-[12px] text-text-tertiary">
        Exprest Rail Intelligence Platform · Built for Indian Railways
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-container-lowest" />}>
      <LoginForm />
    </Suspense>
  );
}
