import net from 'node:net';
import { log } from './logger.js';

const DEFAULT_PORT = 19280;

export function ensureSingleInstance(port = Number(process.env.SINGLETON_PORT) || DEFAULT_PORT): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log.error(`检测到已有实例在运行 (port ${port})，退出`);
        process.exit(1);
      }
      reject(err);
    });
  });
}
