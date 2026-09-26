import { ERROR_TEXT } from '@goli/shared';
import { useState } from 'react';
import { getLastRoom, getNickname, hasNickname, saveNickname, setLastRoom } from '../net/identity';
import { useRoom } from '../net/useRoom';
import { Splash } from '../ui/Splash';
import { Hero } from '../ui/Scene';
import { Join } from './Join';
import { Lobby } from './Lobby';
import { OnlineGame } from './OnlineGame';

/** /r/CODE: join gate, then the live session. */
export function RoomPage({ code, navigate }: { code: string; navigate: (p: string) => void }) {
  // Coming back to the same room (refresh / reopen) skips the join screen.
  const [nickname, setNickname] = useState<string | null>(() =>
    getLastRoom() === code && hasNickname() ? getNickname() : null,
  );
  const [joinError, setJoinError] = useState<string | null>(null);

  if (!nickname) {
    return (
      <Join
        code={code}
        error={joinError}
        onJoin={(name) => {
          saveNickname(name);
          setLastRoom(code);
          setJoinError(null);
          setNickname(name);
        }}
        onHome={() => navigate('/')}
      />
    );
  }
  return (
    <Session
      code={code}
      nickname={nickname}
      onBadName={() => {
        setJoinError(ERROR_TEXT['bad-nickname']);
        setNickname(null);
      }}
      onLeave={() => {
        setLastRoom(null);
        navigate('/');
      }}
    />
  );
}

function Session({
  code,
  nickname,
  onBadName,
  onLeave,
}: {
  code: string;
  nickname: string;
  onBadName: () => void;
  onLeave: () => void;
}) {
  const conn = useRoom(code, nickname);
  const { room, fatal } = conn;

  if (fatal === 'bad-nickname') {
    queueMicrotask(onBadName);
    return null;
  }
  if (fatal) {
    // Don't auto-rejoin a room we can't be in any more.
    if (fatal !== 'opened-elsewhere') setLastRoom(null);
    return (
      <div className="screen">
        <Hero size="sm" />
        <h2>{fatal === 'opened-elsewhere' ? 'Open in another tab' : 'Oops'}</h2>
        <p>{ERROR_TEXT[fatal]}</p>
        <div className="row">
          {fatal === 'opened-elsewhere' && (
            <button className="btn" onClick={conn.retry}>
              Play here instead
            </button>
          )}
          <button className="btn ghost" onClick={onLeave}>
            Home
          </button>
        </div>
      </div>
    );
  }
  if (!room) {
    return <Splash text={conn.connected ? `Joining ${code}` : `Connecting to ${code}`} />;
  }
  const leave = () => {
    conn.send('leave');
    onLeave();
  };
  if (room.phase === 'lobby') return <Lobby conn={conn} room={room} onLeave={leave} />;
  return <OnlineGame conn={conn} room={room} onLeave={leave} />;
}
