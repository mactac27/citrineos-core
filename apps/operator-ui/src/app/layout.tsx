// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { Providers } from '@lib/providers';
import config from '@lib/utils/config';
import { type Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import React from 'react';
import './globals.css';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

// Satoshi replaces Roobert as the primary sans. Satoshi ships
// Light / Regular / Medium / Bold / Black — no dedicated
// SemiBold (600). Browsers will resolve `font-weight: 600`
// requests to the nearest available weight (700 Bold) via the
// standard font-matching algorithm, which is acceptable given
// how sparingly 600 is used in the codebase.
const satoshiFont = localFont({
  src: [
    {
      path: './_fonts/Satoshi-Light.otf',
      weight: '300',
      style: 'normal',
    },
    {
      path: './_fonts/Satoshi-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './_fonts/Satoshi-Medium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './_fonts/Satoshi-Bold.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: './_fonts/Satoshi-Black.otf',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-satoshi',
});

export const metadata: Metadata = {
  title: config.appName,
  icons: {
    icon: '/Citrine_Favicon_256_clear3.png',
  },
};

const fallbackLocale = 'en';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme');
  const mode = theme?.value === 'dark' ? 'dark' : 'light';

  const locale = await getLocale();
  const messages = await getMessages();
  const fallbackMessages = await getMessages({ locale: fallbackLocale });

  return (
    <html lang={locale} className={satoshiFont.variable} suppressHydrationWarning>
      {/*
       * `suppressHydrationWarning` also on <body> — Grammarly (and
       * some other browser extensions) inject data-* attributes onto
       * the body element before React hydrates, causing an SSR/client
       * attribute mismatch that unmounts the whole tree (white screen).
       * The suppression only prevents WARNING and tree-abandon on this
       * element's attributes — it doesn't affect real hydration errors
       * inside the body's subtree.
       */}
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={{ ...fallbackMessages, ...messages }}>
          <NuqsAdapter>
            <Providers defaultMode={mode}>{children}</Providers>
          </NuqsAdapter>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
