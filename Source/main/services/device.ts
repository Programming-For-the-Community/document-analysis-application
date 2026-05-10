import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { app } from 'electron';

import { Logger } from '../../utils/logger';

let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;

  const filePath = path.join(app.getPath('userData'), 'device.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    cachedDeviceId = (JSON.parse(raw) as { deviceId: string }).deviceId;
    Logger.debug(`Device ID loaded: ${cachedDeviceId}`);
  } catch {
    cachedDeviceId = crypto.randomUUID();
    fs.writeFileSync(filePath, JSON.stringify({ deviceId: cachedDeviceId }), 'utf-8');
    Logger.info(`New device ID generated and persisted: ${cachedDeviceId}`);
  }

  return cachedDeviceId;
}
