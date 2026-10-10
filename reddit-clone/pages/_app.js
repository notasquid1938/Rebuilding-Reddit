import Head from 'next/head';
import { Reddit_Sans } from 'next/font/google';
import '../styles/globals.css';

const redditSans = Reddit_Sans({ subsets: ['latin'], display: 'swap', weight: ['400', '500', '600', '700', '800'] });

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style jsx global>{`
        :root {
          --font-reddit-sans: ${redditSans.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}

export default MyApp;
