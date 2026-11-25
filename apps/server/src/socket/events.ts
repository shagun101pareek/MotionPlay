export { ClientEvents, ServerEvents } from '@motionplay/shared';

export function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}
