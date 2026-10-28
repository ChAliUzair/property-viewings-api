/**
 * Demo data: one admin, one agent with two listings and upcoming slots, one renter.
 * Idempotent: running it twice does not create duplicates.
 *   npm run seed
 */
import * as bcrypt from 'bcryptjs';
import dataSource from './data-source';
import { Role, User } from '../users/entities/user.entity';
import { Property } from '../properties/entities/property.entity';
import { ViewingSlot } from '../viewings/entities/viewing-slot.entity';

const PASSWORD = 'DemoPassw0rd';

async function upsertUser(email: string, fullName: string, role: Role): Promise<User> {
  const repo = dataSource.getRepository(User);
  const existing = await repo.findOneBy({ email });
  if (existing) return existing;
  return repo.save(
    repo.create({ email, fullName, role, passwordHash: await bcrypt.hash(PASSWORD, 12) }),
  );
}

async function main() {
  await dataSource.initialize();
  await dataSource.runMigrations();

  await upsertUser('admin@demo.local', 'Demo Admin', Role.Admin);
  const agent = await upsertUser('agent@demo.local', 'Demo Agent', Role.Agent);
  await upsertUser('renter@demo.local', 'Demo Renter', Role.Renter);

  const properties = dataSource.getRepository(Property);
  if ((await properties.countBy({ agentId: agent.id })) === 0) {
    const listings = await properties.save([
      properties.create({
        agentId: agent.id,
        title: '2-room flat with balcony near Kassberg',
        description: 'Renovated 2023, fitted kitchen, 3rd floor with lift.',
        city: 'Chemnitz',
        postcode: '09112',
        rooms: 2,
        sizeSqm: 58,
        monthlyRentCents: 64500,
      }),
      properties.create({
        agentId: agent.id,
        title: '3.5-room family flat, quiet street',
        description: 'Two bathrooms, cellar, close to schools and tram.',
        city: 'Leipzig',
        postcode: '04275',
        rooms: 3.5,
        sizeSqm: 91,
        monthlyRentCents: 118000,
      }),
    ]);

    const slots = dataSource.getRepository(ViewingSlot);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(15, 0, 0, 0);
    for (const property of listings) {
      for (let i = 0; i < 4; i++) {
        const startsAt = new Date(tomorrow.getTime() + i * 30 * 60_000);
        await slots.save(
          slots.create({
            propertyId: property.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + 20 * 60_000),
          }),
        );
      }
    }
  }

  console.log(`Seeded. Log in as admin@ / agent@ / renter@demo.local with password ${PASSWORD}`);
  await dataSource.destroy();
}

main().catch(async (err) => {
  console.error(err);
  await dataSource.destroy().catch(() => undefined);
  process.exit(1);
});
