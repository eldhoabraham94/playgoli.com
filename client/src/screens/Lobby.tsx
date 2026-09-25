import { ERROR_TEXT, MAX_PLAYERS, MAX_SPECTATORS, type PublicMember, type RoomSnapshot } from '@goli/shared';
import { useEffect, useState } from 'react';
import { roomLink } from '../net/api';
import type { RoomConnection } from '../net/useRoom';
import { InviteButton, QrCode } from '../ui/Invite';

export function Lobby({ conn, room, onLeave }: { conn: RoomConnection; room: RoomSnapshot; onLeave: () => void }) {
  const link = roomLink(room.code);
  const isHost = room.hostId === room.you;
  const ready = room.players.filter((p) => p.connected).length;
  const { notice, clearNotice } = conn;
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, 3000);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const row = (p: PublicMember) => (
    <li key={p.id} className={p.connected ? '' : 'away'}>
      <span className="dot" style={{ background: p.color }} />
      <span className="pname">{p.name}</span>
      {p.id === room.you && <span className="tag">you</span>}
      {p.id === room.hostId && <span className="tag host">host</span>}
      {!p.connected && <span className="tag">away</span>}
      {isHost && p.id !== room.you && (
        <button
          className={`kick${armed === p.id ? ' armed' : ''}`}
          aria-label={`Kick ${p.name}`}
          onClick={() => {
            if (armed === p.id) {
              conn.send('kick', { playerId: p.id });
              setArmed(null);
            } else setArmed(p.id);
          }}
        >
          {armed === p.id ? 'Kick?' : '✕'}
        </button>
      )}
    </li>
  );

  return (
    <div className="screen lobby">
      <div className="lobby-head">
        <p className="eyebrow">Game code</p>
        <h2 className="room-code">{room.code}</h2>
        {!conn.connected && <p className="error">Reconnecting…</p>}
      </div>

      <div className="lobby-body">
        <p className="count">
          {room.players.length}/{MAX_PLAYERS} players
        </p>
        <ul className="players">
          {room.players.map(row)}
          {room.players.length < 2 && <li className="empty">Waiting for friends…</li>}
        </ul>
        {room.spectators.length > 0 && (
          <>
            <p className="count">
              Watching ({room.spectators.length}/{MAX_SPECTATORS}), seated when a place frees up
            </p>
            <ul className="players">{room.spectators.map(row)}</ul>
          </>
        )}
        <div className="invite">
          <QrCode link={link} />
          <div className="invite-side">
            <p className="link">{link.replace(/^https?:\/\//, '')}</p>
            <InviteButton link={link} />
          </div>
        </div>
      </div>

      <div className="lobby-foot">
        {notice && <p className="error">{ERROR_TEXT[notice]}</p>}
        {isHost ? (
          <button className="btn big" disabled={ready < 2} onClick={() => conn.send('start')}>
            {ready < 2 ? 'Need 2+ players' : 'Start'}
          </button>
        ) : (
          <p>Waiting for the host to start…</p>
        )}
        <button className="btn ghost small" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}
