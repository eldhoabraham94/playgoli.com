import { useState, type ReactNode } from 'react';
import { Pouch } from './Pouch';
import { shareOrCopy } from './share';
import { marbleDot } from './marble';
import { Rain } from './Scene';

export interface ResultRow {
  id: string;
  name: string;
  color: string;
  pouch: number[];
  winner: boolean;
  you?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** "I won Goli with 7 goli! Play: <link>" and friends. */
export function resultText(rows: ResultRow[], link: string): string {
  const winners = rows.filter((r) => r.winner);
  const best = winners[0]?.pouch.length ?? 0;
  const me = rows.find((r) => r.you);
  const play = `Play: ${link}`;
  if (me?.winner) {
    return winners.length > 1
      ? `I tied for the win in Goli with ${best} goli! ${play}`
      : `I won Goli with ${best} goli! ${play}`;
  }
  const names = winners.map((w) => w.name).join(' & ');
  if (me) return `I got ${me.pouch.length} goli in Goli. ${names} won with ${best}! ${play}`;
  return `${names} won Goli with ${best} goli! ${play}`;
}

export function Results({ rows, link, children }: { rows: ResultRow[]; link?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const sorted = [...rows].sort((a, b) => b.pouch.length - a.pouch.length);
  // Standard competition ranking: ties share a place.
  const place = (i: number) => sorted.findIndex((r) => r.pouch.length === sorted[i].pouch.length);

  const share = async () => {
    if (!link) return;
    if ((await shareOrCopy({ text: resultText(rows, link) })) === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="overlay">
      <Rain />
      <div className="card anim-in">
        <h2>Results</h2>
        <ol className="ranking">
          {sorted.map((p, i) => (
            <li
              key={p.id}
              className={`anim-in${p.winner ? ' winner' : ''}${p.you ? ' me' : ''}`}
              style={{ animationDelay: `${0.25 + i * 0.12}s` }}
            >
              <span className="place">{MEDALS[place(i)] ?? place(i) + 1}</span>
              <span className="rank-name">
                <span className="dot small" style={marbleDot(p.color)} /> {p.name}
                {p.you && <span className="tag">you</span>}
              </span>
              <b>{p.pouch.length}</b>
              <Pouch ids={p.pouch} delay={0.5 + i * 0.12} />
            </li>
          ))}
        </ol>
        {link && (
          <button className="btn secondary" onClick={share}>
            {copied ? 'Copied!' : 'Share result'}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
