import { ValueTransformer } from 'typeorm';

/** pg returns NUMERIC as string to avoid precision loss; our values are small, so number is safe. */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
