import { useEffect, useMemo, useState } from 'react';
import { SidebarCard } from './Sidebar';
import { formatCount, monthLabel } from '@/lib/format';
import { fillMonths } from '@/lib/range';
import styles from '@/styles/Sidebar.module.css';


const HEIGHT = 64;

// Posts per month for a community. Clicking a bar shows that month's posts.
const HistoryChart = ({ name, range, onSelect }) => {
  const [months, setMonths] = useState(null);

  useEffect(() => {
    let active = true;
    setMonths(null);
    fetch(`/api/SubredditHistory?name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : { months: [] }))
      .then((data) => active && setMonths(fillMonths(data.months || [])))
      .catch(() => active && setMonths([]));
    return () => {
      active = false;
    };
  }, [name]);

  const peak = useMemo(() => (months || []).reduce((best, m) => (m.posts > (best?.posts || 0) ? m : best), null), [months]);

  if (!months || months.length < 2 || !peak) return null;
  const width = months.length;
  const inRange = (m) => range && m >= range.from && m <= range.to;

  return (
    <SidebarCard title="Posts per month">
      <svg
        className={styles.chart}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Posts per month in r/${name}, peaking at ${formatCount(peak.posts)} in ${monthLabel(peak.month)}`}
      >
        {months.map((m, i) => {
          const h = m.posts ? Math.max(1, (m.posts / peak.posts) * HEIGHT) : 0;
          return (
            <g key={m.month} className={styles.chartBar} onClick={() => m.posts && onSelect(m.month)}>
              {/* Full-height hit area so short bars are easy to click */}
              <rect x={i} y={0} width={1} height={HEIGHT} className={styles.chartHit} />
              <rect
                x={i + 0.1}
                y={HEIGHT - h}
                width={0.8}
                height={h}
                className={inRange(m.month) ? styles.chartFillActive : styles.chartFill}
              />
              <title>{`${monthLabel(m.month)}: ${formatCount(m.posts)} posts`}</title>
            </g>
          );
        })}
      </svg>
      <div className={styles.chartAxis}>
        <span>{monthLabel(months[0].month)}</span>
        <span>{monthLabel(months[months.length - 1].month)}</span>
      </div>
      <p className={styles.textSmall}>
        Busiest: {monthLabel(peak.month)} with {formatCount(peak.posts)} posts. Click a bar to see that month.
      </p>
    </SidebarCard>
  );
};

export default HistoryChart;
