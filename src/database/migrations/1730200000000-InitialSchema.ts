import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema notes
 * - viewing_slots has an EXCLUDE constraint so two slots of the same property can never overlap,
 *   even if two agents create them at the same moment.
 * - bookings has a partial UNIQUE index: at most one *confirmed* booking per slot.
 *   This is what makes double booking impossible under concurrency; the service code only
 *   translates the constraint violation into a 409.
 */
export class InitialSchema1730200000000 implements MigrationInterface {
  name = 'InitialSchema1730200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await q.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);
    await q.query(`CREATE TYPE "user_role" AS ENUM ('admin', 'agent', 'renter')`);
    await q.query(`CREATE TYPE "booking_status" AS ENUM ('confirmed', 'cancelled')`);

    await q.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "password_hash" varchar(100) NOT NULL,
        "full_name" varchar(120) NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'renter',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" (lower("email"))`);

    await q.query(`
      CREATE TABLE "properties" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "agent_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" varchar(160) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "city" varchar(80) NOT NULL,
        "postcode" varchar(10) NOT NULL,
        "rooms" numeric(3,1) NOT NULL CHECK ("rooms" > 0),
        "size_sqm" integer NOT NULL CHECK ("size_sqm" > 0),
        "monthly_rent_cents" integer NOT NULL CHECK ("monthly_rent_cents" > 0),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX "ix_properties_city_rent" ON "properties" (lower("city"), "monthly_rent_cents")`,
    );
    await q.query(`CREATE INDEX "ix_properties_agent" ON "properties" ("agent_id")`);

    await q.query(`
      CREATE TABLE "viewing_slots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_slot_range" CHECK ("ends_at" > "starts_at"),
        CONSTRAINT "ex_slot_no_overlap" EXCLUDE USING gist (
          "property_id" WITH =,
          tstzrange("starts_at", "ends_at", '[)') WITH &&
        )
      )`);
    await q.query(
      `CREATE INDEX "ix_slots_property_start" ON "viewing_slots" ("property_id", "starts_at")`,
    );

    await q.query(`
      CREATE TABLE "bookings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slot_id" uuid NOT NULL REFERENCES "viewing_slots"("id") ON DELETE CASCADE,
        "renter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" "booking_status" NOT NULL DEFAULT 'confirmed',
        "note" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "cancelled_at" timestamptz
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_bookings_one_confirmed_per_slot" ON "bookings" ("slot_id") WHERE "status" = 'confirmed'`,
    );
    await q.query(
      `CREATE INDEX "ix_bookings_renter" ON "bookings" ("renter_id", "created_at" DESC)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "bookings"`);
    await q.query(`DROP TABLE "viewing_slots"`);
    await q.query(`DROP TABLE "properties"`);
    await q.query(`DROP TABLE "users"`);
    await q.query(`DROP TYPE "booking_status"`);
    await q.query(`DROP TYPE "user_role"`);
  }
}
