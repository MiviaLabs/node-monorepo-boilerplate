import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AggregateRoot } from './domain/aggregate.types';
import type { IEvent } from './cqrs/event.types';

interface ProbeJSON {
  readonly id: string;
}

class Probe extends AggregateRoot<ProbeJSON> {
  toJSON(): ProbeJSON {
    return { id: this.id };
  }
  // Static factory: bypasses the protected constructor.
  static create(id: string): Probe {
    return new Probe(id);
  }
  exposeAdd(
    data: { readonly type: string },
    metadata?: Readonly<{
      correlationId?: string;
      causationId?: string;
      userId?: string;
      tenantId?: string;
    }>
  ): void {
    this.addEvent(data, metadata);
  }
}

test('addEvent: extra fields belong in metadata, not on the event root', () => {
  const p = Probe.create('a-1');
  p.exposeAdd({ type: 'X' }, { correlationId: 'c1', userId: 'u1', tenantId: 't1' });
  const evts = p.uncommittedEvents;
  assert.equal(evts.length, 1);
  const e: IEvent = evts[0]!;

  // IEvent only declares: _brand?, aggregateId, occurredAt, version, eventId?, correlationId?, causationId?
  // It does NOT declare userId or tenantId. The current implementation spreads
  // metadata.* onto the root, so runtime events carry these extra fields.
  const probe = e as unknown as Record<string, unknown>;
  assert.equal(typeof probe['userId'], 'undefined', 'userId leaked to event root');
  assert.equal(typeof probe['tenantId'], 'undefined', 'tenantId leaked to event root');
  // correlationId/causationId are allowed on IEvent root (optional), so
  // spreading them there is intentional -- but the *full* metadata
  // contract (EventMetadata) wraps them; userId/tenantId have no IEvent slot.
});
