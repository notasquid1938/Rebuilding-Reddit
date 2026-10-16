import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { resolveLanding } from '@/lib/navigation';
// Bundled from npm rather than fetched from Google Fonts at build time, which
// made builds fail whenever that request did
import '@fontsource-variable/reddit-sans';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  useEffect(() => {
    router.events.on('routeChangeStart', resolveLanding);
    return () => router.events.off('routeChangeStart', resolveLanding);
  }, [router.events]);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}

export default MyApp;
