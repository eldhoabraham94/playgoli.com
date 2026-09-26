// Board geometry (logical units; the canvas scales this to the screen)
export const BOARD = 1000;
export const CENTER = 500;
export const RING_R = 285;
export const THROW_R = 408;
export const GOLI_R = 22;
export const STRIKER_R = 28;

// Physics — must stay identical on server and every client
export const DT = 1 / 240;
export const FRICTION_A = 300;
export const FRICTION_B = 0.9;
export const STOP_SPEED = 3;
export const RESTITUTION = 0.9;
export const MAX_SPEED = 1650;
/** Hard cap on simulation length (20 s of game time). */
export const MAX_SIM_STEPS = 240 * 20;

// Rules
export const GOLI_PER_PLAYER = 2;
/** One attempt per player per turn: capture or not, play passes on. */
export const MAX_SHOTS_PER_TURN = 1;
export const SHOT_CLOCK_MS = 15_000;
/** A shooter who is disconnected gets this long before their turn is skipped. */
export const AWAY_TURN_MS = 4_000;
/** Extra pause after a shot's animation before the next shot clock starts. */
export const ANIM_BUFFER_MS = 500;
export const MAX_PLAYERS = 10;
export const MAX_SPECTATORS = 20;
export const NICK_MAX = 16;

export const PLAYER_COLORS = [
  '#e63946', // red
  '#4cc9f0', // sky
  '#f4d35e', // yellow
  '#80ed99', // green
  '#f15bb5', // pink
  '#f4a261', // orange
  '#9b5de5', // purple
  '#2ec4b6', // teal
  '#ffffff', // white
  '#4361ee', // blue
] as const;

export const REACTIONS = ['😂', '🔥', '😱', '👏', '🙏'] as const;
export type Reaction = (typeof REACTIONS)[number];
