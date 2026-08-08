import { request, FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Three storage states, three identities (see /api/auth/test-login):
// - user.json    → the admin, for /admin surfaces (library-verify).
// - testa.json   → "Test User A", the account that owns every concept, byte and
//   map the suite creates, so test data never pollutes a real person's loom.
// - faculty.json → "Test Faculty", FACULTY on the course membership only. The
//   admin state cannot stand in for this: an ADMIN passes every gate, so it
//   would assert nothing about the narrower door faculty come through.
const STATES = [
  { file: 'playwright/.auth/user.json', query: '' },
  { file: 'playwright/.auth/testa.json', query: '?as=testa' },
  { file: 'playwright/.auth/faculty.json', query: '?as=faculty' },
];

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';

  // Ensure the auth directory exists
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  for (const state of STATES) {
    // Create a raw request context and hit the backdoor authentication route
    const requestContext = await request.newContext();
    const response = await requestContext.get(`${baseURL}/api/auth/test-login${state.query}`);

    if (!response.ok()) {
      throw new Error(`Failed to authenticate via test-login${state.query}: ${response.status()} ${response.statusText()}`);
    }

    // Save the state (which includes the session cookie) to the storage path
    await requestContext.storageState({ path: state.file });
    await requestContext.dispose();

    // Mark the first-run walkthrough as seen. Every test context starts with
    // empty localStorage, so without this the walkthrough's scrim opens over
    // every page and swallows the first click — tests fail on navigation that
    // never happened. The legacy (pre-per-user) key is enough: the component
    // adopts it into the per-user key on first render and stays closed.
    const parsed = JSON.parse(fs.readFileSync(state.file, 'utf8'));
    const seen = [{ name: 'loom_has_seen_walkthrough', value: 'true' }];
    parsed.origins = [
      { origin: 'http://localhost:3000', localStorage: seen },
      { origin: 'http://localhost:3100', localStorage: seen },
    ];
    fs.writeFileSync(state.file, JSON.stringify(parsed, null, 2));
  }
}

export default globalSetup;
