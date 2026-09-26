import { GOLI_POINTS, RAJA_POINTS } from '@goli/shared';
import { goliLook } from '../game/render';

const ITEMS = [
  { value: GOLI_POINTS.white, label: '1' },
  { value: GOLI_POINTS.green, label: '2' },
  { value: GOLI_POINTS.blue, label: '3' },
  { value: RAJA_POINTS, label: `${RAJA_POINTS} +shot` },
];

/** What each colour is worth: ⚪1 🟢2 🔵3 🔴5 + an extra shot. */
export function Legend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`legend${compact ? ' compact' : ''}`} aria-label="Points: white 1, green 2, blue 3, red Raja 5 and an extra shot">
      {ITEMS.map(({ value, label }) => {
        const { glass, eye } = goliLook(value, value);
        return (
          <span key={value} className="legend-item">
            <span
              className="mini-goli"
              style={{ background: `radial-gradient(circle at 35% 30%, #fff 0 12%, ${glass} 32%, ${eye} 75%, #2a120a 100%)` }}
            />
            {label}
          </span>
        );
      })}
      {!compact && <span className="legend-note">Striker must end outside the ring</span>}
    </div>
  );
}
