import type { CurrentUserSettingKey } from '../user-settings.constants';
import type { ICommand } from '@package/types';

export interface UpdateCurrentUserSettingCommandProps {
  readonly tenantId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly settingKey: CurrentUserSettingKey;
  readonly value: unknown;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export class UpdateCurrentUserSettingCommand implements ICommand {
  readonly readonly = true as const;
  readonly tenantId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly settingKey: CurrentUserSettingKey;
  readonly value: unknown;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: UpdateCurrentUserSettingCommandProps) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    this.actorId = props.actorId;
    this.settingKey = props.settingKey;
    this.value = props.value;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}
