import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Role, User } from '../src/users/entities/user.entity';

export const PASSWORD = 'CorrectHorse9';

/**
 * Recreates the schema of the *test* database. Refuses to touch any database whose name does not
 * end in `_test`, so pointing DATABASE_URL at a real database cannot wipe it.
 */
export async function resetTestDatabase(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${dbName}": e2e tests only run against a *_test database`);
  }
  const ds = await new DataSource({ type: 'postgres', url: url.toString() }).initialize();
  try {
    await ds.query('DROP SCHEMA IF EXISTS public CASCADE');
    await ds.query('CREATE SCHEMA public');
  } finally {
    await ds.destroy();
  }
}

export async function createTestApp(): Promise<INestApplication> {
  await resetTestDatabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  // Listen on a random port so supertest reuses one server instead of binding one per request.
  await app.listen(0);
  return app;
}

let counter = 0;
export const uniqueEmail = (label: string) => `${label}.${Date.now()}.${++counter}@example.com`;

/**
 * Inserts a user directly (admins cannot self-register) and signs a token for them.
 * Tokens are minted with the app's own JwtService rather than via /auth/login, so test setup
 * does not consume the login rate limit (which has its own test).
 */
export async function createUserWithRole(app: INestApplication, role: Role, label: string = role) {
  const repo = app.get(DataSource).getRepository(User);
  const email = uniqueEmail(label);
  const user = await repo.save(
    repo.create({
      email,
      fullName: `Test ${label}`,
      role,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    }),
  );
  const token = await app
    .get(JwtService)
    .signAsync({ sub: user.id, email: user.email, role: user.role });
  return { user, token };
}

export async function login(
  app: INestApplication,
  email: string,
  password = PASSWORD,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A time `minutes` from now, rounded to the minute. */
export function inMinutes(minutes: number): Date {
  const d = new Date(Date.now() + minutes * 60_000);
  d.setSeconds(0, 0);
  return d;
}
