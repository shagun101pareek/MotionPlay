'use client';

import { useEffect, useRef, useState } from 'react';
import { ClientEvents, STATE_SEND_INTERVAL_MS, getGame } from '@motionplay/shared';
import type { GameId, GestureType } from '@motionplay/shared';
import { MotionController } from '@motionplay/controller-engine';
import type { CalibrationPhase, SensorCapabilities } from '@motionplay/controller-engine';
import { Button } from '@/components/shared/Button';
import { Logo } from '@/components/shared/Logo';
import { StatusPill } from '@/components/shared/StatusPill';
import { useSessionPresence } from '@/hooks/useSessionPresence';
import { getSocket } from '@/lib/socket';
import { getServerBaseUrl } from '@/lib/urls';

const SHOTS: Array<{ type: GestureType; label: string }> = [
  { type: 'FOREHAND_SWING', label: 'Forehand' },
  { type: 'BACKHAND_SWING', label: 'Backhand' },
  { type: 'OVERHEAD_SMASH', label: 'Smash' },
  { type: 'SPECIAL_ACTION', label: 'Defend' },
];

export function ControllerApp({ roomId }: { roomId: string }) {
  const presence = useSessionPresence(roomId, 'controller');
  const controllerRef = useRef<MotionController | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [phase, setPhase] = useState<CalibrationPhase>('uncalibrated');
  const [permission, setPermission] = useState('unknown');
  const [capabilities, setCapabilities] = useState<SensorCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gesture, setGesture] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState(1);
  const [latency, setLatency] = useState<number | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const joinedRef = useRef(false);
  const roomRef = useRef(presence.roomId);
  joinedRef.current = presence.joined;
  roomRef.current = presence.roomId;

  useEffect(() => {
    const controller = new MotionController();
    controllerRef.current = controller;
    controller.initialize();
    const media = window.matchMedia('(orientation: portrait)');
    const syncOrientation = () => controller.setPortrait(media.matches);
    syncOrientation();
    media.addEventListener('change', syncOrientation);
    let lastSend = 0;
    let lastUi = 0;
    const unsubscribe = controller.subscribe((event) => {
      if (event.type === 'calibration') setPhase(event.phase);
      if (event.type === 'permission') setPermission(event.status);
      if (event.type === 'capabilities') setCapabilities(event.capabilities);
      if (event.type === 'error') setError(event.message);
      if (event.type === 'gesture') {
        setGesture(labelFor(event.gesture.type));
        window.setTimeout(() => setGesture((current) => (current === labelFor(event.gesture.type) ? null : current)), 700);
        if (joinedRef.current && getSocket().connected) {
          getSocket().emit(ClientEvents.CONTROLLER_GESTURE, {
            roomId: roomRef.current,
            gesture: event.gesture,
            sequence: event.sequence,
            timestamp: event.timestamp,
          });
        }
      }
      if (event.type === 'button' && joinedRef.current && getSocket().connected) {
        getSocket().emit(ClientEvents.CONTROLLER_BUTTON, {
          roomId: roomRef.current,
          button: event.button,
          pressed: event.pressed,
          sequence: event.sequence,
          timestamp: event.timestamp,
        });
      }
      if (event.type === 'state') {
        const now = performance.now();
        if (now - lastUi > 80) {
          lastUi = now;
          setTilt({ x: event.state.movement.horizontal, y: event.state.movement.vertical });
        }
        if (!joinedRef.current || now - lastSend < STATE_SEND_INTERVAL_MS) return;
        lastSend = now;
        const socket = getSocket();
        if (!socket.connected) return;
        const payload = { roomId: roomRef.current, state: { ...event.state, timestamp: Date.now() } };
        socket.timeout(1000).emit(ClientEvents.CONTROLLER_INPUT, payload, (err: unknown, response?: { serverTime?: number }) => {
          if (err || !response?.serverTime) return;
          setLatency(Math.max(0, Date.now() - payload.state.timestamp));
        });
      }
    });
    return () => {
      unsubscribe();
      media.removeEventListener('change', syncOrientation);
      controller.stop();
    };
  }, []);

  useEffect(() => {
    if (!presence.valid) return;
    let cancelled = false;
    void fetch(`${getServerBaseUrl()}/rooms/${presence.roomId}`)
      .then((response) => {
        if (cancelled || response.ok) return;
        if (response.status === 404) setLookupError('This QR code has expired, or the laptop closed the room.');
      })
      .catch(() => {
        if (!cancelled) setLookupError('This phone cannot reach the game server. Use the same Wi-Fi.');
      });
    return () => {
      cancelled = true;
    };
  }, [presence.roomId, presence.valid]);

  const enable = async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    setError(null);
    const status = await controller.requestPermissions();
    if (status === 'granted') {
      controller.start();
      setReady(true);
      controller.beginCalibration();
    } else {
      setReady(true);
      controller.completeWithDefaults();
    }
  };

  const captureNeutral = () => controllerRef.current?.captureNeutral();
  const swing = () => controllerRef.current?.beginSwingCapture();
  const finishSwing = () => controllerRef.current?.finishSwingCapture();
  const skipSwing = () => {
    controllerRef.current?.completeWithDefaults();
  };
  const recenter = () => controllerRef.current?.calibrate();

  if (!presence.valid) {
    return (
      <main className="flex h-full flex-col justify-center px-6">
        <Logo />
        <h1 className="mt-8 font-display text-3xl">This controller link is not valid.</h1>
      </main>
    );
  }

  const gameId = (presence.gameId || 'table-tennis') as GameId;
  const game = getGame(gameId);
  const blocking = ['ROOM_NOT_FOUND', 'ROOM_EXPIRED', 'CONTROLLER_TAKEN', 'UNAUTHORIZED'].includes(presence.errorCode ?? '');
  const rotation = sensorWord(capabilities?.rotationRate);
  const orientation = capabilities?.orientation ? 'Live' : 'Unavailable';

  return (
    <main className="flex h-full flex-col bg-ink px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] landscape:grid landscape:grid-cols-[1fr_1fr] landscape:gap-4">
      <section className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between gap-3">
          <Logo />
          <span className="font-mono text-xs tracking-[0.16em] text-mist">{presence.roomId}</span>
        </header>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill live={presence.joined && presence.connection === 'online'}>
            {presence.joined ? 'Linked' : presence.connection === 'offline' ? 'Reconnecting' : 'Joining'}
          </StatusPill>
          <span className="text-sm text-mist">{game.title}</span>
          <span className="font-mono text-xs text-mist">{latency === null ? 'Latency —' : `${latency} ms`}</span>
        </div>
        {(presence.error || lookupError || error) && !blocking && (
          <p className="mt-3 rounded-2xl bg-navy px-4 py-3 text-sm leading-6 text-mist">{presence.error || lookupError || error}</p>
        )}
        {blocking ? (
          <div className="flex flex-1 flex-col justify-center">
            <h1 className="font-display text-3xl">Can&apos;t join this room.</h1>
            <p className="mt-3 text-mist">{presence.error}</p>
          </div>
        ) : (
          <>
            <div className="relative mt-4 flex flex-1 items-center justify-center overflow-hidden rounded-[28px] bg-navy">
              <div
                className="h-28 w-16 rounded-2xl border border-white/20 bg-ink shadow-glow"
                style={{ transform: `rotate(${tilt.x * 28}deg) rotateX(${tilt.y * -18}deg)` }}
              />
              <div className="absolute bottom-4 left-4 right-4 flex justify-between text-[11px] uppercase tracking-[0.16em] text-mist">
                <span>Orientation {orientation}</span>
                <span>Rotation {rotation}</span>
              </div>
              {gesture && (
                <p className="absolute inset-x-0 top-6 text-center font-display text-4xl text-signal">{gesture}</p>
              )}
            </div>
            {phase !== 'ready' && (
              <div className="mt-4 rounded-[24px] bg-panel px-4 py-4">
                {permission !== 'granted' && phase === 'uncalibrated' && (
                  <>
                    <h2 className="font-display text-2xl">Enable the controller</h2>
                    <p className="mt-2 text-sm leading-6 text-mist">Motion access is requested by the button below. If this browser has no sensors, the touch buttons still play.</p>
                    <Button className="mt-4 w-full" onClick={() => void enable()}>
                      Enable motion controls
                    </Button>
                  </>
                )}
                {phase === 'neutral' && (
                  <>
                    <h2 className="font-display text-2xl">Hold a comfortable grip</h2>
                    <p className="mt-2 text-sm leading-6 text-mist">Keep the phone still in the position you want as center. This sets the neutral pose. It does not track your location in the room.</p>
                    <Button className="mt-4 w-full" onClick={captureNeutral}>
                      Capture neutral
                    </Button>
                    <button type="button" className="mt-3 text-sm text-mist" onClick={skipSwing}>
                      Continue without a new center
                    </button>
                  </>
                )}
                {phase === 'swing' && (
                  <>
                    <h2 className="font-display text-2xl">Make one smooth swing</h2>
                    <p className="mt-2 text-sm leading-6 text-mist">Start the sample, swing once, then finish. A weak sample keeps the default thresholds.</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button onClick={swing}>Start sample</Button>
                      <Button variant="ghost" onClick={finishSwing}>Finish swing</Button>
                    </div>
                    <button type="button" className="mt-3 text-sm text-mist" onClick={skipSwing}>
                      Continue with default thresholds
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {!blocking && (
        <section className="mt-4 flex flex-col landscape:mt-0">
          {ready && phase === 'ready' && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="block flex-1 text-sm text-mist">
                Sensitivity
                <input
                  className="mt-2 w-full"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={sensitivity}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setSensitivity(value);
                    controllerRef.current?.setSensitivity(value);
                  }}
                />
              </label>
              <Button variant="ghost" onClick={recenter}>
                Recenter
              </Button>
            </div>
          )}
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Pad
              onChange={(x, y) => controllerRef.current?.setPointerMovement(x, y)}
            />
            <div className="grid grid-cols-2 gap-2">
              {SHOTS.map((shot) => (
                <button
                  key={shot.type}
                  type="button"
                  className="rounded-2xl bg-navy px-3 py-4 text-sm font-semibold"
                  onPointerDown={() => {
                    if (shot.type === 'SPECIAL_ACTION') controllerRef.current?.setButton('special', true);
                    controllerRef.current?.triggerGesture(shot.type, 0.75, 1);
                  }}
                  onPointerUp={() => {
                    if (shot.type === 'SPECIAL_ACTION') controllerRef.current?.setButton('special', false);
                  }}
                >
                  {shot.label}
                </button>
              ))}
              <button
                type="button"
                className="col-span-2 rounded-2xl bg-accent px-3 py-4 text-sm font-semibold text-white"
                onPointerDown={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  controllerRef.current?.pointerDown(event.clientX - rect.left, event.clientY - rect.top);
                }}
                onPointerUp={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  controllerRef.current?.pointerUp(event.clientX - rect.left, event.clientY - rect.top);
                }}
              >
                Tap to serve · swipe to move
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-mist">
            {gameId === 'table-tennis'
              ? 'Tilt to place the racket and rotate your wrist for angle. A real swing plays the shot. Ordinary tilting does not.'
              : 'Swing detection uses rotation rate when this phone provides it. A desktop browser will not produce swing events. Confirm a swing on the phone before relying on it.'}
          </p>
        </section>
      )}
    </main>
  );
}

function Pad({ onChange }: { onChange: (x: number | null, y: number | null) => void }) {
  const hold = (x: number, y: number) => onChange(x, y);
  return (
    <div className="grid h-36 w-28 grid-cols-3 grid-rows-3 gap-1">
      <span />
      <PadKey label="Up" onDown={() => hold(0, 1)} onUp={() => onChange(null, null)} />
      <span />
      <PadKey label="Left" onDown={() => hold(-1, 0)} onUp={() => onChange(null, null)} />
      <span className="rounded-full bg-white/5" />
      <PadKey label="Right" onDown={() => hold(1, 0)} onUp={() => onChange(null, null)} />
      <span />
      <PadKey label="Down" onDown={() => hold(0, -1)} onUp={() => onChange(null, null)} />
      <span />
    </div>
  );
}

function PadKey({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <button type="button" aria-label={label} className="rounded-xl bg-navy text-xs" onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp}>
      {label[0]}
    </button>
  );
}

function sensorWord(value: boolean | null | undefined): string {
  if (value === true) return 'Live';
  if (value === false) return 'Unavailable';
  return 'Checking';
}

function labelFor(type: GestureType): string {
  return type.replaceAll('_', ' ');
}
