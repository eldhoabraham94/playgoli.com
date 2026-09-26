import { useState } from 'react';
import { requestMicPermission, voiceSupported } from '../net/voice';
import type { RoomConnection } from '../net/useRoom';

type Conn = Pick<RoomConnection, 'voiceOn' | 'setVoiceOn' | 'listen' | 'setListen'>;

function useMicToggle(conn: Conn) {
  const [hint, setHint] = useState<string | null>(null);
  const toggle = async () => {
    setHint(null);
    if (conn.voiceOn) return conn.setVoiceOn(false);
    if (!voiceSupported()) {
      setHint(window.isSecureContext ? "This browser can't record audio." : 'Voice works on www.playgoli.com (https).');
      return;
    }
    if (await requestMicPermission()) conn.setVoiceOn(true);
    else setHint('Microphone blocked. Allow it for this site in your browser settings.');
  };
  return { toggle, hint };
}

/** Lobby: the opt-in switch (asks for the mic once). */
export function VoiceSwitch({ conn }: { conn: Conn }) {
  const { toggle, hint } = useMicToggle(conn);
  return (
    <div className="voice-switch">
      <button className={`btn small ${conn.voiceOn ? '' : 'ghost'}`} onClick={toggle} aria-pressed={conn.voiceOn}>
        {conn.voiceOn ? '🎙 Voice on' : '🎙 Turn on voice'}
      </button>
      <p className="voice-note">{hint ?? (conn.voiceOn ? 'Your mic opens only on your turn.' : 'Talk while you shoot. Everyone hears the shooter.')}</p>
    </div>
  );
}

/** Game top bar: compact mic + speaker buttons. */
export function VoiceButtons({ conn }: { conn: Conn }) {
  const { toggle, hint } = useMicToggle(conn);
  return (
    <>
      <button
        className={`icon-btn${conn.voiceOn ? ' on' : ''}`}
        onClick={toggle}
        aria-pressed={conn.voiceOn}
        aria-label={conn.voiceOn ? 'Voice on: tap to turn off' : 'Turn on voice'}
        title={hint ?? undefined}
      >
        {conn.voiceOn ? '🎙' : <span className="struck">🎙</span>}
      </button>
      <button
        className={`icon-btn${conn.listen ? ' on' : ''}`}
        onClick={() => conn.setListen(!conn.listen)}
        aria-pressed={conn.listen}
        aria-label={conn.listen ? 'Sound on: tap to mute others' : 'Sound off: tap to hear others'}
      >
        {conn.listen ? '🔊' : '🔇'}
      </button>
      {hint && <div className="voice-hint">{hint}</div>}
    </>
  );
}
