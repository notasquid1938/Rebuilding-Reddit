import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Header from './Header';
import LeftNav from './LeftNav';
import KeyboardShortcuts from './KeyboardShortcuts';
import styles from '@/styles/Layout.module.css';

// App shell: sticky header, left navigation, main column and optional right sidebar.
const Layout = ({ children, sidebar, banner }) => {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const close = () => setNavOpen(false);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

  return (
    <div className={styles.app}>
      <Header onToggleNav={() => setNavOpen((open) => !open)} />
      <div className={styles.body}>
        <LeftNav open={navOpen} onClose={() => setNavOpen(false)} />
        <div className={styles.contentArea}>
          {banner}
          <div className={styles.columns}>
            <main className={styles.main}>{children}</main>
            {sidebar && <aside className={styles.sidebar}>{sidebar}</aside>}
          </div>
        </div>
      </div>
      <KeyboardShortcuts />
    </div>
  );
};

export default Layout;
