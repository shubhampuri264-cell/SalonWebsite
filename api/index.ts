import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (local dev only; Vercel injects env vars natively)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createApp } from '../server/src/app';

const app = createApp();

export default app;
