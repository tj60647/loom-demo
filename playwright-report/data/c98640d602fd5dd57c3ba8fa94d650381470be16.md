# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pdf-viewer.spec.ts >> PDF Viewer and Highlighting >> should highlight captured byte in Object Worlds
- Location: tests\pdf-viewer.spec.ts:11:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("Capture as Byte")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button:has-text("Capture as Byte")')

```

```yaml
- banner:
  - img
  - text: Loom lay the warp · throw the weft Test Admin
  - link "Aggregate View":
    - /url: /admin/aggregate
  - link "Admin":
    - /url: /admin
  - button "Sign out"
  - link "how Loom works":
    - /url: https://github.com/tj60647/loom-demo#readme
    - text: "?"
- alert
- navigation:
  - button "00 Library"
  - button "01 Open"
  - button "02 Throw"
  - button "03 Read"
- main:
  - button "← Back to Library"
  - text: Pages 3-4 of 9
  - button "Fit Page"
  - button "Fit Width"
  - checkbox "2-Page Spread" [checked]
  - text: 2-Page Spread
  - button "Previous Page":
    - img
  - mark: "82"
  - mark
  - mark: I
  - mark
  - mark: DESIGN PHILOSOPHIES A
  - text: "ND THEORIES for a while, but again, I found my footing less sure than I had anticipated. Indeed, from my own ob servations, I can claim fairly confidently that there is no single individual alone who knows how all the ingredients that constitute a telephone system work together to keep each of our phones func tioning. There is no one \"maker.\" Instead, inside each firm, there are different interests, perspec 'cives, and responsibilities-corporate planning, engineering, research, production, marketing, servicing, managing-and consequently different ways in which the telephone \"works.\" At this point I retreated from cynicism. The question now struck me as interesting, not as an instrument for testing technological literacy, but in its own right: What does it mean when some one claims to know how their telephone works? I conjectured that there could well be no unique criterion for judging responses; there could be as many legitimate, that is to say accurate, ways to describe how the telephone works as there are respondents. 2 The narrow view of the workings of the tele phone has the quality of a myth. But while the story about vibrating diaphragms and coils moving in a magnetic field may provide coher ence amid complexity, may give us the confidence to respond in the affirmative to a sociologist on rhe track of technological literacy, and may en capsulate some particular facet of technical truth, taking it as the measure of a person's understand ing of how today's sophisticated and dynamic sys tem of communication works is naive. This naivete is just one failing of the sociologist's research program; another is the presumption that you can rest a person's \"technological literacy\" by literary means alone. Thus, if a respondent has just finished reading about the telephone in the Encyclopedia of Science, the sociologist would no doubt find him or her technologically literate. But this is neither sufficient nor necessary as a display of knowing how the telephone works. Indeed, it is little more than a test of reading retention. No, the \"knowing how it works\" that has meaning and significance is knowing how to do something with the telephone-how to act on it and react to it, how to engage and appropriate the technology according to one's needs and re sponsibilities. Thus the everyday user around the house from the age of seven to seventy, the person who repairs the lines, the new product engineer, and the corporate executive each appropriates the telephone to his or her own interests, and each knows how it works. Refocusing in this way, dragging myself away from an instrumental story derived from a vision of the scientific origins of the device, led me to reformulate the question. Rather than \"Do you know how your telephone works?\" I would ask, \"How does the telephone symbolize, alienate, serve, or have meaning for you?\" With this ques tion we might be able to test the breadth and depth of a person's technological understanding and competence. Note, too, how, with this re orientation, the object loses its grip and the social context of its workings assumes primacy. It is the fixation on the physics of a device that promotes the object as an icon in the design pro cess. For while different participants in design have different interests, different responsibilities, and different technical specialties, it is the object as they see and work with it that patterns their thought and practice, not just when they must en gage the physics of the device but throughout the entire design process, permeating all exchange and discourse within the subculture of the firm. This way of thinking is so prevalent within contempo rary design that I have given it a label-\"object world\" thinking-and will now detour a bit to give a preview of what I mean by the term. I will start with a less complex and more ancient technology and explore what it might mean to know how it works from the perspective of an object world. HOW A CHAIR WORKS-ONE PERSPECTIVE Clearly we all know how to sit in a chair, so in this respect we know how it works: A chair is for sitting. That is how it functions. Unfortunately, this description is akin to saying that a telephone is for making telephone calls. Surely we can do better. (You never know when a sociologist is going to telephone to ask if you know how your chair works.) How about this? A chair is a supported seat. A seat is a two dimensional, finite, contoured surface, made of a rigid or flexible material, which provides immediate support to at least the buttocks of the human body. This support is sufficient to enable a person, when seated, to lift both feet off the ground without falling over. The surface is supported by a structure intervening with the ground. A skeptic might interject here, \"Does this mean that a hammock is a chair? Or a bed? Or a horse?\" In response, we can start adding details. We might, for example, say that a chair is made of inanimate material. There goes the horse. 3 Or we can pass the buck back to a simpler precedent and build upon that: A chair is a stool with a backrest, and a stool is a board elevated from the ground by supports. 4 But this is still not good enough, for we still have to explain how a stool works. W hy do most stools have three legs while a chair has four? We must strive to be even more scientific: A chair is a four-legged stool with a back. Al though three legs, or points of support, are suf ficient to support the seat, the stability of seating is enhanced if we add a fourth point of support since, for said stability, a line connecting the center of gravity of an extended body (yours or mine) to the center of gravity of the earth (or whatever planetary body one happens to be seated upon) must intersect the plane through the feet of the legs of the stool or chair, at a point interior to the three- or four-sided plane figure having the feet as vertices. With four legs, one can assure stability with a square seat. 5 LOUIS BUCCIARELLI, Designing engineers / 83 This, then, is a chair and how it works. We can call this the principle of operation of the chair what Robert Pirsig would call its underlying form. 6 This is the \"physics of the device\" knowl edge that is often taken as the hallmark of tech nological literacy. It constitutes a sparse, efficient, generic, abstract identity of a chair, just as the identity of a circle is defined by the Platonic ideal of \"all points equidistant from a fixed point.\" 7 Given this principle, we can imagine an infi nite variety of particular embodiments that would function as a chair. A chair can be finely carved or sparse yet stately. We can add arms and cushions to create a throne-or set the thing up on curved rails to make a rocker-a matter of controlled stability-if we want to get frivolous. I don't claim that this generic description is the best possible in any sense. Nor is it unique. Indeed, there are other object worlds we should enter to define more fully how a chair works. We can talk about the forces borne by the legs, which distort and deform relative to the seat when a per son sits down. We can even do a finite-element analysis on the computer and estimate the inter nal stresses in the legs, the seat, and the back. And we certainly ought to describe the craft knowledge of chair object worlds: how to join the legs and back to the seat, whether or not it is preferable to make the back an extension of the rear two legs. All of this is part of an object world perspective on how a chair works. HISTORICAL ROOTS-OBJECT WORLDS But this is neither a physics text nor a chair de sign manual. My intent instead is to illustrate a particular way of thinking about and framing an answer to the question \"How does it work?\" This way of thinking will prove essential to under standing the thought and practice of participants in contemporary engineering design. This has not always been the case. The first chair makers did not need to enter the world of geometry, consider the conditions that ensure"
  - button "Next Page":
    - img
- contentinfo: Loom v8—Next
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const pdfsToTest = [
  4  |   { cardTitle: 'Object Worlds', expectedText: 'Object Worlds' },
  5  |   { cardTitle: 'Communities of Practice', expectedText: 'Communities of Practice' },
  6  |   { cardTitle: 'Boundary Objects', expectedText: 'Boundary Objects' }
  7  | ];
  8  | 
  9  | test.describe('PDF Viewer and Highlighting', () => {
  10 |   for (const pdf of pdfsToTest) {
  11 |     test(`should highlight captured byte in ${pdf.cardTitle}`, async ({ page }) => {
  12 |       // 0. Mock the NextAuth session API so the client-side thinks we are logged in
  13 |       await page.route('**/api/auth/session', async (route) => {
  14 |         await route.fulfill({
  15 |           status: 200,
  16 |           contentType: 'application/json',
  17 |           body: JSON.stringify({
  18 |             user: { name: 'Test Admin', email: 'tjm@tjmcleish.com', id: 'test-admin-id' },
  19 |             expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  20 |           }),
  21 |         });
  22 |       });
  23 | 
  24 |       // 1. Navigate to the app (auth is handled by mock)
  25 |       await page.goto('/');
  26 |       
  27 |       // 1b. Click on the Library tab (default is Open tab)
  28 |       await page.getByRole('button', { name: /Library/i }).click();
  29 |       
  30 |       // 2. Wait for the Library to load
  31 |       await expect(page.locator(`text=${pdf.expectedText}`)).toBeVisible();
  32 |       
  33 |       // 3. Click "Read in Loom" on the respective card
  34 |       const card = page.locator('.card', { hasText: pdf.cardTitle });
  35 |       await card.locator('button:has-text("Read in Loom")').click();
  36 |       
  37 |       // 4. Wait for PDF to load
  38 |       await expect(page.locator('text=Loading PDF...')).toBeHidden({ timeout: 15000 });
  39 |       
  40 |       // Wait for the text layer to render on the first page
  41 |       const textLayer = page.locator('.react-pdf__Page__textContent');
  42 |       await expect(textLayer.first()).toBeAttached({ timeout: 10000 });
  43 |       
  44 |       // 5. Go to Page 2 (simulating user turning page)
  45 |       await page.getByRole('button', { name: 'Next Page' }).click();
  46 |       
  47 |       // Wait a moment for page 2 to render
  48 |       await page.waitForTimeout(1000);
  49 |       
  50 |       // 6. Highlight text using the mouse
  51 |       const pageSpan = textLayer.first().locator('span', { hasText: /[a-zA-Z]+/ }).first();
  52 |       await expect(pageSpan).toBeVisible();
  53 |       
  54 |       // Simulate selection by double-clicking a word
  55 |       await pageSpan.dblclick({ force: true });
  56 |       
  57 |       // 7. The "Capture as Byte" button should appear
  58 |       const captureButton = page.locator('button:has-text("Capture as Byte")');
> 59 |       await expect(captureButton).toBeVisible();
     |                                   ^ Error: expect(locator).toBeVisible() failed
  60 |       await captureButton.click();
  61 |       
  62 |       // 8. Modal appears, save the byte
  63 |       const conceptInput = page.getByPlaceholder('e.g. boundary objects');
  64 |       await conceptInput.fill(`Test Concept for ${pdf.cardTitle}`);
  65 |       
  66 |       const saveButton = page.locator('button:has-text("Save Byte")');
  67 |       await saveButton.click();
  68 |       
  69 |       // 9. Wait for modal to close
  70 |       await expect(saveButton).toBeHidden();
  71 |       
  72 |       // 10. Verify the highlight is applied to the DOM immediately
  73 |       const highlight = page.locator('.loom-byte-highlight').first();
  74 |       await expect(highlight).toBeVisible({ timeout: 5000 });
  75 |     });
  76 |   }
  77 | });
  78 | 
```