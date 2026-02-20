import express from 'express';
import { App } from '@slack/bolt';
import type { PendingRequest } from './types.js';
import healthRouter from './routes/health.js';
import { createRequestRouter } from './routes/request.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { registerInteractions } from './slack/interact.js';

const pendingRequests = new Map<string, PendingRequest>();

// Slack Bolt app in Socket Mode (outbound WebSocket, no public endpoint needed)
const boltApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

registerInteractions(boltApp, pendingRequests);

// Standalone Express server for the REST API
const expressApp: ReturnType<typeof express> = express();

// Health check (no auth required)
expressApp.use(healthRouter);

// Rate limiting + auth + JSON parsing for API routes
expressApp.use('/request', rateLimitMiddleware);
expressApp.use('/request', authMiddleware);
expressApp.use(express.json());
expressApp.use(createRequestRouter(boltApp.client, pendingRequests));

const port = parseInt(process.env.PORT ?? '3847', 10);

// Start both: Bolt Socket Mode + Express HTTP server
await boltApp.start();
console.log('⚡ Slack Socket Mode connected');

expressApp.listen(port, () => {
  console.log(`⚡ REST API listening on port ${port}`);
});

export { boltApp, expressApp, pendingRequests };
