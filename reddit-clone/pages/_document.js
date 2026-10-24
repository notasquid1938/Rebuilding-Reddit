import { Html, Head, Main, NextScript } from 'next/document';
import { ANALYTICS } from '@/lib/analytics';

// Applies the saved (or system) colour scheme before first paint to avoid a flash
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />
        <meta name="theme-color" content="#FF4500" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script defer src={ANALYTICS.src} data-website-id={ANALYTICS.websiteId} data-domains={ANALYTICS.domains} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
