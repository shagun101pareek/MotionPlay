import os from 'node:os';

export function getLanIPv4Addresses(): string[] {
  try {
    const nets = os.networkInterfaces();
    const addresses: string[] = [];
    for (const entries of Object.values(nets)) {
      for (const entry of entries ?? []) {
        const family = entry.family as string | number;
        const isV4 = family === 'IPv4' || family === 4;
        if (isV4 && !entry.internal) addresses.push(entry.address);
      }
    }
    return addresses;
  } catch (error) {
    console.error('Could not list network interfaces.', error);
    return [];
  }
}
