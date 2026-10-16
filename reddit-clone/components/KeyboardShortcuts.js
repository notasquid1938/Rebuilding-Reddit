import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styles from '@/styles/Layout.module.css';

const SHORTCUTS = [
  ['j', 'Next post'],
  ['k', 'Previous post'],
  ['o or Enter', 'Open the selected post'],
  ['s', 'Save or unsave the selected post'],
  ['/', 'Search communities'],
  ['?', 'Show these shortcuts'],
  ['Esc', 'Close / clear the selection'],
];

const FOCUS_ATTR = 'data-kb-selected';

const typingIn = (el) =>
  el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function posts() {
  return [...document.querySelectorAll('main article')];
}

function selected() {
  return document.querySelector(`main article[${FOCUS_ATTR}]`);
}

function select(article) {
  selected()?.removeAttribute(FOCUS_ATTR);
  if (!article) return;
  article.setAttribute(FOCUS_ATTR, '');
  article.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// Reddit-style keyboard navigation for feeds (j/k, o, s, /, ?)
const KeyboardShortcuts = () => {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const clear = () => selected()?.removeAttribute(FOCUS_ATTR);
    router.events.on('routeChangeStart', clear);
    return () => router.events.off('routeChangeStart', clear);
  }, [router.events]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return;
      if (e.key === 'Escape') {
        setHelpOpen(false);
        selected()?.removeAttribute(FOCUS_ATTR);
        return;
      }
      if (e.key === '?') {
        setHelpOpen((open) => !open);
        return;
      }
      if (e.key === '/') {
        const search = document.querySelector('header input');
        if (search) {
          e.preventDefault();
          search.focus();
        }
        return;
      }
      if (e.key === 'j' || e.key === 'k') {
        const list = posts();
        if (list.length === 0) return;
        const current = list.indexOf(selected());
        const next = current === -1 ? 0 : current + (e.key === 'j' ? 1 : -1);
        select(list[Math.max(0, Math.min(list.length - 1, next))]);
        return;
      }
      const article = selected();
      if (!article) return;
      // Enter only when nothing else (a link or button) has focus
      if (e.key === 'o' || (e.key === 'Enter' && (e.target === document.body || e.target === article))) {
        const link = article.querySelector('h1 a, h2 a, h3 a');
        if (link) {
          e.preventDefault();
          link.click();
        }
      } else if (e.key === 's') {
        article.querySelector('[data-action="save"]')?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!helpOpen) return null;
  return (
    <div className={styles.shortcutsBackdrop} onClick={() => setHelpOpen(false)}>
      <div
        className={styles.shortcuts}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Keyboard shortcuts</h2>
        <dl>
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
};

export default KeyboardShortcuts;
