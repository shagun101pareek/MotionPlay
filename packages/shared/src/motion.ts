import { clamp, clampUnit } from './constants.js';

export const DEFAULT_SENSITIVITY = 1;
export const MIN_SENSITIVITY = 0.5;
export const MAX_SENSITIVITY = 2;

/** Degrees of tilt that map to a full racket deflection at sensitivity 1. */
const BASE_DEFLECTION_DEGREES = 26;

export function relativeTilt(gamma: number, baseline: number): number {
  return gamma - baseline;
}

export function normalizeTilt(gamma: number, baseline: number, sensitivity: number): number {
  const span = BASE_DEFLECTION_DEGREES / clamp(sensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY);
  return clampUnit(relativeTilt(gamma, baseline) / span);
}

export function applyDeadzone(value: number, deadzone = 0.02): number {
  if (Math.abs(value) <= deadzone) return 0;
  const sign = Math.sign(value);
  const scaled = (Math.abs(value) - deadzone) / (1 - deadzone);
  return clampUnit(sign * scaled);
}

export function smoothValue(current: number, target: number, amount: number): number {
  return current + (target - current) * clamp(amount, 0, 1);
}

export function materiallyChanged(previous: number, next: number, epsilon = 0.012): boolean {
  return Math.abs(next - previous) >= epsilon;
}
