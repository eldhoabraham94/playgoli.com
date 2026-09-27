import { FAQ, HOME_FEATURES, HOME_HOW, HOME_INTRO, isRoomCode, normaliseRoomCode } from '@goli/shared';
import { useState, type MouseEvent } from 'react';
import { createRoom } from '../net/api';
import { Hero } from '../ui/Scene';

/** An in-app link that is also a real <a href> (so search engines can follow it). */
export function AppLink({ to, navigate, className, children }: { to: string; navigate: (p: string) => void; className?: string; children: React.ReactNode }) {
  const go = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
    window.scrollTo(0, 0);
  };
  return (
    <a href={to} className={className} onClick={go}>
      {children}
    </a>
  );
}

export function Home({ navigate }: { navigate: (path: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await createRoom();
    setBusy(false);
    if ('code' in r) navigate(`/r/${r.code}`);
    else setError(r.error);
  };

  const joinCode = normaliseRoomCode(code);

  return (
    <div className="screen home">
      <section className="fold">
        <Hero size="lg" title />
        <p className="tagline">The marbles game from the school ground, online. Free, up to 10 friends, no download.</p>
        <button className="btn big" onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create game'}
        </button>
        {error && <p className="error">{error}</p>}
        <form
          className="code-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (isRoomCode(joinCode)) navigate(`/r/${joinCode}`);
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="CODE"
            aria-label="Room code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={4}
          />
          <button className="btn secondary" disabled={!isRoomCode(joinCode)}>
            Join
          </button>
        </form>
        <button className="btn ghost" onClick={() => navigate('/practice')}>
          Practice on this phone
        </button>
        <a href="#about" className="more-hint">
          What is Goli? <span aria-hidden="true">⌄</span>
        </a>
      </section>

      <section id="about" className="about">
        <h2>{HOME_INTRO.heading}</h2>
        {HOME_INTRO.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <h2>{HOME_FEATURES.heading}</h2>
        <ul className="ticks">
          {HOME_FEATURES.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        <h2>{HOME_HOW.heading}</h2>
        <ul className="ticks">
          {HOME_HOW.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        <AppLink to="/how-to-play" navigate={navigate} className="btn secondary small">
          Full rules and tips
        </AppLink>
        <h2>Questions</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <button className="btn big" onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create a game'}
        </button>
      </section>
    </div>
  );
}
