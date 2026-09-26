import { useEffect, useState } from 'react';
import { SPLASH_BOUNCE, SPLASH_SCENE } from '../splash/markup';

const LINES = ['Scratching the ring', 'Polishing the goli', 'Picking a lucky striker', 'Drawing the throw line'];

/** The animated loading scene inside the app (styles are inlined in index.html). */
export function Splash({ text }: { text?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (text) return;
    const t = setInterval(() => setI((n) => (n + 1) % LINES.length), 1600);
    return () => clearInterval(t);
  }, [text]);
  return (
    <div className="splash in-app" role="status">
      <div className="splash-scene" dangerouslySetInnerHTML={{ __html: SPLASH_SCENE }} />
      <p className="splash-text" key={text ?? i}>
        {text ?? LINES[i]}…
      </p>
      <div dangerouslySetInnerHTML={{ __html: SPLASH_BOUNCE }} />
    </div>
  );
}
