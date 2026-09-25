import { goliLook } from '../game/render';

/** A row of little goli for a player's winnings. */
export function Pouch({ ids }: { ids: number[] }) {
  return (
    <span className="pouch">
      {ids.map((id) => {
        const { glass, eye } = goliLook(id);
        return (
          <span
            key={id}
            className="mini-goli"
            style={{ background: `radial-gradient(circle at 35% 30%, #fff 0 12%, ${glass} 30%, ${eye} 70%, #2a120a 100%)` }}
          />
        );
      })}
    </span>
  );
}
