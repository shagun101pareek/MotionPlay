export interface SensorCapabilities {
  secureContext: boolean;
  permissionRequired: boolean;
  orientation: boolean;
  motion: boolean;
  /** Null until a sample confirms or a timeout rules the channel out. */
  rotationRate: boolean | null;
  linearAcceleration: boolean | null;
  accelerationIncludingGravity: boolean | null;
}

export function unavailableCapabilities(secureContext = false): SensorCapabilities {
  return {
    secureContext,
    permissionRequired: false,
    orientation: false,
    motion: false,
    rotationRate: false,
    linearAcceleration: false,
    accelerationIncludingGravity: false,
  };
}
