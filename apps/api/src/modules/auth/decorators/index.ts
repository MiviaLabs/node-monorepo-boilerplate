// Public decorator for auth module
export { Public } from '@package/auth';

// CurrentUser decorator is in common/decorators
// Re-export here for convenience within auth module
export { CurrentUser, type CurrentUserData } from '@/common/decorators';
