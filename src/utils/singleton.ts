import net from 'node:net';
import readline from 'node:readline';
import { log } from './logger.js';

const DEFAULT_PORT = 19280;

function waitForKeyPress(): Promise<void> {
  return new Promise(resolve => {
    console.log('按任意键退出...');
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.exit(1);
      });
    } else {
      const rl = readline.createInterface({ input: process.stdin });
      rl.once('line', () => process.exit(1));
    }
  });
}

export function ensureSingleInstance(port = Number(process.env.SINGLETON_PORT) || DEFAULT_PORT): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log.error(`检测到已有实例在运行 (port ${port})，退出`);
        waitForKeyPress();
        return;
      }
      reject(err);
    });
  });
}
