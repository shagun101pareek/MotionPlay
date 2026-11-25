import type { Metadata } from 'next';
import { GameShell } from '@/components/game/GameShell';

export const metadata: Metadata = {
  title: 'Match',
};

export default async function GamePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <GameShell roomId={roomId} />;
}
