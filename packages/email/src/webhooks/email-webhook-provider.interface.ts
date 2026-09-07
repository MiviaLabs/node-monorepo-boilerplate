import type {
  EmailWebhookStoredHeaders,
  EmailWebhookVerificationRequest,
  IVerifyAndNormalizeEmailWebhookResult
} from './interfaces';
import type { EmailWebhookProviderName } from './email-webhook.types';

export interface IEmailWebhookProvider {
  readonly provider: EmailWebhookProviderName;

  verifyAndNormalizeWebhook(
    request: EmailWebhookVerificationRequest
  ): Promise<IVerifyAndNormalizeEmailWebhookResult>;

  projectStoredHeaders(
    headers: Record<string, string | string[] | undefined>
  ): EmailWebhookStoredHeaders;
}
