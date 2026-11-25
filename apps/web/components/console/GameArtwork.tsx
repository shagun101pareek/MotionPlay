import type { GameId } from '@motionplay/shared';

export function GameArtwork({ gameId, className = '' }: { gameId: GameId; className?: string }) {
  if (gameId === 'table-tennis') return <TableArt className={className} />;
  if (gameId === 'tennis') return <TennisArt className={className} />;
  return <BadmintonArt className={className} />;
}

function BadmintonArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 400" className={className} role="img" aria-label="Badminton court">
      <rect width="640" height="400" fill="#10182a" />
      <polygon points="90,330 550,330 470,120 170,120" fill="#1f6b45" />
      <polygon points="90,330 550,330 470,120 170,120" fill="none" stroke="#f4f1ea" strokeWidth="3" />
      <line x1="188" y1="210" x2="452" y2="210" stroke="#f4f1ea" strokeWidth="2" />
      <line x1="150" y1="255" x2="490" y2="255" stroke="#f4f1ea" strokeWidth="2" opacity="0.7" />
      <line x1="214" y1="168" x2="426" y2="168" stroke="#f4f1ea" strokeWidth="2" opacity="0.7" />
      <line x1="320" y1="168" x2="320" y2="255" stroke="#d7deea" strokeWidth="6" />
      <circle cx="250" cy="286" r="16" fill="#8d7bff" />
      <rect x="242" y="300" width="16" height="28" rx="6" fill="#8d7bff" />
      <path d="M266 292c18 8 28 4 36-8" fill="none" stroke="#f4f1ea" strokeWidth="3" strokeLinecap="round" />
      <circle cx="308" cy="278" r="8" fill="none" stroke="#f4f1ea" strokeWidth="2" />
      <path d="M360 210l18-28 8 4-14 30z" fill="#f4f1ea" />
      <circle cx="386" cy="178" r="5" fill="#d7c4a3" />
    </svg>
  );
}

function TableArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 400" className={className} role="img" aria-label="First-person table tennis">
      <rect width="640" height="400" fill="#2f6fad" />
      <rect x="0" y="250" width="640" height="150" fill="#1f3f66" />
      <polygon points="60,340 580,340 470,150 170,150" fill="#1a78c7" />
      <polygon points="60,340 580,340 470,150 170,150" fill="none" stroke="#f7fbff" strokeWidth="3" />
      <line x1="320" y1="150" x2="320" y2="340" stroke="#f7fbff" strokeWidth="2" />
      <line x1="140" y1="230" x2="500" y2="230" stroke="#e8eef7" strokeWidth="4" />
      <circle cx="250" cy="112" r="16" fill="#d2a07a" />
      <rect x="230" y="126" width="40" height="44" rx="8" fill="#8d939b" />
      <path d="M270 150c24 8 36 2 42-12" fill="none" stroke="#9d1c28" strokeWidth="5" strokeLinecap="round" />
      <circle cx="250" cy="268" r="8" fill="#f27a2c" />
      <path d="M420 310c34 10 58-4 66-34" fill="none" stroke="#d8a57c" strokeWidth="10" strokeLinecap="round" />
      <ellipse cx="500" cy="272" rx="24" ry="28" fill="#14171c" transform="rotate(-20 500 272)" />
    </svg>
  );
}

function TennisArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 400" className={className} role="img" aria-label="Tennis court">
      <rect width="640" height="400" fill="#10182a" />
      <polygon points="70,340 570,340 490,90 150,90" fill="#2f7a45" />
      <polygon points="70,340 570,340 490,90 150,90" fill="none" stroke="#f4f1ea" strokeWidth="3" />
      <line x1="176" y1="190" x2="464" y2="190" stroke="#f4f1ea" strokeWidth="3" />
      <line x1="128" y1="250" x2="512" y2="250" stroke="#f4f1ea" strokeWidth="2" />
      <line x1="196" y1="150" x2="444" y2="150" stroke="#f4f1ea" strokeWidth="2" />
      <line x1="320" y1="150" x2="320" y2="250" stroke="#d5deea" strokeWidth="5" />
      <circle cx="230" cy="292" r="15" fill="#3ec6ff" />
      <path d="M248 286c22 10 34 2 42-12" fill="none" stroke="#f4f1ea" strokeWidth="3" strokeLinecap="round" />
      <circle cx="300" cy="230" r="7" fill="#d6f25c" stroke="#f4f1ea" strokeWidth="2" />
    </svg>
  );
}
