import type { CalibrationPhase, CalibrationProfile } from '../calibration/calibrationManager.js';
import type { SensorCapabilities } from '../sensors/sensorCapabilities.js';
import type { ControllerState, GestureSample } from './controllerState.js';

export type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'unsupported' | 'insecure';

export type ControllerEngineEvent =
  | { type: 'state'; state: ControllerState }
  | { type: 'gesture'; gesture: GestureSample; sequence: number; timestamp: number }
  | { type: 'button'; button: 'action' | 'special'; pressed: boolean; sequence: number; timestamp: number }
  | { type: 'capabilities'; capabilities: SensorCapabilities }
  | { type: 'calibration'; phase: CalibrationPhase; profile: CalibrationProfile }
  | { type: 'permission'; status: PermissionStatus }
  | { type: 'error'; message: string };

export interface Scheduler {
  delay(ms: number, fn: () => void): void;
  clear(): void;
}
