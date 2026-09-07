import { createParamDecorator } from '@nestjs/common';

import { buildRequestTrace } from '../cqrs/request-trace';

import type { RequestTrace, RequestWithTrace } from '../cqrs/request-trace';
import type { ExecutionContext } from '@nestjs/common';

export const RequestTraceData = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestTrace => {
    const request = ctx.switchToHttp().getRequest<RequestWithTrace>();
    return buildRequestTrace(request);
  }
);
