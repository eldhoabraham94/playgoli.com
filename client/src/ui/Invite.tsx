import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { shareOrCopy } from './share';

const INVITE_TEXT = 'Come play Goli with me!';

export function InviteButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const invite = async () => {
    if ((await shareOrCopy({ text: INVITE_TEXT, url: link })) === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button className="btn" onClick={invite}>
      {copied ? 'Link copied!' : 'Invite'}
    </button>
  );
}

export function QrCode({ link }: { link: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#2b1606', light: '#f7e8d3' } })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [link]);
  return src ? <img className="qr" src={src} alt={`QR code for ${link}`} /> : <div className="qr" />;
}
