import { notFound } from 'next/navigation';
import { isGameId } from '@motionplay/shared';
import { GameSetup } from '@/components/console/GameSetup';

export default async function PlayPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!isGameId(gameId)) notFound();
  return <GameSetup gameId={gameId} />;
}
