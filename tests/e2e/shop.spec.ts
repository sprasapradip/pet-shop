import { expect, test } from '@playwright/test';

test('browse, add to cart and place a cash on delivery order', async ({ page }) => {
  await page.goto('/shop/category/dog-food');
  await page.getByRole('link', { name: /Pedigree Adult/ }).first().click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText(/Added to cart/)).toBeVisible();

  await page.goto('/checkout');
  await page.getByLabel('Full name').fill('E2E Buyer');
  await page.getByLabel('Phone').fill('9841234567');
  await page.getByLabel('Street / tole / house').fill('House 7');
  await page.getByLabel('Area / ward').fill('Kalanki');
  await page.getByText('Cash on delivery').click();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('heading', { name: /Thank you/ })).toBeVisible();
});

test('booking wizard shows live time slots', async ({ page }) => {
  await page.goto('/book?service=VACCINATION');
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await page.getByLabel(/Tell us about your pet|Or describe the pet/).fill('Labrador, 3 months');
  await page.getByRole('button', { name: 'Continue' }).nth(1).click();
  const d = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Date', { exact: true }).fill(d);
  await expect(page.locator('[data-slots] label').first()).toBeVisible();
});

test('sticky mobile bar has call, WhatsApp and book', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Quick actions' });
  await expect(bar.getByRole('link', { name: /Call/ })).toHaveAttribute('href', /^tel:/);
  await expect(bar.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /wa\.me/);
});
