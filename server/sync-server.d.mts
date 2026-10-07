import type { Server } from 'node:http';

export function createSyncServer(opts?: { dataDir?: string; maxSpaceBytes?: number; log?: (msg: string) => void }): Server;
