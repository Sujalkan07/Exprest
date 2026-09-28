'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!email || !password) {
      setMessage({ type: 'error', text: 'Please enter both email and password.' });
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name || email.split('@')[0],
            },
          },
        });

        if (error) {
          setMessage({ type: 'error', text: error.message });
          setLoading(false);
          return;
        }

        if (data.session) {
          setMessage({
            type: 'success',
            text: 'Account created successfully! Redirecting...',
          });
          setTimeout(() => router.push('/'), 1000);
        } else {
          setMessage({
            type: 'success',
            text: 'Registration successful! Please check your email to confirm your account.',
          });
          setLoading(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setMessage({ type: 'error', text: error.message });
          setLoading(false);
          return;
        }

        setMessage({
          type: 'success',
          text: 'Signed in successfully! Redirecting...',
        });
        setTimeout(() => router.push('/'), 1000);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Authentication error' });
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
        setLoading(false);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Google Sign-In failed' });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-elevated text-on-surface flex flex-col justify-between antialiased font-body-md">
      
      {/* Top Header */}
      <header className="w-full border-b border-border bg-bg/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
              EX
            </div>
            <span className="text-lg font-bold tracking-tight text-primary">Exprest</span>
          </Link>

          <Link href="/" className="text-body-sm font-body-sm text-secondary hover:text-primary transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Home
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-6 my-8">
        <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-sm">
          
          {/* Header Title */}
          <div className="text-center mb-6">
            <h1 className="text-heading-lg font-heading-lg text-primary tracking-tight">
              {isSignUp ? 'Create your Exprest account' : 'Sign in to Exprest'}
            </h1>
            <p className="text-body-sm font-body-sm text-secondary mt-1">
              {isSignUp ? 'Track live trains, save favorite routes & receive delay alerts' : 'Access your saved routes, companion telemetry & live alerts'}
            </p>
          </div>

          {/* Toggle Switch */}
          <div className="flex bg-surface-container rounded-xl p-1 mb-6 border border-border/60">
            <button
              type="button"
              onClick={() => { setIsSignUp(false); setMessage(null); }}
              className={`flex-1 py-2 rounded-lg text-body-sm font-body-sm font-semibold transition-all ${!isSignUp ? 'bg-surface-elevated text-primary shadow-xs' : 'text-secondary hover:text-primary'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsSignUp(true); setMessage(null); }}
              className={`flex-1 py-2 rounded-lg text-body-sm font-body-sm font-semibold transition-all ${isSignUp ? 'bg-surface-elevated text-primary shadow-xs' : 'text-secondary hover:text-primary'}`}
            >
              Register
            </button>
          </div>

          {/* Alert Message */}
          {message && (
            <div className={`p-3.5 mb-6 rounded-xl border text-body-sm font-body-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-success/10 border-success/30 text-success' : 'bg-danger/10 border-danger/30 text-danger'}`}>
              <span className="material-symbols-outlined text-[18px]">{message.type === 'success' ? 'check_circle' : 'error'}</span>
              <span>{message.text}</span>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-surface-elevated hover:bg-surface-container-low border border-border rounded-xl text-body-sm font-body-sm font-medium text-primary shadow-xs transition-all duration-150 active:scale-[0.99] disabled:opacity-60 mb-5"
          >
            {/* Google SVG Logo */}
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <span>{isSignUp ? 'Sign up with Google' : 'Sign in with Google'}</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center mb-5">
            <div className="border-t border-border w-full"></div>
            <span className="bg-surface px-3 text-label font-label text-secondary absolute uppercase tracking-wider text-[11px]">
              Or with email
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {isSignUp && (
              <div>
                <label className="block text-label font-label text-secondary mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required={isSignUp}
                  className="w-full px-3.5 py-2.5 bg-surface-elevated border border-border rounded-xl text-body-sm font-body-sm text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-label font-label text-secondary mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full px-3.5 py-2.5 bg-surface-elevated border border-border rounded-xl text-body-sm font-body-sm text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-label font-label text-secondary">Password</label>
                {!isSignUp && (
                  <a href="#" onClick={(e) => { e.preventDefault(); alert('Password reset link available via Supabase reset.'); }} className="text-label font-label text-primary hover:underline">
                    Forgot password?
                  </a>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 bg-surface-elevated border border-border rounded-xl text-body-sm font-body-sm text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-primary hover:bg-inverse-surface text-on-primary rounded-xl text-body-sm font-body-sm font-semibold shadow-sm transition-all duration-150 active:scale-[0.99] disabled:opacity-60 mt-2"
            >
              {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>

          </form>

          {/* Footer Terms Note */}
          <p className="text-label font-label text-text-tertiary text-center mt-6 text-[11px]">
            By continuing, you agree to Exprest's <span className="underline cursor-pointer">Terms of Service</span> and <span className="underline cursor-pointer">Privacy Policy</span>.
          </p>

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border py-4 text-center text-label font-label text-secondary">
        Exprest Rail Intelligence Platform · Built for Indian Railways
      </footer>

    </div>
  );
}
