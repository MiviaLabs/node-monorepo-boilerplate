import { Injectable } from '@nestjs/common';
import { eq } from '@package/db-core';
import { Errors } from '@package/errors';

import type { NodePgDatabase } from '@package/db-core';

type EntityId = string | number;

@Injectable()
export abstract class NonTenantBaseRepository<TEntity, TInsert, TUpdate> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(protected readonly db: NodePgDatabase<any>) {}

  async findById(id: EntityId): Promise<TEntity | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [result] = await this.db
      .select()
      .from(this.getTable())
      .where(eq(this.getIdColumn(), id))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result ?? null;
  }

  async findByIdOrThrow(id: EntityId): Promise<TEntity> {
    const entity = await this.findById(id);
    if (!entity) {
      throw Errors.databaserecordNotFound004({ entity: this.getEntityName() });
    }
    return entity;
  }

  async create(data: TInsert): Promise<TEntity> {
    const result = (await this.db
      .insert(this.getTable())
      .values(data as Record<string, unknown>)
      .returning()) as TEntity[];

    const [firstResult] = result;
    if (!firstResult) {
      throw new Error(`Failed to create ${this.getEntityName()}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return firstResult as TEntity;
  }

  async update(id: EntityId, data: TUpdate): Promise<TEntity> {
    const result = (await this.db
      .update(this.getTable())
      .set(data as Record<string, unknown>)
      .where(eq(this.getIdColumn(), id))
      .returning()) as TEntity[];

    const [firstResult] = result;
    if (!firstResult) {
      throw Errors.databaserecordNotFound004({ entity: this.getEntityName() });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return firstResult as TEntity;
  }

  async delete(id: EntityId): Promise<void> {
    await this.db.delete(this.getTable()).where(eq(this.getIdColumn(), id));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async transaction<T>(callback: (tx: NodePgDatabase<any>) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract getTable(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract getIdColumn(): any;
  protected abstract getEntityName(): string;
}
