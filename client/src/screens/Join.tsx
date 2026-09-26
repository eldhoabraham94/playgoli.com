import { NICK_MAX, randomName, sanitizeNickname, type RoomInfo } from '@goli/shared';
import { useEffect, useState } from 'react';
import { getRoomInfo } from '../net/api';
import { getNickname } from '../net/identity';
import { Hero } from '../ui/Scene';

export function Join({
  code,
  error,
  onJoin,
  onHome,
}: {
  code: string;
  error: string | null;
  onJoin: (name: string) => void;
  onHome: () => void;
}) {
  const [name, setName] = useState(getNickname);
  const [info, setInfo] = useState<RoomInfo | null | undefined>(undefined);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getRoomInfo(code).then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, [code]);

  if (info === null) {
    return (
      <div className="screen">
        <Hero size="sm" />
        <h2>Game {code} not found</h2>
        <p>It may have ended. Start a new one!</p>
        <button className="btn" onClick={onHome}>
          Home
        </button>
      </div>
    );
  }

  const submit = () => {
    const clean = sanitizeNickname(name);
    if (!clean) return setLocalError('Please pick a different name.');
    onJoin(clean);
  };

  const status =
    info === undefined
      ? ' '
      : info.phase !== 'lobby'
        ? "A game is on. You'll watch and get a seat next round."
        : info.players >= info.maxPlayers
          ? "It's full. You'll watch and get a seat if one frees up."
          : `${info.players} player${info.players === 1 ? '' : 's'} waiting`;

  return (
    <div className="screen">
      <Hero size="sm" />
      <p className="eyebrow">Joining game</p>
      <h2 className="room-code">{code}</h2>
      <p>{status}</p>
      <form
        className="join-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="nick">Your name</label>
        <div className="name-row">
          <input
            id="nick"
            value={name}
            maxLength={NICK_MAX}
            onChange={(e) => {
              setName(e.target.value);
              setLocalError(null);
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="btn ghost dice" aria-label="Random name" onClick={() => setName(randomName())}>
            🎲
          </button>
        </div>
        {(localError ?? error) && <p className="error">{localError ?? error}</p>}
        <button className="btn big" type="submit">
          Join
        </button>
      </form>
    </div>
  );
}
