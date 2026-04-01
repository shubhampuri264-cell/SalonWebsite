import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { createApp } from '../server/src/app';

const app = createApp();

export default app;
