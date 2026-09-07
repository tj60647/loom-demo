import { test, expect } from '@playwright/test';

/**
 * The shelf re-reads the syllabus when the tab comes back to the front.
 *
 * ReadingsProvider fetches the reading list once per page load, so before this
 * a change to the course never reached a tab that was already open: a reading
 * removed from a course went on being listed, and openable, until the reader
 * reloaded. `revalidatePath("/")` cannot bridge it — `/` renders a client
 * component, so there is no server-rendered list to invalidate.
 *
 * The session and `/api/sources` are both mocked client-side, the way
 * library-verify.spec.ts mocks the session, so this needs no fixture data and
 * cannot disturb the shared CI database.
 *
 * `page.clock` jumps the 30-second staleness floor rather than waiting it out:
 * the e2e job holds a global lock, so a real sleep would be taken from every
 * other open PR.
 *
 * Three properties, each of which can regress on its own:
 *   1. the list updates when the tab returns;
 *   2. the shelf is not blanked while it updates — asserted by holding the
 *      second response open and checking the old list is still on screen,
 *      which a loud refetch (isLoading true) would not leave standing;
 *   3. two events arriving together cause one fetch, not two.
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

test('a reading removed from the course leaves the shelf when the tab returns', async ({ page }) => {
  await page.clock.install();

  let served = 0;
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) })
  );
  await page.route('**/api/sources', async (route) => {
    served += 1;
    // The first read is the syllabus as it was; every read after it is the
    // syllabus after an admin removed one reading from the course. The second
    // is held open briefly — real time, not the virtual clock — so the test can
    // look at the shelf WHILE it is being re-read.
    if (served > 1) await new Promise((r) => setTimeout(r, 600));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(served === 1 ? BEFORE : AFTER),
    });
  });

  await page.goto('/');

  await expect(page.getByText(DROPPED)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(KEPT)).toBeVisible();
  expect(served).toBe(1);

  // Past the staleness floor, then back to the front. visibilityState stays
  // "visible" throughout, which is what the handler requires — it listens for
  // the event, not for a change of state.
  await page.clock.fastForward('00:31');
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });

  // (2) Mid-flight, the old list is still standing. A loud refetch would have
  // put the shelf back into its loading state and taken these off screen.
  await expect(page.getByText(KEPT)).toBeVisible();
  await expect(page.getByText(DROPPED)).toBeVisible();

  // (1) Then the removed reading goes.
  await expect(page.getByText(DROPPED)).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByText(KEPT)).toBeVisible();

  // (3) Both events fired together, and the in-flight guard made them one read.
  expect(served).toBe(2);
});
