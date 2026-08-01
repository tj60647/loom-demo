import { request, FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
  
  // Ensure the auth directory exists
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  
  // Create a raw request context
  const requestContext = await request.newContext();
  
  // Hit our backdoor authentication route
  const response = await requestContext.get(`${baseURL}/api/auth/test-login`);
  
  if (!response.ok()) {
    throw new Error(`Failed to authenticate via test-login: ${response.status()} ${response.statusText()}`);
  }
  
  // Save the state (which includes the session cookie) to the storage path
  const statePath = 'playwright/.auth/user.json';
  await requestContext.storageState({ path: statePath });
  await requestContext.dispose();

  // Mark the first-run walkthrough as seen. Every test context starts with
  // empty localStorage, so without this the walkthrough's scrim opens over
  // every page and swallows the first click — tests fail on navigation that
  // never happened. The legacy (pre-per-user) key is enough: the component
  // adopts it into the per-user key on first render and stays closed.
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const seen = [{ name: 'loom_has_seen_walkthrough', value: 'true' }];
  state.origins = [
    { origin: 'http://localhost:3000', localStorage: seen },
    { origin: 'http://localhost:3100', localStorage: seen },
  ];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export default globalSetup;
