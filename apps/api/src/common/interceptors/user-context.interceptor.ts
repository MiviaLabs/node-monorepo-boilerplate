import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

import { UserContextProvider } from '../../modules/common/context/user.context';

import type { Request } from 'express';

interface RequestUser {
  userId: number;
  tenantId: number;
  roles?: string[];
  permissions?: string[];
}

interface ExtendedRequest extends Request {
  user?: RequestUser;
}

@Injectable()
export class UserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<ExtendedRequest>();

    // Set user context for the request
    if (request.user) {
      UserContextProvider.set({
        userId: String(request.user.userId),
        tenantId: String(request.user.tenantId),
        roles: request.user.roles ?? [],
        permissions: request.user.permissions ?? []
      });
    }

    return next.handle();
  }
}
