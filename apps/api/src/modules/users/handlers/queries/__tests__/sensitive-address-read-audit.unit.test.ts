import { Test } from '@nestjs/testing';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { GetDefaultAddressHandler } from '../../../handlers/queries/get-default-address.handler';
import { GetUserAddressHandler } from '../../../handlers/queries/get-user-address.handler';
import { GetUserAddressesHandler } from '../../../handlers/queries/get-user-addresses.handler';
import {
  GetDefaultAddressQuery,
  GetUserAddressQuery,
  GetUserAddressesQuery
} from '../../../queries';
import { UserAddressRepository } from '../../../repositories/user-address.repository';

describe('Sensitive address read audit coverage', () => {
  const decryptedAddress = {
    id: 5,
    organizationId: 11,
    userId: 42,
    addressType: 'primary',
    label: 'Home',
    streetEncryptedStoreId: 1,
    street2EncryptedStoreId: null,
    cityEncryptedStoreId: 2,
    stateEncryptedStoreId: 3,
    postalCodeEncryptedStoreId: 4,
    countryEncryptedStoreId: 5,
    countryCode: 'US',
    isDefault: true,
    isVerified: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
    decrypted: {
      street: '123 Main St',
      city: 'Paris'
    }
  };

  it('audits list, default, and single-address reads with preserved trace metadata', async () => {
    const auditOutbox = { insert: jest.fn(() => Promise.resolve()) };
    const repository = {
      findById: jest.fn(() => Promise.resolve(decryptedAddress)),
      findByUserWithVault: jest.fn(() => Promise.resolve([decryptedAddress])),
      findDefaultByUser: jest.fn(() => Promise.resolve(decryptedAddress)),
      findWithVault: jest.fn(() => Promise.resolve(decryptedAddress))
    };

    const module = await Test.createTestingModule({
      providers: [
        GetUserAddressesHandler,
        GetDefaultAddressHandler,
        GetUserAddressHandler,
        {
          provide: UserAddressRepository,
          useValue: repository
        },
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: { db: true }
        }
      ]
    }).compile();

    await module.get(GetUserAddressesHandler).execute(
      new GetUserAddressesQuery({
        tenantId: 11,
        userId: 42,
        actorId: 99,
        requestId: 'req-list',
        correlationId: 'corr-list',
        causationId: 'cause-list'
      })
    );
    await module.get(GetDefaultAddressHandler).execute(
      new GetDefaultAddressQuery({
        tenantId: 11,
        userId: 42,
        actorId: 99,
        requestId: 'req-default',
        correlationId: 'corr-default',
        causationId: 'cause-default'
      })
    );
    await module.get(GetUserAddressHandler).execute(
      new GetUserAddressQuery({
        tenantId: 11,
        userId: 42,
        addressId: 5,
        actorId: 99,
        requestId: 'req-one',
        correlationId: 'corr-one',
        causationId: 'cause-one'
      })
    );

    expect(auditOutbox.insert).toHaveBeenCalledTimes(3);
    const calls = auditOutbox.insert.mock.calls as unknown as Array<
      [object, Record<string, unknown>]
    >;
    expect(calls[0]?.[0]).toEqual({ db: true });
    expect(calls[0]?.[1]).toMatchObject({
      eventType: 'user.addresses.listed.audit',
      correlationId: 'corr-list',
      causationId: 'cause-list',
      payload: expect.objectContaining({ requestId: 'req-list' })
    });
    expect(calls[1]?.[0]).toEqual({ db: true });
    expect(calls[1]?.[1]).toMatchObject({
      eventType: 'user.address.default.viewed.audit',
      payload: expect.objectContaining({ requestId: 'req-default' })
    });
    expect(calls[2]?.[0]).toEqual({ db: true });
    expect(calls[2]?.[1]).toMatchObject({
      eventType: 'user.address.viewed.audit',
      payload: expect.objectContaining({ requestId: 'req-one' })
    });
  });

  it('does not decrypt or return an address when the route userId does not own that address', async () => {
    const auditOutbox = { insert: jest.fn(() => Promise.resolve()) };
    const repository = {
      findById: jest.fn(() => Promise.resolve({ ...decryptedAddress, userId: 777 })),
      findWithVault: jest.fn(() => Promise.resolve(decryptedAddress))
    };

    const module = await Test.createTestingModule({
      providers: [
        GetUserAddressHandler,
        {
          provide: UserAddressRepository,
          useValue: repository
        },
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: { db: true }
        }
      ]
    }).compile();

    await expect(
      module.get(GetUserAddressHandler).execute(
        new GetUserAddressQuery({
          tenantId: 11,
          userId: 42,
          addressId: 5,
          actorId: 99,
          requestId: 'req-mismatch',
          correlationId: 'corr-mismatch',
          causationId: 'cause-mismatch'
        })
      )
    ).rejects.toThrow('Record not found in database');

    expect(repository.findById).toHaveBeenCalledWith(11, 5);
    expect(repository.findWithVault).not.toHaveBeenCalled();
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        eventType: 'user.address.viewed.audit',
        payload: expect.objectContaining({
          requestId: 'req-mismatch',
          details: expect.objectContaining({
            requestedUserId: '42',
            ownerMatchedRequestedUser: false,
            result: 'not_found'
          })
        })
      })
    );
  });
});
