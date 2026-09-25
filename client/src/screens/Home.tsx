import { isRoomCode, normaliseRoomCode } from '@goli/shared';
import { useState } from 'react';
import { createRoom } from '../net/api';

export function Home({ navigate }: { navigate: (path: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await createRoom();
    setBusy(false);
    if ('code' in r) navigate(`/r/${r.code}`);
    else setError(r.error);
  };

  const joinCode = normaliseRoomCode(code);

  return (
    <div className="screen home">
      <div className="logo">
        <span className="logo-goli" />
        <h1>Goli</h1>
      </div>
      <p className="tagline">The marbles game from the school ground. One ring, up to 10 friends.</p>
      <button className="btn big" onClick={create} disabled={busy}>
        {busy ? 'Creating…' : 'Create game'}
      </button>
      {error && <p className="error">{error}</p>}
      <form
        className="code-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (isRoomCode(joinCode)) navigate(`/r/${joinCode}`);
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="CODE"
          aria-label="Room code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={4}
        />
        <button className="btn secondary" disabled={!isRoomCode(joinCode)}>
          Join
        </button>
      </form>
      <button className="btn ghost" onClick={() => navigate('/practice')}>
        Practice on this phone
      </button>
    </div>
  );
}
