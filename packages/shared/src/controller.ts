export const GESTURE_TYPES = [
  'FOREHAND_SWING',
  'BACKHAND_SWING',
  'OVERHEAD_SMASH',
  'QUICK_FLICK',
  'LEFT_MOVEMENT',
  'RIGHT_MOVEMENT',
  'FORWARD_MOVEMENT',
  'BACKWARD_MOVEMENT',
  'JUMP',
  'SPECIAL_ACTION',
] as const;

export type GestureType = (typeof GESTURE_TYPES)[number];

export type GestureSource = 'motion' | 'touch';

export interface Axis3 {
  x: number;
  y: number;
  z: number;
}

export interface OrientationSample {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface MovementSample {
  horizontal: number;
  vertical: number;
}

export interface ControllerButtons {
  action: boolean;
  special: boolean;
}

export interface SensorFlags {
  orientation: boolean;
  rotation: boolean;
  acceleration: boolean;
}

/**
 * Processed controller snapshot.
 * Orientation and rotation are relative to calibration, in degrees and degrees/second.
 * Movement and racket angle are normalized to -1..1.
 * This is not an absolute position in the room.
 */
export interface ControllerState {
  orientation: OrientationSample;
  rotation: OrientationSample;
  acceleration: Axis3;
  movement: MovementSample;
  racketAngle: number;
  buttons: ControllerButtons;
  sensors: SensorFlags;
  sequence: number;
  timestamp: number;
}

export interface GestureSample {
  type: GestureType;
  intensity: number;
  confidence: number;
  source: GestureSource;
}

export interface ControllerInputPayload {
  roomId: string;
  state: ControllerState;
}

export interface ControllerGesturePayload {
  roomId: string;
  gesture: GestureSample;
  sequence: number;
  timestamp: number;
}

export interface ControllerButtonPayload {
  roomId: string;
  button: 'action' | 'special';
  pressed: boolean;
  sequence: number;
  timestamp: number;
}

export interface RelayedControllerInput extends ControllerInputPayload {
  serverTime: number;
}

export interface RelayedControllerGesture extends ControllerGesturePayload {
  serverTime: number;
}

export interface RelayedControllerButton extends ControllerButtonPayload {
  serverTime: number;
}

export function isGestureType(value: unknown): value is GestureType {
  return typeof value === 'string' && (GESTURE_TYPES as readonly string[]).includes(value);
}

export function isGestureSource(value: unknown): value is GestureSource {
  return value === 'motion' || value === 'touch';
}

export function emptyControllerState(timestamp = 0): ControllerState {
  return {
    orientation: { alpha: 0, beta: 0, gamma: 0 },
    rotation: { alpha: 0, beta: 0, gamma: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    movement: { horizontal: 0, vertical: 0 },
    racketAngle: 0,
    buttons: { action: false, special: false },
    sensors: { orientation: false, rotation: false, acceleration: false },
    sequence: 0,
    timestamp,
  };
}
