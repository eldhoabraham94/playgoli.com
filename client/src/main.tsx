import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Fade out the inline loading scene (index.html) once the app is on screen and the fonts
 * are in. The first load of a session keeps it up long enough to see the shot land.
 */
function hideSplash() {
  const splash = document.getElementById('splash');
  // `?splash` keeps the loading scene up, to look at it.
  if (!splash || new URLSearchParams(location.search).has('splash')) return;
  let firstThisSession = true;
  try {
    firstThisSession = !sessionStorage.getItem('goli.splashSeen');
    sessionStorage.setItem('goli.splashSeen', '1');
  } catch {
    // Storage blocked: just show it once per page load.
  }
  const minMs = firstThisSession ? 1300 : 0;
  const fonts = Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  void fonts.then(() => {
    const wait = Math.max(0, minMs - performance.now());
    setTimeout(() => {
      splash.classList.add('out');
      setTimeout(() => splash.remove(), 450);
    }, wait);
  });
}
requestAnimationFrame(hideSplash);
