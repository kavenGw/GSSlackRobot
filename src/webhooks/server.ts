import express from 'express';
import type { App } from '@slack/bolt';
import { getConfig } from '../config/index.js';
import { handleGitLabEvent } from './gitlab.js';
import { log } from '../utils/logger.js';

export function startWebhookServer(slackApp: App) {
  const cfg = getConfig().gitlabNotify;
  if (!cfg) return;

  const server = express();
  server.use(express.json());

  server.post('/gitlab', (req, res) => {
    const token = req.headers['x-gitlab-token'];
    if (cfg.secret && token !== cfg.secret) {
      res.status(401).send('Unauthorized');
      return;
    }

    const eventType = req.headers['x-gitlab-event'] as string;
    handleGitLabEvent(eventType, req.body, slackApp.client);
    res.status(200).send('OK');
  });

  server.listen(cfg.port, () => {
    log.webhookServer(cfg.port);
  });
}
