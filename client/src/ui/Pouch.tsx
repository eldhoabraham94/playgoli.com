import { goliLook } from '../game/render';

/** A row of little goli for a player's winnings; `delay` (s) is when the first one drops in. */
export function Pouch({ ids, delay = 0 }: { ids: number[]; delay?: number }) {
  return (
    <span className="pouch">
      {ids.map((id, i) => {
        const { glass, eye } = goliLook(id);
        return (
          <span
            key={id}
            className="mini-goli anim-in"
            style={{
              background: `radial-gradient(circle at 35% 30%, #fff 0 12%, ${glass} 30%, ${eye} 70%, #2a120a 100%)`,
              animationDelay: `${delay + i * 0.07}s`,
            }}
          />
        );
      })}
    </span>
  );
}
