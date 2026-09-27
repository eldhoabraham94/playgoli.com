import { HOW_TO_ARTICLE } from '@goli/shared';
import { Legend } from '../ui/Legend';
import { Hero } from '../ui/Scene';
import { AppLink } from './Home';

/** /how-to-play: the full rules (same copy the server renders for search engines). */
export function HowToPlay({ navigate }: { navigate: (path: string) => void }) {
  const a = HOW_TO_ARTICLE;
  return (
    <div className="screen article">
      <nav className="crumbs">
        <AppLink to="/" navigate={navigate}>
          Goli
        </AppLink>{' '}
        › How to play
      </nav>
      <Hero size="sm" />
      <article className="about">
        <h1>{a.heading}</h1>
        <p>{a.intro}</p>
        {a.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {'paragraphs' in s && s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
            {'steps' in s && s.steps && (
              <ol className="steps">
                {s.steps.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ol>
            )}
            {'items' in s && s.items && (
              <ul className="ticks">
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            {s.heading === 'Points' && <Legend />}
          </section>
        ))}
        <AppLink to="/" navigate={navigate} className="btn big">
          Play Goli now
        </AppLink>
      </article>
    </div>
  );
}
