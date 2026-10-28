import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Property } from '../properties/entities/property.entity';
import { ViewingSlot } from '../viewings/entities/viewing-slot.entity';
import { Booking } from '../viewings/entities/booking.entity';
import { InitialSchema1730200000000 } from './migrations/1730200000000-InitialSchema';

export const entities = [User, Property, ViewingSlot, Booking];
export const migrations = [InitialSchema1730200000000];

export function buildDataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities,
    migrations,
    synchronize: false,
    migrationsRun: false,
  };
}

// Used by the TypeORM CLI (npm run migration:run)
export default new DataSource(
  buildDataSourceOptions(process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/viewings'),
);
