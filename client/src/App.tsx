import { HOME_META, HOW_TO_META, PRACTICE_META, isRoomCode, normaliseRoomCode } from '@goli/shared';
import { useCallback, useEffect, useState } from 'react';
import { Home } from './screens/Home';
import { HowToPlay } from './screens/HowToPlay';
import { Practice } from './screens/Practice';
import { RoomPage } from './screens/RoomPage';
import { Ambient } from './ui/Scene';

function usePath(): [string, (p: string) => void] {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((p: string) => {
    history.pushState(null, '', p);
    setPath(p);
  }, []);
  return [path, navigate];
}

export function App() {
  return (
    <>
      <Ambient />
      <Routes />
    </>
  );
}

/** Keep the tab title in step with the page (the server sets it on first load). */
function useTitle(path: string) {
  useEffect(() => {
    const room = /^\/r\/([A-Za-z]{4})/.exec(path)?.[1];
    document.title =
      path === '/how-to-play'
        ? HOW_TO_META.title
        : path === '/practice'
          ? PRACTICE_META.title
          : room
            ? `Game ${room.toUpperCase()} | Goli`
            : HOME_META.title;
  }, [path]);
}

function Routes() {
  const [path, navigate] = usePath();
  useTitle(path);
  if (path === '/how-to-play') return <HowToPlay navigate={navigate} />;
  if (path === '/practice') return <Practice onExit={() => navigate('/')} />;
  const m = /^\/r\/([A-Za-z]{4})\/?$/.exec(path);
  if (m) {
    const code = normaliseRoomCode(m[1]);
    if (isRoomCode(code)) return <RoomPage key={code} code={code} navigate={navigate} />;
  }
  return <Home navigate={navigate} />;
}
