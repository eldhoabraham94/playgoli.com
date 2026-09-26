/**
 * Motion pieces for the static screens (all CSS animation; styles in splash.css + styles.css).
 */
import { useEffect, type CSSProperties } from 'react';
import { SPLASH_BOUNCE, SPLASH_DUST, SPLASH_STAGE, SPLASH_TITLE } from '../splash/markup';

const css = (vars: Record<string, string | number>) => vars as CSSProperties;

/** The tilted ground with the looping shot; `title` adds the dropping GOLI letters. */
export function Hero({ size = 'lg', title = false }: { size?: 'lg' | 'sm'; title?: boolean }) {
  return <div className={`hero hero-${size}`} dangerouslySetInnerHTML={{ __html: SPLASH_STAGE + (title ? SPLASH_TITLE : '') }} />;
}

const BOKEH = [
  { x: '6%', y: '12%', s: '120px', c: '#4cc9f0', d: '26s', delay: '0s' },
  { x: '72%', y: '6%', s: '90px', c: '#f2b705', d: '22s', delay: '-6s' },
  { x: '80%', y: '48%', s: '150px', c: '#e63946', d: '30s', delay: '-12s' },
  { x: '-4%', y: '58%', s: '110px', c: '#80ed99', d: '24s', delay: '-3s' },
  { x: '40%', y: '82%', s: '130px', c: '#9b5de5', d: '28s', delay: '-18s' },
  { x: '55%', y: '28%', s: '60px', c: '#ffffff', d: '20s', delay: '-9s' },
];

/**
 * The living background behind every static screen: drifting out-of-focus marbles
 * and rising dust. Mounted once by App; hidden (and paused) while a game is on.
 */
export function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="bokeh">
        {BOKEH.map((b, i) => (
          <i key={i} style={css({ '--x': b.x, '--y': b.y, '--s': b.s, '--c': b.c, animationDuration: b.d, animationDelay: b.delay })} />
        ))}
      </div>
      <div dangerouslySetInnerHTML={{ __html: SPLASH_DUST }} />
      <div className="ambient-glow" />
    </div>
  );
}

/** Call from game screens: switches the ambient background off while playing. */
export function useInGame() {
  useEffect(() => {
    document.body.classList.add('in-game');
    return () => document.body.classList.remove('in-game');
  }, []);
}

/** A side-on groove where one marble rolls in and knocks the next one along (lobby). */
export function Track() {
  const marble = (cls: string) => (
    <div className={`tm ${cls}`}>
      <div className="shadow" />
      <div className="sp" />
    </div>
  );
  return (
    <div className="track" aria-hidden="true">
      <div className="track-groove" />
      {marble('tm-a')}
      {marble('tm-b')}
      <div className="tm-clack" />
    </div>
  );
}

/** Three hopping marbles, for "waiting…" lines. */
export function Hop() {
  return <span className="hop" dangerouslySetInnerHTML={{ __html: SPLASH_BOUNCE }} />;
}

const RAIN_COLORS = ['#e63946', '#4cc9f0', '#f4d35e', '#80ed99', '#f15bb5', '#f4a261', '#9b5de5', '#2ec4b6', '#ffffff'];

/** A one-off shower of tiny marbles (results). */
export function Rain({ count = 18 }: { count?: number }) {
  return (
    <div className="rain" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={css({
            '--x': `${(i * 53) % 100}%`,
            '--s': `${8 + ((i * 7) % 9)}px`,
            '--c': RAIN_COLORS[i % RAIN_COLORS.length],
            '--d': `${2.2 + ((i * 13) % 10) / 10}s`,
            '--delay': `${((i * 17) % 14) / 10}s`,
          })}
        />
      ))}
    </div>
  );
}
