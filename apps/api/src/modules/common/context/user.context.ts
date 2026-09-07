export interface UserContext {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

/**
 * User context provider
 * Use this to pass user information to repositories
 */
export class UserContextProvider {
  private static context: UserContext | null = null;

  static set(context: UserContext): void {
    this.context = context;
  }

  static get(): UserContext | null {
    return this.context;
  }

  static clear(): void {
    this.context = null;
  }
}
