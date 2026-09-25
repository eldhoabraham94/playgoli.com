import { REACTIONS, type Reaction } from '@goli/shared';
import { useState } from 'react';
import type { FloatingReaction } from '../net/useRoom';

/** The five quick reactions; cools down for a second (the server enforces it too). */
export function ReactionBar({ onReact }: { onReact: (e: Reaction) => void }) {
  const [cooling, setCooling] = useState(false);
  return (
    <div className="reaction-bar" role="group" aria-label="Reactions">
      {REACTIONS.map((e) => (
        <button
          key={e}
          disabled={cooling}
          onClick={() => {
            onReact(e);
            setCooling(true);
            setTimeout(() => setCooling(false), 1000);
          }}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** Emoji floating up over the board, with the sender's name. */
export function FloatingReactions({
  items,
  who,
}: {
  items: FloatingReaction[];
  who: (id: string) => { name: string; color: string } | undefined;
}) {
  return (
    <div className="float-layer" aria-hidden>
      {items.map((r) => {
        const m = who(r.from);
        const left = 12 + ((r.key * 37) % 76);
        return (
          <div key={r.key} className="float" style={{ left: `${left}%` }}>
            <span className="float-emoji">{r.emoji}</span>
            {m && (
              <span className="float-name" style={{ borderColor: m.color }}>
                {m.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
