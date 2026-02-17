import { App } from '@slack/bolt';
import { loadConfig } from './config/index.js';
import { registerCommands } from './commands/index.js';
import { startWebhookServer } from './webhooks/server.js';

const config = loadConfig();

const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
});

registerCommands(app);
startWebhookServer(app);

await app.start();
console.log('⚡ GSSlackRobot is running');
