import type { Metadata } from 'next';
import { ControllerApp } from '@/components/controller/ControllerApp';

export const metadata: Metadata = {
  title: 'Controller',
};

export default async function ControllerPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <ControllerApp roomId={roomId} />;
}
