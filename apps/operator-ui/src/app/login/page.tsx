// SPDX-License-Identifier: Apache-2.0
'use client';

import React, { useEffect, useState } from 'react';
import { useIsAuthenticated, useLogin, useTranslate } from '@refinedev/core';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useLoaderPresence } from '@lib/client/hooks/use.loader.presence';

/// Redesigned login page — matches the Specula Figma "Login 2" frame.
/// Full-bleed nebula background; dark translucent card left with the
/// login affordance; marketing tagline right.
///
/// UI branches on auth provider:
///   - keycloak → single "Continue" button that fires the OAuth
///     redirect via `useLogin({})`. Credentials are typed on Keycloak,
///     not here, so the local form would be misleading.
///   - generic  → email/password form as before.
///
/// The provider is read from `NEXT_PUBLIC_AUTH_PROVIDER` at build time
/// (defaults to 'generic').
const AUTH_PROVIDER = process.env.NEXT_PUBLIC_AUTH_PROVIDER || 'generic';

/// Right-hand marketing carousel slides. Operator-practical tone:
/// each slide states a concrete promise the operator cares about
/// (uptime, revenue, growth), not brand poetry. Keep to 3 slides
/// so the auto-rotation cycles in a memorable, non-annoying loop.
const SLIDES = [
  {
    title: 'Every Charger. Every Session. One View.',
    body: 'See uptime, live sessions, and revenue across your entire network without switching tabs.',
  },
  {
    title: 'Catch Problems Before Drivers Do.',
    body: 'Real-time status from every charger. If a plug goes offline, you know first, not the driver in your parking lot.',
  },
  {
    title: 'Ship Sites. Scale Confidence.',
    body: 'Onboard new constellations in minutes. Track performance from day one. Grow without adding overhead.',
  },
] as const;

/// Auto-advance the marketing carousel every N ms. Long enough to
/// read a slide, short enough that a bored user still sees rotation.
const SLIDE_MS = 6000;

export default function LoginPage() {
  // Which face of the card is showing — `login` (front) or `register`
  // (back). Drives the 3D Y-axis rotation on the flip container.
  const [mode, setMode] = useState<'login' | 'register'>('login');
  // Register form step. Step 1 = credentials (email + password +
  // confirm). Step 2 = profile (name + company). Reset back to 1
  // whenever the user flips back to login so they start fresh next
  // time they visit register.
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Register-only fields. Live in the page rather than the register
  // panel so a partially-filled form isn't blown away when the user
  // flips back to login and returns.
  const [regName, setRegName] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  // Independent visibility toggles per password input so revealing
  // one doesn't leak into the other (matters for the register form's
  // side-by-side password + confirm layout, where a user might want
  // to peek at only one).
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Carousel index for the right-hand marketing tagline. Auto-
  // rotates every SLIDE_MS; resets the timer whenever the user
  // manually jumps via the dots so their pick doesn't get yanked
  // away immediately.
  const [slideIndex, setSlideIndex] = useState(0);
  const [perf, setPerf] = useState<{ttfb:number;fcp:number;lcp:number;domRdy:number;load:number} | null>(null);
  // `isPending` from useLogin flips back to false the instant the mutation
  // resolves — which happens BEFORE the browser has finished navigating
  // to Keycloak. `navigating` stays true from the click until this
  // component unmounts (which is when the browser reaches Keycloak),
  // so the spinner spans the full wait rather than disappearing halfway.
  const [navigating, setNavigating] = useState(false);
  const { mutate: login, isPending: isLoading } = useLogin();
  const translate = useTranslate();
  const router = useRouter();
  // Uses Refine's `useIsAuthenticated` — the SAME source of truth
  // SpeculaShell uses on /overview. Previously this page read
  // NextAuth's session cookie directly via `useSession()`, but the
  // generic auth provider stores auth in localStorage while also
  // creating a NextAuth session cookie. The two can disagree, and
  // when they did, /login and /overview would ping-pong.
  const { data: authData, isLoading: authLoading } = useIsAuthenticated();
  const alreadyAuthed = !authLoading && authData?.authenticated === true;
  const { setLoaderVisible } = useLoaderPresence();

  // Ownership contract for the persistent loader:
  //   • /login   OWNS SHOW. It turns the loader on when the user
  //              is already authed (or just signed in) and about to
  //              be redirected to /overview.
  //   • Shell    OWNS HIDE. Once /overview's SpeculaShell has
  //              mounted + settled, it drops the loader.
  //   • Safety:  When /login mounts and we are NOT alreadyAuthed
  //              (e.g. arrived here via logout), force-hide the
  //              loader so we don't render behind a hanging one.

  useEffect(() => {
    if (alreadyAuthed) {
      setLoaderVisible(true);
      router.replace('/overview');
    } else {
      setLoaderVisible(false);
    }
  }, [alreadyAuthed, router, setLoaderVisible]);

  // Carousel auto-advance. Depending on slideIndex resets the timer
  // when the user clicks a dot (so their pick gets its full SLIDE_MS
  // before the next auto-advance kicks in).
  useEffect(() => {
    const t = window.setInterval(() => {
      setSlideIndex((i) => (i + 1) % SLIDES.length);
    }, SLIDE_MS);
    return () => window.clearInterval(t);
  }, [slideIndex]);
  const busy = isLoading || navigating || alreadyAuthed;

  // Dev-only page-perf badge. Reports:
  //   TTFB  — time to first byte from Next.js dev server
  //   FCP   — first pixel painted (from PerformancePaintTiming)
  //   LCP   — largest content element painted (Web Vitals; the
  //           moment the page "looks" ready to a human)
  //   DOM   — DOMContentLoaded
  //   LOAD  — load event (all deferred assets done — includes async
  //           fonts, so this is often much later than perceived ready)
  useEffect(() => {
    let lcp = 0;
    let lcpObserver: PerformanceObserver | null = null;
    try {
      lcpObserver = new PerformanceObserver((entries) => {
        for (const e of entries.getEntries()) {
          lcp = Math.max(lcp, Math.round(e.startTime));
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}

    const capture = () => {
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      const fcpEntry = performance
        .getEntriesByType('paint')
        .find((p) => p.name === 'first-contentful-paint');
      const t = {
        ttfb:   nav ? Math.round(nav.responseStart)
                    : performance.timing.responseStart - performance.timing.navigationStart,
        fcp:    fcpEntry ? Math.round(fcpEntry.startTime) : 0,
        lcp,
        domRdy: nav ? Math.round(nav.domContentLoadedEventEnd)
                    : performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
        load:   nav ? Math.round(nav.loadEventEnd)
                    : performance.timing.loadEventEnd - performance.timing.navigationStart,
      };
      console.log(`[login] TTFB=${t.ttfb}ms · FCP=${t.fcp}ms · LCP=${t.lcp}ms · DOM=${t.domRdy}ms · LOAD=${t.load}ms`);
      setPerf(t);
    };

    const onLoaded = () => {
      // Give LCP one more tick to finalize after load fires.
      setTimeout(() => {
        capture();
        lcpObserver?.disconnect();
      }, 50);
    };

    if (document.readyState === 'complete') {
      onLoaded();
    } else {
      window.addEventListener('load', onLoaded, { once: true });
      return () => window.removeEventListener('load', onLoaded);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login(
      { email, password },
      {
        onError: () => {
          setError(translate('pages.login.invalidCredentials'));
        },
      },
    );
  };

  const handleKeycloakContinue = () => {
    setError(null);
    setNavigating(true);
    // Keycloak provider ignores payload — the mutation triggers
    // `signIn('keycloak', { callbackUrl: '/overview' })`.
    login({}, {
      onError: () => {
        // Only clear navigating on error — on success we stay busy
        // through the browser redirect.
        setNavigating(false);
        setError('Unable to reach the identity provider. Try again in a moment.');
      },
    });
  };

  return (
    <div
      className="relative min-h-screen bg-cover bg-center text-white"
      style={{ backgroundImage: 'url(/specula-bg.webp)' }}
    >
      {/* Dev-only perf badge, bottom-right. TTFB · DOM · full load. */}
      {perf ? (
        <div
          className="pointer-events-none fixed bottom-2 right-2 z-50 rounded-md border border-white/10 bg-black/65 px-3 py-1.5 font-mono text-[11px] text-white/85"
        >
          TTFB {perf.ttfb}ms · FCP {perf.fcp}ms · LCP {perf.lcp}ms · DOM {perf.domRdy}ms · Load {perf.load}ms
        </div>
      ) : null}

      {/* Subtle darkening layer so the form card + right-side tagline
          stay legible over the nebula. */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Already-authed catcher — the useEffect above turned on the
          persistent loader (from LoaderPresenceProvider) BEFORE
          navigating. That loader is already on top with z-50 so
          nothing here needs to render. Emit an empty React fragment
          to preserve the JSX ternary structure. */}
      {alreadyAuthed ? (
        <></>
      ) : (
      <div className="relative mx-auto flex min-h-screen max-w-[1600px] items-center px-8 py-10">
        {/* Two-column layout: login card left, marketing right.
            On narrow viewports we drop to single column and hide the
            right pane rather than squeeze both. */}
        <div className="grid w-full grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* Left — flip card. Perspective on the outer wrapper; the
              inner `.flip-card` rotates on Y-axis between the login
              front face and the register back face. Both faces sit
              in the same 3D space with `backface-visibility: hidden`
              so only the front-facing one is visible at any moment. */}
          <div
            className="mx-auto w-full max-w-[520px]"
            style={{ perspective: '1600px' }}
          >
            <div
              className="relative w-full transition-transform duration-700 ease-in-out"
              style={{
                transformStyle: 'preserve-3d',
                transform: mode === 'register' ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
            >
              {/* Front face — login */}
              <div
                className="rounded-2xl border border-white/10 bg-black/40 p-10 backdrop-blur-md"
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
              >
            <div className="mb-10 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/specula-logo.svg"
                alt=""
                width={40}
                height={40}
                className="size-10"
              />
              <div className="text-lg font-semibold tracking-wide text-[#8b3a1a]">
                SPECULA{' '}
                <span className="text-xs font-normal text-[#f5b342] opacity-70">by</span>{' '}
                <span className="text-sm font-light text-[#f5b342] opacity-90">Ensoledus</span>
              </div>
            </div>

            <h1 className="text-3xl font-semibold leading-tight">
              Welcome Back, Friend
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Sign in to your Specula console, the observation deck for
              your entire charging network.
            </p>

            {error ? (
              <div
                role="alert"
                className="mt-6 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              >
                {error}
              </div>
            ) : null}

            {AUTH_PROVIDER === 'keycloak' ? (
              <div className="mt-8 space-y-4">
                <button
                  type="button"
                  onClick={handleKeycloakContinue}
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#f5b342] px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#e6a232] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    'Continue to Sign In'
                  )}
                </button>
                <p className="text-center text-xs text-white/40">
                  You&rsquo;ll be redirected to Specula&rsquo;s identity provider.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-xs font-medium tracking-wide text-white/70"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
                    placeholder="you@company.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-xs font-medium tracking-wide text-white/70"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showLoginPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      disabled={isLoading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onMouseDown={() => setShowLoginPw(true)}
                      onMouseUp={() => setShowLoginPw(false)}
                      onMouseLeave={() => setShowLoginPw(false)}
                      onTouchStart={() => setShowLoginPw(true)}
                      onTouchEnd={() => setShowLoginPw(false)}
                      onTouchCancel={() => setShowLoginPw(false)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          setShowLoginPw(true);
                        }
                      }}
                      onKeyUp={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') setShowLoginPw(false);
                      }}
                      onBlur={() => setShowLoginPw(false)}
                      aria-label="Press and hold to show password"
                      className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white/90"
                    >
                      {showLoginPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <a
                      href="#"
                      className="text-xs text-white/60 hover:text-white/90"
                    >
                      Forgot password?
                    </a>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#f5b342] px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#e6a232] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    'Log In'
                  )}
                </button>
              </form>
            )}

            <div className="mt-10 flex items-center justify-between text-xs text-white/50">
              <span>
                Don&rsquo;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('register');
                  }}
                  className="cursor-pointer text-white/80 hover:text-white"
                >
                  Register here
                </button>
              </span>
              <a href="#" className="text-white/80 hover:text-white">
                Contact Support
              </a>
            </div>
              </div>

              {/* Back face — register. Pre-rotated 180deg so it's
                  right-side-up once the container flips. Absolute-
                  positioned over the front so both faces share the
                  same footprint (the container's height is driven by
                  whichever face is currently taller). */}
              <div
                className="absolute inset-0 rounded-2xl border border-white/10 bg-black/40 p-10 backdrop-blur-md"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                <div className="mb-10 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/specula-logo.svg"
                    alt=""
                    width={40}
                    height={40}
                    className="size-10"
                  />
                  <div className="text-lg font-semibold tracking-wide text-[#8b3a1a]">
                    SPECULA{' '}
                    <span className="text-xs font-normal text-[#f5b342] opacity-70">by</span>{' '}
                    <span className="text-sm font-light text-[#f5b342] opacity-90">Ensoledus</span>
                  </div>
                </div>

                <h1 className="text-3xl font-semibold leading-tight">
                  Create Your Account
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-white/60">
                  Register a new Specula operator account. You&rsquo;ll
                  get an observation deck for your entire charging
                  network.
                </p>

                {error && mode === 'register' ? (
                  <div
                    role="alert"
                    className="mt-6 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                  >
                    {error}
                  </div>
                ) : null}

                {/* Two-step register: step 1 collects credentials
                    (email + password + confirm), step 2 collects the
                    profile (name + company). Step indicator up top so
                    the user knows how far along they are. Each step
                    is its own <form> so the browser's native "submit
                    on Enter" behavior does the right thing per step
                    (advance vs. finalize). */}
                <div
                  className="mt-6 flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-widest text-white/50"
                  aria-hidden
                >
                  <span
                    className={
                      'flex size-5 items-center justify-center rounded-full border ' +
                      (regStep >= 1
                        ? 'border-[#f5b342] bg-[#f5b342] text-black'
                        : 'border-white/20 text-white/40')
                    }
                  >
                    1
                  </span>
                  <span
                    className={
                      'h-px w-8 ' +
                      (regStep === 2 ? 'bg-[#f5b342]' : 'bg-white/20')
                    }
                  />
                  <span
                    className={
                      'flex size-5 items-center justify-center rounded-full border ' +
                      (regStep === 2
                        ? 'border-[#f5b342] bg-[#f5b342] text-black'
                        : 'border-white/20 text-white/40')
                    }
                  >
                    2
                  </span>
                </div>

                {regStep === 1 ? (
                  <form
                    key="reg-step-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setError(null);
                      if (password !== regConfirm) {
                        setError('Passwords do not match.');
                        return;
                      }
                      if (password.length < 8) {
                        setError('Password must be at least 8 characters.');
                        return;
                      }
                      setRegStep(2);
                    }}
                    className="mt-6 space-y-5"
                  >
                    <div>
                      <label
                        htmlFor="reg-email"
                        className="mb-2 block text-xs font-medium tracking-wide text-white/70"
                      >
                        Email
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
                        placeholder="you@company.com"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="reg-password"
                          className="mb-2 block text-xs font-medium tracking-wide text-white/70"
                        >
                          Password
                        </label>
                        <div className="relative">
                          <input
                            id="reg-password"
                            type={showRegPw ? 'text' : 'password'}
                            autoComplete="new-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onMouseDown={() => setShowRegPw(true)}
                            onMouseUp={() => setShowRegPw(false)}
                            onMouseLeave={() => setShowRegPw(false)}
                            onTouchStart={() => setShowRegPw(true)}
                            onTouchEnd={() => setShowRegPw(false)}
                            onTouchCancel={() => setShowRegPw(false)}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                setShowRegPw(true);
                              }
                            }}
                            onKeyUp={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') setShowRegPw(false);
                            }}
                            onBlur={() => setShowRegPw(false)}
                            aria-label="Press and hold to show password"
                            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white/90"
                          >
                            {showRegPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="reg-confirm"
                          className="mb-2 block text-xs font-medium tracking-wide text-white/70"
                        >
                          Confirm
                        </label>
                        <div className="relative">
                          <input
                            id="reg-confirm"
                            type={showRegConfirm ? 'text' : 'password'}
                            autoComplete="new-password"
                            required
                            value={regConfirm}
                            onChange={(e) => setRegConfirm(e.target.value)}
                            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onMouseDown={() => setShowRegConfirm(true)}
                            onMouseUp={() => setShowRegConfirm(false)}
                            onMouseLeave={() => setShowRegConfirm(false)}
                            onTouchStart={() => setShowRegConfirm(true)}
                            onTouchEnd={() => setShowRegConfirm(false)}
                            onTouchCancel={() => setShowRegConfirm(false)}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                setShowRegConfirm(true);
                              }
                            }}
                            onKeyUp={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') setShowRegConfirm(false);
                            }}
                            onBlur={() => setShowRegConfirm(false)}
                            aria-label="Press and hold to show password"
                            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white/90"
                          >
                            {showRegConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#f5b342] px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#e6a232]"
                    >
                      Continue
                    </button>
                  </form>
                ) : (
                  <form
                    key="reg-step-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setError(null);
                      // TODO: wire to the real /register endpoint once
                      // the generic-auth provider exposes one. For now,
                      // this is a UI-only flow; the mutation lives in
                      // the auth-provider layer.
                      setRegisterSubmitting(true);
                      setTimeout(() => {
                        setRegisterSubmitting(false);
                        setError(
                          'Registration endpoint not wired yet. Ask kyle to hook it up.',
                        );
                      }, 400);
                    }}
                    className="mt-6 space-y-5"
                  >
                    <div>
                      <label
                        htmlFor="reg-name"
                        className="mb-2 block text-xs font-medium tracking-wide text-white/70"
                      >
                        Full name
                      </label>
                      <input
                        id="reg-name"
                        type="text"
                        autoComplete="name"
                        required
                        disabled={registerSubmitting}
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
                        placeholder="Kyle Harris"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="reg-company"
                        className="mb-2 block text-xs font-medium tracking-wide text-white/70"
                      >
                        Company
                      </label>
                      <input
                        id="reg-company"
                        type="text"
                        autoComplete="organization"
                        required
                        disabled={registerSubmitting}
                        value={regCompany}
                        onChange={(e) => setRegCompany(e.target.value)}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
                        placeholder="Specula Grid"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setRegStep(1);
                        }}
                        disabled={registerSubmitting}
                        className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={registerSubmitting}
                        className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#f5b342] px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#e6a232] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {registerSubmitting ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Creating account…
                          </>
                        ) : (
                          'Create Account'
                        )}
                      </button>
                    </div>
                  </form>
                )}

                <div className="mt-10 flex items-center justify-between text-xs text-white/50">
                  <span>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMode('login');
                        setRegStep(1);
                      }}
                      className="cursor-pointer text-white/80 hover:text-white"
                    >
                      Sign in
                    </button>
                  </span>
                  <a href="#" className="text-white/80 hover:text-white">
                    Contact Support
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Right — marketing carousel. Hidden on narrow so the
              login card gets full width without cramping. Auto-
              rotates every SLIDE_MS; dots are clickable to jump. */}
          <aside className="hidden max-w-xl text-white lg:block">
            {/*
              Stacked slides: all three occupy the same grid cell
              (row 1 / col 1) and crossfade via opacity — a real
              horizontal slide would need to know the container's
              width, and this reads calmer for marketing copy anyway.
              min-h keeps the login card from jumping height when a
              slide has more copy than another.
            */}
            <div className="relative grid min-h-[260px] grid-cols-1 grid-rows-1">
              {SLIDES.map((s, i) => (
                <div
                  key={i}
                  aria-hidden={i !== slideIndex}
                  className={
                    'col-start-1 row-start-1 transition-opacity duration-700 ease-in-out ' +
                    (i === slideIndex
                      ? 'opacity-100'
                      : 'pointer-events-none opacity-0')
                  }
                >
                  {/* Thin (300) matches the Figma's Roobert-Light stem
                      width; tracking dialed in slightly for airier feel
                      at 5xl. */}
                  <h2 className="text-5xl font-light leading-tight tracking-tight">
                    {s.title}
                  </h2>
                  <p className="mt-8 text-base leading-relaxed text-white/80">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Carousel indicator dots — active pill widens, inactive
                stay small. Clicking a dot jumps to that slide and
                resets the auto-rotate interval (see the effect above,
                which depends on slideIndex). */}
            <div
              className="mt-10 flex items-center gap-2"
              role="tablist"
              aria-label="Marketing slides"
            >
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === slideIndex}
                  aria-label={`Show slide ${i + 1}`}
                  onClick={() => setSlideIndex(i)}
                  className={
                    'h-2 cursor-pointer rounded-full transition-all duration-500 ' +
                    (i === slideIndex
                      ? 'w-8 bg-white'
                      : 'w-2 bg-white/40 hover:bg-white/60')
                  }
                />
              ))}
            </div>
          </aside>
        </div>
      </div>
      )}
    </div>
  );
}
