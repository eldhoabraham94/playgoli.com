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
  points: number;
  winner: boolean;
  you?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** "I won Goli with 12 points! Play: <link>" and friends. */
export function resultText(rows: ResultRow[], link: string): string {
  const winners = rows.filter((r) => r.winner);
  const best = winners[0]?.points ?? 0;
  const me = rows.find((r) => r.you);
  const play = `Play: ${link}`;
  if (me?.winner) {
    return winners.length > 1
      ? `I tied for the win in Goli with ${best} points! ${play}`
      : `I won Goli with ${best} points! ${play}`;
  }
  const names = winners.map((w) => w.name).join(' & ');
  if (me) return `I got ${me.points} points in Goli. ${names} won with ${best}! ${play}`;
  return `${names} won Goli with ${best} points! ${play}`;
}

export function Results({
  rows,
  values,
  link,
  children,
}: {
  rows: ResultRow[];
  /** Points per goli id, for the pouch colours. */
  values: number[];
  link?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  // Standard competition ranking: ties share a place.
  const place = (i: number) => sorted.findIndex((r) => r.points === sorted[i].points);

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
              <b className="pts">
                {p.points}
                <small> pts</small>
              </b>
              <Pouch ids={p.pouch} values={values} delay={0.5 + i * 0.12} />
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
