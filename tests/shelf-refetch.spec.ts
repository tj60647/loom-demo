import { test, expect } from '@playwright/test';

/**
 * The shelf re-reads the syllabus when someone arrives at the Library.
 *
 * ReadingsProvider fetches the reading list once and lives above the router,
 * so an in-app navigation — the admin screens back to the Library — showed the
 * list as it was when the tab was opened, including readings since removed
 * from the course. `revalidatePath("/")` cannot bridge it: `/` renders a
 * client component, so there is no server-rendered list to invalidate.
 *
 * Returning to a backgrounded TAB was already covered before this, and by
 * something else entirely: next-auth's SessionProvider refetches the session on
 * visibilitychange (`refetchOnWindowFocus` defaults to true) and hands back a
 * new session object, which re-runs the provider's own effect. An earlier draft
 * of this fix added a second visibilitychange listener and duplicated it; the
 * count assertion below is what caught that.
 *
 * The session and `/api/sources` are both mocked client-side, the way
 * library-verify.spec.ts mocks the session, so this needs no fixture data and
 * cannot disturb the shared CI database.
 */

const SESSION = {
  user: { name: 'Test Admin', email: 'tjm@tjmcleish.com', id: 'test-admin-id', role: 'ADMIN' },
  expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
};

const reading = (id: string, title: string) => ({
  id,
  title,
  author: 'A. Author',
  sourceReference: null,
  description: null,
  isDescriptionVisible: false,
  week: 1,
  isOwn: false,
  isCore: true,
  storageKey: null,
});

const KEPT = 'Reading That Stays';
const DROPPED = 'Reading That Is Removed';
const BEFORE = [reading('r-kept', KEPT), reading('r-dropped', DROPPED)];
const AFTER = [reading('r-kept', KEPT)];

test('the shelf reads the syllabus once on a cold load', async ({ page }) => {
  let served = 0;
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) })
  );
  await page.route('**/api/sources', (route) => {
    served += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BEFORE) });
  });

  await page.goto('/');
  await expect(page.getByText(KEPT)).toBeVisible({ timeout: 15000 });

  // The arrival hook fires before the provider's own first read — React runs
  // child effects first — so without its sentinel every cold load would fetch
  // the list twice. Given a moment for a second request to appear if it were
  // going to, there is still only one.
  await page.waitForTimeout(1500);
  expect(served).toBe(1);
});

test('returning to the tab updates the shelf without blanking it', async ({ page }) => {
  let served = 0;
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) })
  );
  await page.route('**/api/sources', async (route) => {
    served += 1;
    // The first read is the syllabus as it was; the next is the syllabus after
    // a reading was removed from the course. The second is held open briefly so
    // the test can look at the shelf WHILE it is being re-read.
    if (served > 1) await new Promise((r) => setTimeout(r, 600));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(served === 1 ? BEFORE : AFTER),
    });
  });

  await page.goto('/');
  await expect(page.getByText(DROPPED)).toBeVisible({ timeout: 15000 });

  // A return to the tab. visibilityState stays "visible" throughout, which is
  // what next-auth's own handler requires — it listens for the event, not for
  // a change of state.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  // Mid-read, the old list is still standing. Before this change the provider
  // announced loading on every session change, so a return to the tab put the
  // shelf back into its loading state and took these off screen.
  await expect(page.getByText(KEPT)).toBeVisible();

  await expect(page.getByText(DROPPED)).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByText(KEPT)).toBeVisible();
});
