import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { smsOutbox } from '../../src/lib/sms.js';
import { futureDate } from './helpers.js';

let app: Express;

beforeAll(() => {
  app = createApp({ sessionStore: new session.MemoryStore() });
});
afterAll(() => prisma.$disconnect());

/** Agent that keeps cookies and returns a CSRF token from a page. */
async function agentWithToken(path = '/contact') {
  const agent = request.agent(app);
  const res = await agent.get(path);
  const token = /name="_csrf" value="([^"]+)"/.exec(res.text)?.[1];
  expect(token).toBeTruthy();
  return { agent, token: token! };
}

async function register(name: string, phone: string) {
  const { agent, token } = await agentWithToken('/register');
  const res = await agent.post('/register').type('form').send({
    _csrf: token,
    name,
    phone,
    password: 'Kathmandu#Paws9',
    passwordConfirm: 'Kathmandu#Paws9',
    acceptTerms: 'on',
  });
  expect(res.status).toBe(303);
  expect(res.headers.location).toBe('/account');
  return agent;
}

describe('pages and security headers', () => {
  it('renders the home page with CSP and LocalBusiness schema', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.text).toContain('"PetStore"');
    expect(res.text).not.toMatch(/<script>(?!\s*$)/); // no inline scripts
  });

  it('marks private pages noindex', async () => {
    const res = await request(app).get('/cart');
    expect(res.text).toContain('noindex');
  });

  it('serves health, sitemap and robots', async () => {
    expect((await request(app).get('/healthz')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/sitemap.xml')).text).toContain('/services/vaccination');
    expect((await request(app).get('/robots.txt')).status).toBe(200);
  });
});

describe('CSRF', () => {
  it('rejects state changing requests without a token', async () => {
    const res = await request(app).post('/contact').type('form').send({ name: 'x' });
    expect(res.status).toBe(403);
  });

  it('rejects API writes without the header', async () => {
    const res = await request(app).post('/api/v1/cart/items').send({ variantId: 1, quantity: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf_invalid');
  });

  it('accepts a valid token and returns 422 with field details on bad input', async () => {
    const { agent, token } = await agentWithToken();
    const res = await agent.post('/api/v1/otp').set('X-CSRF-Token', token).send({ phone: '123' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('phone');
  });
});

describe('auth and ownership', () => {
  it('keeps customers out of admin and other customers’ pets', async () => {
    const alice = await register('Alice', '9811000001');
    const bob = await register('Bob', '9811000002');

    const page = await alice.get('/account/pets/new');
    const csrf = /name="_csrf" value="([^"]+)"/.exec(page.text)![1]!;
    const created = await alice.post('/api/v1/me/pets').set('X-CSRF-Token', csrf).send({ name: 'Rex', species: 'DOG' });
    expect(created.status).toBe(201);
    const petId = created.body.data.id;

    expect((await alice.get(`/account/pets/${petId}`)).status).toBe(200);
    expect((await bob.get(`/account/pets/${petId}`)).status).toBe(404);
    expect((await bob.get('/admin')).status).toBe(403);
    expect((await request(app).get('/account')).status).toBe(302);
  });

  it('rejects wrong passwords without revealing which part was wrong', async () => {
    const { agent, token } = await agentWithToken('/login');
    const res = await agent.post('/login').set('Accept', 'application/json').type('form').send({ _csrf: token, identifier: '9811000001', password: 'nope-nope' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/Phone\/email or password is incorrect/);
  });
});

describe('guest booking over the API', () => {
  it('requires a verified phone, then books with the OTP', async () => {
    const { agent, token } = await agentWithToken('/book');
    const phone = '9822000003';
    const booking = { serviceType: 'VACCINATION', petSummary: 'Cat, 1 year', contactName: 'Guest', contactPhone: phone, date: futureDate(10), slot: '12:00' };

    const denied = await agent.post('/api/v1/bookings').set('X-CSRF-Token', token).send(booking);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('phone_unverified');

    expect((await agent.post('/api/v1/otp').set('X-CSRF-Token', token).send({ phone })).status).toBe(201);
    const code = /(\d{6}) is your/.exec(smsOutbox.filter((m) => m.to === phone).at(-1)!.text)![1];

    const bad = await agent.post('/api/v1/otp/verify').set('X-CSRF-Token', token).send({ phone, code: code === '000000' ? '111111' : '000000' });
    expect(bad.status).toBe(422);
    expect((await agent.post('/api/v1/otp/verify').set('X-CSRF-Token', token).send({ phone, code })).status).toBe(200);

    const ok = await agent.post('/api/v1/bookings').set('X-CSRF-Token', token).send(booking);
    expect(ok.status).toBe(201);
    expect(ok.headers.location).toMatch(/^\/book\/confirmation\/EK/);
    expect((await agent.get(ok.headers.location)).status).toBe(200);
    // Another browser cannot see the confirmation.
    expect((await request(app).get(ok.headers.location)).status).toBe(404);
  });
});
