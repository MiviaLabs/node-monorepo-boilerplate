import type { IEmailWebhookProvider } from './email-webhook-provider.interface';
import type { EmailWebhookProviderName } from './email-webhook.types';

type EmailWebhookProviderFactory = () => IEmailWebhookProvider;

export class EmailWebhookProviderRegistry {
  private readonly providers = new Map<string, IEmailWebhookProvider>();
  private readonly providerFactories = new Map<string, EmailWebhookProviderFactory>();

  register(provider: IEmailWebhookProvider): void {
    this.providers.set(this.normalizeProviderName(provider.provider), provider);
  }

  registerFactory(providerName: string, factory: EmailWebhookProviderFactory): void {
    this.providerFactories.set(this.normalizeProviderName(providerName), factory);
  }

  get(providerName: string): IEmailWebhookProvider | undefined {
    const normalizedProviderName = this.normalizeProviderName(providerName);
    const existingProvider = this.providers.get(normalizedProviderName);
    if (existingProvider) {
      return existingProvider;
    }

    const factory = this.providerFactories.get(normalizedProviderName);
    if (!factory) {
      return undefined;
    }

    const provider = factory();
    this.providers.set(normalizedProviderName, provider);
    return provider;
  }

  has(providerName: string): boolean {
    const normalizedProviderName = this.normalizeProviderName(providerName);
    return (
      this.providers.has(normalizedProviderName) ||
      this.providerFactories.has(normalizedProviderName)
    );
  }

  list(): EmailWebhookProviderName[] {
    const names = new Set<EmailWebhookProviderName>();

    for (const provider of this.providers.values()) {
      names.add(provider.provider);
    }

    for (const providerName of this.providerFactories.keys()) {
      names.add(providerName as EmailWebhookProviderName);
    }

    return Array.from(names);
  }

  private normalizeProviderName(providerName: string): string {
    return providerName.trim().toLowerCase();
  }
}
