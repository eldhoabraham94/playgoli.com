/**
 * The loading scene's markup: inlined into index.html at build time (vite.config.ts)
 * so it shows before any JS runs, and reused inside the app (<Splash/>, <Hero/>).
 * Styles: splash.css (inlined in the page, so available everywhere).
 */

const marble = (cls: string, x: number, y: number, roll = false) =>
  `<div class="m ${cls}" style="--x:${x}px;--y:${y}px"><div class="shadow"></div><div class="bb"><div class="sp${roll ? ' roll' : ''}"></div></div></div>`;

export const SPLASH_DUST = `<div class="splash-dust" aria-hidden="true">${'<i></i>'.repeat(12)}</div>`;

/** The tilted patch of ground with the ring and the looping shot. */
export const SPLASH_STAGE =
  `<div class="splash-stage" aria-hidden="true"><div class="splash-ground">` +
  `<svg class="splash-ring" viewBox="0 0 220 220"><circle class="throw" cx="110" cy="110" r="100"/>` +
  `<circle class="groove" cx="110" cy="110" r="80" transform="rotate(-90 110 110)"/>` +
  `<circle class="lip" cx="110" cy="110" r="80" transform="rotate(-90 110 110)"/></svg>` +
  // Far to near, so nearer marbles overlap farther ones.
  marble('goli g1', 0, -24) +
  marble('goli g2', -24, 0) +
  marble('goli g3', 0, 0) +
  marble('goli g4', 24, 0) +
  marble('goli g5', 0, 24) +
  marble('goli target', 34, 40, true) +
  marble('striker', -78, 86, true) +
  `<div class="m clack"><div class="bb"><div class="burst"></div></div></div>` +
  `<div class="splash-edge"></div></div></div>`;

/** The dropping GOLI letters; a real <h1> in the app, a plain element in the loading splash (one h1 per page). */
export const splashTitle = (tag: 'h1' | 'div') =>
  `<${tag} class="splash-title"><span>G</span><span>o</span><span>l</span><span>i</span></${tag}>`;
export const SPLASH_TITLE = splashTitle('h1');

/** Everything above the loading text. */
export const SPLASH_SCENE = SPLASH_DUST + SPLASH_STAGE + splashTitle('div');

export const SPLASH_BOUNCE = '<div class="splash-bounce" aria-hidden="true"><i></i><i></i><i></i></div>';

/** Full static splash for index.html. */
export function splashHtml(text: string): string {
  return `<div id="splash" class="splash" role="status" aria-label="Loading Goli">${SPLASH_SCENE}<p class="splash-text">${text}</p>${SPLASH_BOUNCE}</div>`;
}
