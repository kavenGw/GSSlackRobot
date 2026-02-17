import { App } from '@slack/bolt';
import { loadConfig, EnvValidationError } from './config/index.js';
import { registerCommands } from './commands/index.js';
import { startWebhookServer } from './webhooks/server.js';

// Validate and load configuration with proper error handling
let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  // Re-throw unexpected errors
  throw error;
}

const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
});

registerCommands(app);
startWebhookServer(app);

await app.start();
console.log('GSSlackRobot is running');
