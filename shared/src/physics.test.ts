import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOLI_R, MAX_SIM_STEPS, STRIKER_R } from './constants';
import { layoutGoli } from './layout';
import { createSim, isAtRest, runToRest, stepSim } from './physics';

describe('physics', () => {
  it('uses only + - * / and Math.sqrt (no trig / hypot / pow)', () => {
    const src = readFileSync(new URL('./physics.ts', import.meta.url), 'utf8');
    const mathCalls = src.match(/Math\.\w+/g) ?? [];
    expect(new Set(mathCalls)).toEqual(new Set(['Math.sqrt']));
  });

  it('is bit-identical when run twice', () => {
    const run = () => runToRest(createSim({ x: 500, y: 908 }, { vx: 123.456, vy: -1650 }, layoutGoli(20)));
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.steps).toBeGreaterThan(0);
  });

  it('comes to rest well within the step cap', () => {
    const sim = runToRest(createSim({ x: 500, y: 908 }, { vx: 0, vy: -1650 }, layoutGoli(20)));
    expect(isAtRest(sim)).toBe(true);
    expect(sim.steps).toBeLessThan(MAX_SIM_STEPS);
  });

  it('conserves momentum in a head-on collision (before friction)', () => {
    const sim = createSim({ x: 400, y: 500 }, { vx: 1000, vy: 0 }, [{ x: 400 + STRIKER_R + GOLI_R + 1, y: 500 }]);
    const [s, g] = sim.bodies;
    const p0 = s.m * s.vx + g.m * g.vx;
    stepSim(sim);
    // One step of friction is applied after the collision; compare against the impulse only.
    expect(g.vx).toBeGreaterThan(s.vx);
    expect(s.m * s.vx + g.m * g.vx).toBeLessThan(p0);
    expect(s.m * s.vx + g.m * g.vx).toBeGreaterThan(p0 * 0.98);
  });

  it('never leaves bodies overlapping at rest', () => {
    const sim = runToRest(createSim({ x: 500, y: 92 }, { vx: 0, vy: 1650 }, layoutGoli(20)));
    const on = sim.bodies.filter((b) => b.onBoard);
    for (let i = 0; i < on.length; i++)
      for (let j = i + 1; j < on.length; j++) {
        const d = Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y);
        expect(d).toBeGreaterThan(on[i].r + on[j].r - 0.5);
      }
  });

  it('marks bodies that leave the board', () => {
    const sim = runToRest(createSim({ x: 500, y: 950 }, { vx: 0, vy: 1650 }, []));
    expect(sim.bodies[0].onBoard).toBe(false);
  });
});
