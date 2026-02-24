import 'dotenv/config';
import { env } from './config/env';
import { createApp } from './app';
import { startReminderService } from './services/reminderService';

const app = createApp();
const port = Number(env.PORT);

app.listen(port, () => {
  console.log(`✓ Luxe Threads API running on http://localhost:${port}`);
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log(`  CORS origin: ${env.CLIENT_URL}`);

  startReminderService();
});
