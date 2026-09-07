import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { and, eq, isNull, projects, type NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '../database/database.constants';

import type { Request, Response, NextFunction } from 'express';

type ProjectAuthorizationResource = {
  id: string;
  ownerId: string;
  organizationId: string;
  visibility: string;
};

type RequestWithProjectResource = Request & {
  params?: Record<string, string>;
  tenantContext?: {
    tenantId?: string;
  };
  projectAuthorizationResource?: ProjectAuthorizationResource;
};

@Injectable()
export class ProjectAuthorizationContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ProjectAuthorizationContextMiddleware.name);

  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async use(req: RequestWithProjectResource, _res: Response, next: NextFunction): Promise<void> {
    delete req.projectAuthorizationResource;

    const projectIdRaw = req.params?.['id'];
    const tenantIdRaw = req.tenantContext?.tenantId;

    const projectId = Number.parseInt(projectIdRaw ?? '', 10);
    const tenantId = Number.parseInt(tenantIdRaw ?? '', 10);

    if (
      !Number.isInteger(projectId) ||
      !Number.isInteger(tenantId) ||
      projectId <= 0 ||
      tenantId <= 0
    ) {
      next();
      return;
    }

    const [project] = await this.db
      .select({
        id: projects.id,
        createdBy: projects.createdBy,
        organizationId: projects.organizationId,
        visibility: projects.visibility
      })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.organizationId, tenantId),
          isNull(projects.deletedAt)
        )
      )
      .limit(1);

    if (!project) {
      this.logger.debug(
        `Project authorization context not found for tenant=${tenantId} project=${projectId}`
      );
      next();
      return;
    }

    req.projectAuthorizationResource = {
      id: String(project.id),
      ownerId: String(project.createdBy),
      organizationId: String(project.organizationId),
      visibility: project.visibility
    };

    next();
  }
}
