import type { CreateContentCommentDto } from '../dto';
import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { ICommand } from '@package/types';

export class CreateContentCommentCommand implements ICommand {
  readonly readonly = true;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly actorId: string,
    public readonly roles: readonly string[] | undefined,
    public readonly entryId: string,
    public readonly dto: CreateContentCommentDto,
    trace: RequestTrace = {}
  ) {
    this.requestId = trace.requestId;
    if (trace.correlationId !== undefined) {
      this.correlationId = trace.correlationId;
    }
    if (trace.causationId !== undefined) {
      this.causationId = trace.causationId;
    }
  }
}
