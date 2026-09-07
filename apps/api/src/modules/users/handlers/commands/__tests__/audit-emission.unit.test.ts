import { Test } from '@nestjs/testing';
import { RoleService } from '@package/auth';
import { AddressType, SYSTEM_ROLE } from '@package/constants';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { AuthRepository } from '../../../../auth/repositories/auth.repository';
import {
  CreateUserAddressCommand,
  CreateUserCommand,
  DeleteUserAddressCommand,
  DeleteUserCommand,
  UpdateUserAddressCommand,
  UpdateUserCommand
} from '../../../commands';
import { UserAddressRepository } from '../../../repositories/user-address.repository';
import { UserRepository } from '../../../repositories/user.repository';
import {
  CreateUserAddressHandler,
  CreateUserHandler,
  DeleteUserAddressHandler,
  DeleteUserHandler,
  UpdateUserAddressHandler,
  UpdateUserHandler
} from '../index';

describe('Users audit emission', () => {
  const user = {
    id: 42,
    organizationId: 11,
    emailHash: 'hash',
    emailEncrypted: 'encrypted',
    firstNameEncrypted: null,
    lastNameEncrypted: null,
    displayName: null,
    phoneNumberEncrypted: null,
    isActive: true,
    isVerified: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    lastSignInAt: null,
    deletedAt: null,
    photoUrl: null,
    encryptionKeyVersion: 'primary/1'
  };

  const address = {
    id: 55,
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
    deletedAt: null
  };

  const buildDb = (): { transaction: jest.Mock } => ({
    transaction: jest.fn((callback: (tx: object) => Promise<unknown>) => callback({ tx: true }))
  });

  it('emits audit events for user create, update, and delete inside the transaction target', async () => {
    const db = buildDb();
    const auditOutbox = { insert: jest.fn(() => Promise.resolve()) };
    const module = await Test.createTestingModule({
      providers: [
        CreateUserHandler,
        UpdateUserHandler,
        DeleteUserHandler,
        {
          provide: UserRepository,
          useValue: {
            createWithTransaction: jest.fn(() => Promise.resolve(user)),
            updateWithTransaction: jest.fn(() => Promise.resolve({ ...user, isActive: false }))
          }
        },
        {
          provide: AuthRepository,
          useValue: {
            softDeleteWithTransaction: jest.fn(() => Promise.resolve())
          }
        },
        {
          provide: RoleService,
          useValue: {
            getSystemRoles: jest.fn((id: number) =>
              Promise.resolve(id === 99 ? [SYSTEM_ROLE.OWNER] : [])
            )
          }
        },
        {
          provide: OutboxRepository,
          useValue: {
            insert: jest.fn(() => Promise.resolve())
          }
        },
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    await module.get(CreateUserHandler).execute(
      new CreateUserCommand({
        tenantId: 11,
        actorId: 99,
        organizationId: 11,
        requestId: 'req-create',
        correlationId: 'corr-create',
        causationId: 'cause-create'
      })
    );
    await module.get(UpdateUserHandler).execute(
      new UpdateUserCommand({
        tenantId: 11,
        actorId: 99,
        id: 42,
        isActive: false,
        requestId: 'req-update',
        correlationId: 'corr-update',
        causationId: 'cause-update'
      })
    );
    await module.get(DeleteUserHandler).execute(
      new DeleteUserCommand({
        tenantId: 11,
        actorId: 99,
        id: 42,
        requestId: 'req-delete',
        correlationId: 'corr-delete',
        causationId: 'cause-delete'
      })
    );

    expect(auditOutbox.insert).toHaveBeenCalledTimes(3);
    const userAuditCalls = auditOutbox.insert.mock.calls as unknown as Array<
      [object, Record<string, unknown>]
    >;
    expect(userAuditCalls[0]?.[0]).toEqual({ tx: true });
    expect(userAuditCalls[0]?.[1]).toMatchObject({
      eventType: 'user.created.audit',
      payload: expect.objectContaining({ requestId: 'req-create' })
    });
    expect(userAuditCalls[1]?.[0]).toEqual({ tx: true });
    expect(userAuditCalls[1]?.[1]).toMatchObject({
      eventType: 'user.updated.audit',
      payload: expect.objectContaining({
        details: expect.objectContaining({
          changedFields: expect.arrayContaining(['isActive', 'updatedAt'])
        })
      })
    });
    expect(userAuditCalls[2]?.[0]).toEqual({ tx: true });
    expect(userAuditCalls[2]?.[1]).toMatchObject({
      eventType: 'user.deleted.audit',
      payload: expect.objectContaining({ requestId: 'req-delete' })
    });
  });

  it('emits metadata-only audit events for address create, update, and delete inside the transaction target', async () => {
    const db = buildDb();
    const auditOutbox = { insert: jest.fn(() => Promise.resolve()) };
    const module = await Test.createTestingModule({
      providers: [
        CreateUserAddressHandler,
        UpdateUserAddressHandler,
        DeleteUserAddressHandler,
        {
          provide: UserAddressRepository,
          useValue: {
            createWithVault: jest.fn(() => Promise.resolve(address)),
            setDefault: jest.fn(() => Promise.resolve(address)),
            findByIdOrThrow: jest.fn(() => Promise.resolve(address)),
            updateVaultField: jest.fn(() => Promise.resolve(address)),
            updateWithTransaction: jest.fn(() => Promise.resolve(address)),
            softDelete: jest.fn(() => Promise.resolve())
          }
        },
        {
          provide: OutboxRepository,
          useValue: {
            insert: jest.fn(() => Promise.resolve())
          }
        },
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    await module.get(CreateUserAddressHandler).execute(
      new CreateUserAddressCommand({
        tenantId: 11,
        actorId: 42,
        userId: 42,
        addressType: AddressType.Primary,
        requestId: 'req-address-create',
        correlationId: 'corr-address-create',
        causationId: 'cause-address-create',
        components: { street: '123 Main St', city: 'Paris' }
      })
    );
    await module.get(UpdateUserAddressHandler).execute(
      new UpdateUserAddressCommand({
        tenantId: 11,
        actorId: 42,
        addressId: 55,
        requestId: 'req-address-update',
        correlationId: 'corr-address-update',
        causationId: 'cause-address-update',
        label: 'Office',
        components: { city: 'Berlin' }
      })
    );
    await module.get(DeleteUserAddressHandler).execute(
      new DeleteUserAddressCommand({
        tenantId: 11,
        actorId: 42,
        addressId: 55,
        requestId: 'req-address-delete',
        correlationId: 'corr-address-delete',
        causationId: 'cause-address-delete'
      })
    );

    expect(auditOutbox.insert).toHaveBeenCalledTimes(3);
    const addressAuditCalls = auditOutbox.insert.mock.calls as unknown as Array<
      [object, Record<string, unknown>]
    >;
    expect(addressAuditCalls[0]?.[0]).toEqual({ tx: true });
    expect(addressAuditCalls[0]?.[1]).toMatchObject({
      eventType: 'user.address.created.audit',
      payload: expect.objectContaining({
        details: expect.objectContaining({
          encryptedStoreFieldNames: expect.arrayContaining(['street', 'city'])
        })
      })
    });
    expect(addressAuditCalls[1]?.[0]).toEqual({ tx: true });
    expect(addressAuditCalls[1]?.[1]).toMatchObject({
      eventType: 'user.address.updated.audit',
      payload: expect.objectContaining({
        details: expect.objectContaining({
          piiFieldNames: ['city'],
          changedMetadataFields: ['label']
        })
      })
    });
    expect(addressAuditCalls[2]?.[0]).toEqual({ tx: true });
    expect(addressAuditCalls[2]?.[1]).toMatchObject({
      eventType: 'user.address.deleted.audit',
      payload: expect.objectContaining({ requestId: 'req-address-delete' })
    });
  });
});
