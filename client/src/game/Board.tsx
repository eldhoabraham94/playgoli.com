import {
  BOARD,
  CENTER,
  DT,
  GOLI_R,
  STRIKER_R,
  createSim,
  freezeSim,
  isSimDone,
  stepSim,
  type GoliPos,
  type ShotResult,
  type Sim,
} from '@goli/shared';
import { useEffect, useRef } from 'react';
import { Renderer, type SceneMarble } from './render';

export interface BoardProps {
  goli: GoliPos[];
  striker: { x: number; y: number; inHand: boolean } | null;
  strikerColor: string;
  /** It's this device's turn to shoot. */
  canAim: boolean;
  /** Date.now() ms when the shot clock runs out, or null. */
  deadline: number | null;
  clockMs: number;
  /** Shot to animate with the shared physics; parent snaps to shot.after on done. */
  anim: ShotResult | null;
  onAnimDone?: () => void;
  onSlide?: (angle: number) => void;
  onShoot?: (angle: number, power: number) => void;
}

/** Pull distance (logical units) for full power. */
const MAX_PULL = 230;
const MIN_POWER = 0.04;
/** Touch target around the striker, generous for fingers. */
const GRAB_R = 95;
const STRIKER_KEY = -1;

export function Board(props: BoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const box = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    const renderer = new Renderer();
    const rot = new Map<number, number>();
    const lastPos = new Map<number, { x: number; y: number }>();
    let anim: { shot: ShotResult; sim: Sim; acc: number; done: boolean } | null = null;
    let pointer: { id: number; mode: 'slide' | 'aim'; downX: number; downY: number } | null = null;
    let aim: { angle: number; power: number } | null = null;
    let prevT = performance.now();
    let raf = 0;

    const resize = () => {
      const size = Math.max(120, Math.floor(Math.min(box.clientWidth, box.clientHeight)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = canvas.style.height = `${size}px`;
      const px = Math.round(size * dpr);
      if (canvas.width !== px) canvas.width = canvas.height = px;
      renderer.resize(px);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    const spin = (id: number, x: number, y: number, r: number) => {
      const p = lastPos.get(id);
      if (p) {
        const d = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
        if (d > 0 && d < 120) rot.set(id, (rot.get(id) ?? 0) + d / r);
      }
      lastPos.set(id, { x, y });
      return rot.get(id) ?? 0;
    };

    const frame = (t: number) => {
      const p = live.current;
      const dt = Math.min(0.1, (t - prevT) / 1000);
      prevT = t;

      if (!p.anim) anim = null;
      else if (anim?.shot !== p.anim) {
        anim = { shot: p.anim, sim: createSim(p.anim.start, p.anim.velocity, p.anim.before), acc: 0, done: false };
        pointer = null;
        aim = null;
      }
      if (anim && !anim.done) {
        anim.acc += dt;
        while (anim.acc >= DT && !isSimDone(anim.sim)) {
          stepSim(anim.sim);
          anim.acc -= DT;
        }
        if (isSimDone(anim.sim)) {
          freezeSim(anim.sim);
          anim.done = true;
          p.onAnimDone?.();
        }
      }
      if (!p.canAim && pointer) {
        pointer = null;
        aim = null;
      }

      let goli: SceneMarble[];
      let striker: { x: number; y: number; rot: number; color: string } | null = null;
      if (anim) {
        const bodies = anim.sim.bodies;
        goli = [];
        anim.shot.before.forEach((g, i) => {
          const b = bodies[i + 1];
          if (b.onBoard) goli.push({ id: g.id, x: b.x, y: b.y, rot: spin(g.id, b.x, b.y, GOLI_R) });
        });
        const sb = bodies[0];
        if (sb.onBoard) striker = { x: sb.x, y: sb.y, rot: spin(STRIKER_KEY, sb.x, sb.y, STRIKER_R), color: p.strikerColor };
      } else {
        goli = p.goli.map((g) => ({ id: g.id, x: g.x, y: g.y, rot: spin(g.id, g.x, g.y, GOLI_R) }));
        if (p.striker)
          striker = { x: p.striker.x, y: p.striker.y, rot: spin(STRIKER_KEY, p.striker.x, p.striker.y, STRIKER_R), color: p.strikerColor };
      }

      let clock: number | null = null;
      let clockSecs: number | null = null;
      if (!anim && p.deadline !== null) {
        const left = Math.max(0, p.deadline - Date.now());
        clock = Math.min(1, left / p.clockMs);
        clockSecs = Math.ceil(left / 1000);
      }

      renderer.draw(ctx, {
        goli,
        striker,
        throwLine: !anim && p.striker?.inHand ? p.strikerColor : null,
        aim,
        clock,
        clockSecs,
        time: t,
      });
      canvas.style.cursor = p.canAim && !anim ? 'grab' : 'default';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const toLogical = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * BOARD, y: ((e.clientY - r.top) / r.height) * BOARD };
    };
    const slideTo = (pt: { x: number; y: number }) => {
      live.current.onSlide?.(Math.atan2(pt.y - CENTER, pt.x - CENTER));
    };

    const onDown = (e: PointerEvent) => {
      const p = live.current;
      if (!p.canAim || p.anim || !p.striker || pointer) return;
      const pt = toLogical(e);
      const dx = pt.x - p.striker.x;
      const dy = pt.y - p.striker.y;
      const onStriker = dx * dx + dy * dy <= GRAB_R * GRAB_R;
      // In hand: press the striker to aim, anywhere else to slide it.
      // Not in hand: it can't move, so a press anywhere starts aiming.
      const mode = onStriker || !p.striker.inHand ? 'aim' : 'slide';
      pointer = { id: e.pointerId, mode, downX: pt.x, downY: pt.y };
      aim = null;
      if (mode === 'slide') slideTo(pt);
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const pt = toLogical(e);
      if (pointer.mode === 'slide') {
        slideTo(pt);
        return;
      }
      // Catapult: the shot goes opposite to the pull.
      const px = pointer.downX - pt.x;
      const py = pointer.downY - pt.y;
      const power = Math.min(1, Math.sqrt(px * px + py * py) / MAX_PULL);
      aim = power >= MIN_POWER ? { angle: Math.atan2(py, px), power } : null;
    };
    const onUp = (e: PointerEvent) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const p = live.current;
      if (pointer.mode === 'aim' && aim && p.canAim && !p.anim) p.onShoot?.(aim.angle, aim.power);
      pointer = null;
      aim = null;
    };
    const onCancel = () => {
      pointer = null;
      aim = null;
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  return (
    <div ref={wrapRef} className="board-wrap">
      <canvas ref={canvasRef} className="board" />
    </div>
  );
}
