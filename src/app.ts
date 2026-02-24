import { App } from '@slack/bolt';
import { loadConfig, EnvValidationError } from './config/index.js';
import { registerCommands } from './commands/index.js';
import { log } from './utils/logger.js';
import { startWebhookServer } from './webhooks/server.js';
import { scheduleDailyReport } from './scheduler/daily-report.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
});

registerCommands(app);

await app.start();
startWebhookServer(app);
scheduleDailyReport(app);
log.startup();
