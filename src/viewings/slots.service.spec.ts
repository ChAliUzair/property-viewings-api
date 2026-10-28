import { BadRequestException } from '@nestjs/common';
import { assertValidSlotRange } from './slots.service';

describe('assertValidSlotRange', () => {
  const now = new Date('2026-11-01T10:00:00Z');
  const at = (iso: string) => new Date(iso);

  it('accepts a 30-minute slot in the future', () => {
    expect(() =>
      assertValidSlotRange(at('2026-11-02T10:00:00Z'), at('2026-11-02T10:30:00Z'), now),
    ).not.toThrow();
  });

  it('rejects slots that start now or in the past', () => {
    expect(() => assertValidSlotRange(now, at('2026-11-01T10:30:00Z'), now)).toThrow(
      BadRequestException,
    );
  });

  it.each([
    ['too short', '2026-11-02T10:05:00Z'],
    ['too long', '2026-11-02T12:01:00Z'],
    ['ends before it starts', '2026-11-02T09:00:00Z'],
  ])('rejects a slot that is %s', (_label, end) => {
    expect(() => assertValidSlotRange(at('2026-11-02T10:00:00Z'), at(end), now)).toThrow(
      BadRequestException,
    );
  });

  it('accepts the exact bounds of 10 and 120 minutes', () => {
    expect(() =>
      assertValidSlotRange(at('2026-11-02T10:00:00Z'), at('2026-11-02T10:10:00Z'), now),
    ).not.toThrow();
    expect(() =>
      assertValidSlotRange(at('2026-11-02T10:00:00Z'), at('2026-11-02T12:00:00Z'), now),
    ).not.toThrow();
  });
});
