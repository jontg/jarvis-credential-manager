import express from 'express';
import { App, ExpressReceiver } from '@slack/bolt';
import type { PendingRequest } from './types.js';
import healthRouter from './routes/health.js';
import { createRequestRouter } from './routes/request.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { registerInteractions } from './slack/interact.js';

const pendingRequests = new Map<string, PendingRequest>();

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET ?? '',
});

const boltApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

registerInteractions(boltApp, pendingRequests);

// Mount additional routes on the receiver's Express app
const expressApp = receiver.app;

// Health check (no auth required)
expressApp.use(healthRouter);

// Rate limiting + auth + JSON parsing for API routes
expressApp.use('/request', rateLimitMiddleware);
expressApp.use('/request', authMiddleware);
expressApp.use(express.json());
expressApp.use(createRequestRouter(boltApp.client, pendingRequests));

const port = parseInt(process.env.PORT ?? '3847', 10);

await boltApp.start(port);
console.log(`⚡ Credential manager listening on port ${port}`);

export { boltApp, expressApp, pendingRequests };
