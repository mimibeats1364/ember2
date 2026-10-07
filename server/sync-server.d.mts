import type { Server } from 'node:http';

export function createSyncServer(opts?: { dataDir?: string; staticDir?: string | null; maxSpaceBytes?: number; log?: (msg: string) => void }): Server;
