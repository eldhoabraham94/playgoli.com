import type { CSSProperties } from 'react';

/** Style for a `.dot` drawn as a little glass marble in the given colour (see styles.css). */
export const marbleDot = (color: string) => ({ '--c': color }) as CSSProperties;
