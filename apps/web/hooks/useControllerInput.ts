'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  INPUT_HEARTBEAT_MS,
  INPUT_MIN_INTERVAL_MS,
  applyDeadzone,
  materiallyChanged,
  normalizeTilt,
  smoothValue,
} from '@motionplay/shared';

export type MotionState = 'idle' | 'live' | 'denied' | 'unsupported';

interface Sample {
  position: number;
  tilt: number;
}

interface OrientationPermission {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

export function useControllerInput(onSample: (sample: Sample) => void) {
  const [motionState, setMotionState] = useState<MotionState>('idle');
  const [motionError, setMotionError] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState(1);
  const [secure, setSecure] = useState(true);
  const meterRef = useRef<HTMLDivElement>(null);
  const onSampleRef = useRef(onSample);
  const sensitivityRef = useRef(sensitivity);
  const listeningRef = useRef(false);
  const baselineRef = useRef<number | null>(null);
  const gammaRef = useRef<number | null>(null);
  const smoothedRef = useRef(0);
  const touchRef = useRef<number | null>(null);
  const heldRef = useRef<number | null>(null);
  const lastSentRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);

  onSampleRef.current = onSample;
  sensitivityRef.current = sensitivity;

  useEffect(() => {
    setSecure(window.isSecureContext);
  }, []);

  const enableMotion = useCallback(async () => {
    setMotionError(null);
    if (!window.isSecureContext) {
      setMotionError('Motion sensors need HTTPS. Drag the pad below to play on this connection.');
    }
    if (typeof window.DeviceOrientationEvent === 'undefined') {
      setMotionState('unsupported');
      setMotionError('This browser has no motion sensors. Drag the pad below instead.');
      return;
    }

    const orientation = window.DeviceOrientationEvent as unknown as OrientationPermission;
    try {
      if (typeof orientation.requestPermission === 'function') {
        const result = await orientation.requestPermission();
        if (result !== 'granted') {
          setMotionState('denied');
          setMotionError('Motion access was denied. Allow Motion & Orientation for this browser, or drag the pad.');
          return;
        }
      }
      baselineRef.current = null;
      listeningRef.current = true;
      setMotionState('live');
    } catch {
      setMotionState('denied');
      setMotionError('The browser blocked the motion request. Tap the button again, or drag the pad.');
    }
  }, []);

  const calibrate = useCallback(() => {
    if (gammaRef.current === null) {
      setMotionError('Turn motion on and tilt the phone once, then set the center.');
      return;
    }
    baselineRef.current = gammaRef.current;
    smoothedRef.current = 0;
    setMotionError(null);
  }, []);

  const setTouchPosition = useCallback((position: number | null) => {
    touchRef.current = position;
    if (position !== null) heldRef.current = position;
  }, []);

  useEffect(() => {
    if (motionState !== 'live') return;
    listeningRef.current = true;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (typeof event.gamma !== 'number' || Number.isNaN(event.gamma)) return;
      gammaRef.current = event.gamma;
      if (baselineRef.current === null) baselineRef.current = event.gamma;
    };
    window.addEventListener('deviceorientation', onOrientation);
    const timer = window.setTimeout(() => {
      if (gammaRef.current === null) {
        setMotionError('No motion data arrived. Check the permission, or drag the pad.');
      }
    }, 2_500);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.clearTimeout(timer);
      listeningRef.current = false;
    };
  }, [motionState]);

  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const touching = touchRef.current;
      let tilt = smoothedRef.current;
      let active = false;

      if (touching !== null) {
        tilt = touching;
        smoothedRef.current = touching;
        heldRef.current = touching;
        active = true;
      } else if (listeningRef.current && baselineRef.current !== null && gammaRef.current !== null) {
        const target = applyDeadzone(
          normalizeTilt(gammaRef.current, baselineRef.current, sensitivityRef.current),
        );
        smoothedRef.current = smoothValue(smoothedRef.current, target, 0.45);
        tilt = smoothedRef.current;
        heldRef.current = tilt;
        active = true;
      } else if (heldRef.current !== null) {
        tilt = heldRef.current;
        active = true;
      }

      meterRef.current?.style.setProperty('--tilt', tilt.toFixed(3));
      if (!active) return;

      const lastSent = lastSentRef.current;
      const changed = lastSent === null || materiallyChanged(lastSent, tilt);
      const heartbeat = now - lastSentAtRef.current >= INPUT_HEARTBEAT_MS;
      if (!changed && !heartbeat) return;
      if (now - lastSentAtRef.current < INPUT_MIN_INTERVAL_MS) return;

      lastSentRef.current = tilt;
      lastSentAtRef.current = now;
      onSampleRef.current({ position: tilt, tilt });
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return {
    motionState,
    motionError,
    sensitivity,
    setSensitivity,
    secure,
    enableMotion,
    calibrate,
    setTouchPosition,
    meterRef,
  };
}
