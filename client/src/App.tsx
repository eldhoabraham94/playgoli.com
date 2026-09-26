import { isRoomCode, normaliseRoomCode } from '@goli/shared';
import { useCallback, useEffect, useState } from 'react';
import { Home } from './screens/Home';
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

function Routes() {
  const [path, navigate] = usePath();
  if (path === '/practice') return <Practice onExit={() => navigate('/')} />;
  const m = /^\/r\/([A-Za-z]{4})\/?$/.exec(path);
  if (m) {
    const code = normaliseRoomCode(m[1]);
    if (isRoomCode(code)) return <RoomPage key={code} code={code} navigate={navigate} />;
  }
  return <Home navigate={navigate} />;
}
