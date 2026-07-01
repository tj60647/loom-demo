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
  await requestContext.storageState({ path: 'playwright/.auth/user.json' });
  await requestContext.dispose();
}

export default globalSetup;
