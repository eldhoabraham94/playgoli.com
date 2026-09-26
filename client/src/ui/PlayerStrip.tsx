import { useEffect, useRef } from 'react';
import { marbleDot } from './marble';

export interface StripPlayer {
  id: string;
  name: string;
  color: string;
  count: number;
  away?: boolean;
  you?: boolean;
}

export function PlayerStrip({
  players,
  currentId,
  talkingId = null,
  onPick,
}: {
  players: StripPlayer[];
  currentId: string | null;
  /** Whose voice is playing right now. */
  talkingId?: string | null;
  /** When set (host), chips are tappable. */
  onPick?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('.chip.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [currentId]);
  return (
    <div className="strip" ref={ref}>
      {players.map((p) => {
        const cls = `chip${p.id === currentId ? ' active' : ''}${p.away ? ' away' : ''}${p.you ? ' you' : ''}${p.id === talkingId ? ' talking' : ''}`;
        const inner = (
          <>
            <span className="dot" style={marbleDot(p.color)}>
              {p.count}
            </span>
            <span className="chip-name">{p.name}</span>
            {p.id === talkingId && (
              <span className="bars" aria-label="talking">
                <i />
                <i />
                <i />
              </span>
            )}
          </>
        );
        return onPick && !p.you ? (
          <button key={p.id} className={cls} onClick={() => onPick(p.id)}>
            {inner}
          </button>
        ) : (
          <div key={p.id} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
