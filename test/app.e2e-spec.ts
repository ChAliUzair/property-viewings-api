import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Role } from '../src/users/entities/user.entity';
import {
  auth,
  createTestApp,
  createUserWithRole,
  inMinutes,
  login,
  PASSWORD,
  uniqueEmail,
} from './test-app';

describe('Property Viewings API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;
  let agentToken: string;
  let otherAgentToken: string;
  let renterToken: string;
  let propertyId: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    adminToken = (await createUserWithRole(app, Role.Admin)).token;
    agentToken = (await createUserWithRole(app, Role.Agent)).token;
    otherAgentToken = (await createUserWithRole(app, Role.Agent, 'other-agent')).token;
    renterToken = (await createUserWithRole(app, Role.Renter)).token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('reports database and redis status', async () => {
      const res = await request(http).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', database: true, redis: true });
    });
  });

  describe('auth', () => {
    const email = uniqueEmail('signup');

    it('rejects weak passwords and unknown fields', async () => {
      await request(http)
        .post('/auth/register')
        .send({ email, password: 'short', fullName: 'Ada' })
        .expect(400);
      await request(http)
        .post('/auth/register')
        .send({ email, password: PASSWORD, fullName: 'Ada', role: 'admin' })
        .expect(400); // cannot smuggle a role in
    });

    it('registers a renter without leaking the password hash', async () => {
      const res = await request(http)
        .post('/auth/register')
        .send({ email, password: PASSWORD, fullName: 'Ada Lovelace' })
        .expect(201);
      expect(res.body).toMatchObject({ email, fullName: 'Ada Lovelace', role: 'renter' });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email regardless of case', async () => {
      await request(http)
        .post('/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD, fullName: 'Ada again' })
        .expect(409);
    });

    it('logs in with the right password only', async () => {
      await request(http)
        .post('/auth/login')
        .send({ email, password: 'WrongPassw0rd' })
        .expect(401);
      const token = await login(app, email);
      const me = await request(http).get('/users/me').set(auth(token)).expect(200);
      expect(me.body.email).toBe(email);
    });

    it('requires a token for protected routes', async () => {
      await request(http).get('/users/me').expect(401);
      await request(http).get('/users/me').set(auth('not-a-jwt')).expect(401);
    });

    it('lets only an admin promote a user to agent', async () => {
      const newcomer = uniqueEmail('future-agent');
      const created = await request(http)
        .post('/auth/register')
        .send({ email: newcomer, password: PASSWORD, fullName: 'Future Agent' })
        .expect(201);
      const id = created.body.id as string;

      await request(http)
        .patch(`/users/${id}/role`)
        .set(auth(renterToken))
        .send({ role: 'agent' })
        .expect(403);
      await request(http)
        .patch(`/users/${id}/role`)
        .set(auth(adminToken))
        .send({ role: 'agent' })
        .expect(200);

      // Roles live in the token, so the promotion takes effect on the next login.
      const token = await login(app, newcomer);
      await request(http)
        .post('/properties')
        .set(auth(token))
        .send(listing({ title: 'Promoted agent listing' }))
        .expect(201);
    });
  });

  describe('properties', () => {
    it('only agents can create listings', async () => {
      await request(http).post('/properties').send(listing()).expect(401);
      await request(http).post('/properties').set(auth(renterToken)).send(listing()).expect(403);
    });

    it('validates the payload', async () => {
      await request(http)
        .post('/properties')
        .set(auth(agentToken))
        .send(listing({ postcode: 'ABC', monthlyRentCents: -5 }))
        .expect(400);
    });

    it('creates listings and searches with filters, sorting and pagination', async () => {
      const city = `Testburg-${Date.now()}`;
      const rents = [90000, 65000, 120000];
      for (const [i, rent] of rents.entries()) {
        const res = await request(http)
          .post('/properties')
          .set(auth(agentToken))
          .send(listing({ city, title: `Flat number ${i}`, monthlyRentCents: rent, rooms: 2 + i }))
          .expect(201);
        if (i === 0) propertyId = res.body.id as string;
      }

      const page1 = await request(http)
        .get('/properties')
        .query({ city, sort: 'rent_asc', limit: 2, page: 1 })
        .expect(200);
      expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
      const sortedRents = (page1.body.data as { monthlyRentCents: number }[]).map(
        (p) => p.monthlyRentCents,
      );
      expect(sortedRents).toEqual([65000, 90000]);
      expect(page1.body.data[0].rooms).toBe(3); // numeric column comes back as a number

      const filtered = await request(http)
        .get('/properties')
        .query({ city: city.toUpperCase(), maxRentCents: 95000, minRooms: 2.5 })
        .expect(200);
      expect(filtered.body.meta.total).toBe(1);
      expect(filtered.body.data[0].monthlyRentCents).toBe(65000);
    });

    it('serves updates immediately even though search results are cached', async () => {
      const city = `Cachetown-${Date.now()}`;
      const created = await request(http)
        .post('/properties')
        .set(auth(agentToken))
        .send(listing({ city, monthlyRentCents: 70000 }))
        .expect(201);

      const before = await request(http).get('/properties').query({ city }).expect(200);
      expect(before.body.data[0].monthlyRentCents).toBe(70000);

      await request(http)
        .patch(`/properties/${created.body.id}`)
        .set(auth(agentToken))
        .send({ monthlyRentCents: 72500 })
        .expect(200);

      const after = await request(http).get('/properties').query({ city }).expect(200);
      expect(after.body.data[0].monthlyRentCents).toBe(72500);
    });

    it('stops an agent from editing another agent’s listing', async () => {
      await request(http)
        .patch(`/properties/${propertyId}`)
        .set(auth(otherAgentToken))
        .send({ title: 'Hijacked listing title' })
        .expect(403);
      await request(http).get('/properties/not-a-uuid').expect(400);
      await request(http).get('/properties/6f9619ff-8b86-4011-b42d-00c04fc964ff').expect(404);
    });
  });

  describe('viewing slots and bookings', () => {
    let slotId: string;

    it('creates slots and rejects overlaps, past times and odd durations', async () => {
      const start = inMinutes(24 * 60);
      const res = await request(http)
        .post(`/properties/${propertyId}/slots`)
        .set(auth(agentToken))
        .send({ startsAt: start, endsAt: new Date(start.getTime() + 30 * 60_000) })
        .expect(201);
      slotId = res.body.id as string;

      // Touching end-to-start is allowed ([) ranges); overlapping is not.
      await request(http)
        .post(`/properties/${propertyId}/slots`)
        .set(auth(agentToken))
        .send({
          startsAt: new Date(start.getTime() + 30 * 60_000),
          endsAt: new Date(start.getTime() + 60 * 60_000),
        })
        .expect(201);
      await request(http)
        .post(`/properties/${propertyId}/slots`)
        .set(auth(agentToken))
        .send({
          startsAt: new Date(start.getTime() + 15 * 60_000),
          endsAt: new Date(start.getTime() + 45 * 60_000),
        })
        .expect(409);

      await request(http)
        .post(`/properties/${propertyId}/slots`)
        .set(auth(agentToken))
        .send({ startsAt: inMinutes(-60), endsAt: inMinutes(-30) })
        .expect(400);
      await request(http)
        .post(`/properties/${propertyId}/slots`)
        .set(auth(agentToken))
        .send({ startsAt: inMinutes(3000), endsAt: inMinutes(3005) })
        .expect(400);
      await request(http)
        .post(`/properties/${propertyId}/slots`)
        .set(auth(otherAgentToken))
        .send({ startsAt: inMinutes(4000), endsAt: inMinutes(4030) })
        .expect(403);
    });

    it('books a slot, shows it as taken, and blocks a second renter', async () => {
      const before = await request(http).get(`/properties/${propertyId}/slots`).expect(200);
      expect(findSlot(before.body, slotId).isBooked).toBe(false);

      await request(http)
        .post(`/slots/${slotId}/bookings`)
        .set(auth(renterToken))
        .send({ note: 'Coming with my partner.' })
        .expect(201);

      const after = await request(http).get(`/properties/${propertyId}/slots`).expect(200);
      expect(findSlot(after.body, slotId).isBooked).toBe(true);

      const second = (await createUserWithRole(app, Role.Renter, 'second-renter')).token;
      await request(http).post(`/slots/${slotId}/bookings`).set(auth(second)).send({}).expect(409);
      await request(http)
        .post(`/slots/${slotId}/bookings`)
        .set(auth(agentToken))
        .send({})
        .expect(403);
    });

    it('lists bookings for the renter and for the listing agent only', async () => {
      const mine = await request(http).get('/bookings/me').set(auth(renterToken)).expect(200);
      expect(mine.body.meta.total).toBe(1);
      expect(mine.body.data[0].slot.property.id).toBe(propertyId);

      const forAgent = await request(http)
        .get(`/properties/${propertyId}/bookings`)
        .set(auth(agentToken))
        .expect(200);
      expect(forAgent.body.data[0].renter.fullName).toBe('Test renter');
      expect(forAgent.body.data[0].renter).not.toHaveProperty('passwordHash');

      await request(http)
        .get(`/properties/${propertyId}/bookings`)
        .set(auth(otherAgentToken))
        .expect(403);
    });

    it('protects slots that have a booking and frees them on cancel', async () => {
      await request(http).delete(`/slots/${slotId}`).set(auth(agentToken)).expect(409);

      const mine = await request(http).get('/bookings/me').set(auth(renterToken)).expect(200);
      const bookingId = mine.body.data[0].id as string;

      const stranger = (await createUserWithRole(app, Role.Renter, 'stranger')).token;
      await request(http).patch(`/bookings/${bookingId}/cancel`).set(auth(stranger)).expect(403);

      const cancelled = await request(http)
        .patch(`/bookings/${bookingId}/cancel`)
        .set(auth(renterToken))
        .expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      await request(http).patch(`/bookings/${bookingId}/cancel`).set(auth(renterToken)).expect(409);

      // The slot is free again for someone else.
      await request(http)
        .post(`/slots/${slotId}/bookings`)
        .set(auth(stranger))
        .send({})
        .expect(201);
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of 20 simultaneous renters book the same slot', async () => {
      const start = inMinutes(48 * 60);
      const slot = await request(http)
        .post(`/properties/${propertyId}/slots`)
        .set(auth(agentToken))
        .send({ startsAt: start, endsAt: new Date(start.getTime() + 20 * 60_000) })
        .expect(201);

      const renters = await Promise.all(
        Array.from({ length: 20 }, (_, i) => createUserWithRole(app, Role.Renter, `racer-${i}`)),
      );

      const results = await Promise.all(
        renters.map(({ token }) =>
          request(http).post(`/slots/${slot.body.id}/bookings`).set(auth(token)).send({}),
        ),
      );

      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(19);

      const [{ count }] = await app
        .get(DataSource)
        .query<{ count: string }[]>(
          `SELECT count(*) FROM bookings WHERE slot_id = $1 AND status = 'confirmed'`,
          [slot.body.id],
        );
      expect(Number(count)).toBe(1);
    });
  });

  // Last on purpose: it exhausts this client's login budget for the minute.
  describe('rate limiting', () => {
    it('answers 429 after 10 login attempts per minute', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await request(http)
          .post('/auth/login')
          .send({ email: 'nobody@example.com', password: 'WrongPassw0rd' });
        statuses.push(res.status);
      }
      expect(statuses).toContain(429);
      expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(10);
    });
  });
});

function listing(overrides: Record<string, unknown> = {}) {
  return {
    title: '2-room flat with balcony',
    description: 'Bright and quiet.',
    city: 'Chemnitz',
    postcode: '09112',
    rooms: 2,
    sizeSqm: 58,
    monthlyRentCents: 64500,
    ...overrides,
  };
}

function findSlot(body: unknown, id: string): { id: string; isBooked: boolean } {
  const slot = (body as { id: string; isBooked: boolean }[]).find((s) => s.id === id);
  if (!slot) throw new Error(`slot ${id} not in response`);
  return slot;
}
