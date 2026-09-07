/**
 * Firebase Auth Emulator - User Seed Script
 *
 * This script creates test users in the Firebase Auth emulator for local development.
 * It's intended to be used with the Firebase Auth emulator running on localhost:9099.
 *
 * Usage:
 *   pnpm exec tsx firebase-seed/seed-users.ts
 *
 * Prerequisites:
 *   - Firebase Auth emulator must be running (docker-compose -f docker-compose.firebase-emulator.yml up -d)
 *   - FIREBASE_AUTH_EMULATOR_HOST must be set to localhost:9099
 */

import admin from 'firebase-admin';

const DEFAULT_EMULATOR_PROJECT_ID = 'demo-mivialabs-project';

// Test users configuration
const TEST_USERS = [
  {
    email: 'admin@example.local',
    password: 'Admin123!',
    displayName: 'Admin User',
    emailVerified: true,
    disabled: false,
    customClaims: {
      roles: ['admin'],
      permissions: ['read:all', 'write:all', 'delete:all', 'manage:users'],
      tenantId: 'default'
    }
  },
  {
    email: 'user@example.local',
    password: 'User123!',
    displayName: 'Standard User',
    emailVerified: true,
    disabled: false,
    customClaims: {
      roles: ['user'],
      permissions: ['read:own', 'write:own'],
      tenantId: 'default'
    }
  },
  {
    email: 'moderator@example.local',
    password: 'Mod123!',
    displayName: 'Moderator User',
    emailVerified: true,
    disabled: false,
    customClaims: {
      roles: ['moderator'],
      permissions: ['read:all', 'write:all', 'moderate:content'],
      tenantId: 'default'
    }
  },
  {
    email: 'unverified@example.local',
    password: 'Unverified123!',
    displayName: 'Unverified User',
    emailVerified: false,
    disabled: false,
    customClaims: {
      roles: [],
      permissions: [],
      tenantId: 'default'
    }
  },
  {
    email: 'disabled@example.local',
    password: 'Disabled123!',
    displayName: 'Disabled User',
    emailVerified: true,
    disabled: true,
    customClaims: {
      roles: [],
      permissions: [],
      tenantId: 'default'
    }
  }
];

/**
 * Initialize Firebase Admin SDK with emulator configuration
 */
function initializeFirebase(): admin.app.App {
  // Ensure we're using the emulator
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.warn('Warning: FIREBASE_AUTH_EMULATOR_HOST is not set');
    console.warn('Setting to localhost:9099 for emulator');
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  }

  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT_ID ??
    process.env.GCP_PROJECT_ID ??
    process.env.FIREBASE_PROJECT_ID ??
    DEFAULT_EMULATOR_PROJECT_ID;

  // Keep env names aligned because the repo uses multiple GCP/Firebase naming conventions
  process.env.GOOGLE_CLOUD_PROJECT_ID = projectId;
  process.env.GCP_PROJECT_ID = projectId;
  process.env.FIREBASE_PROJECT_ID = projectId;

  // Initialize Firebase Admin with the emulator project ID
  const app = admin.initializeApp({
    projectId
  });

  console.log('Firebase Admin SDK initialized with emulator');
  console.log(`Emulator host: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
  console.log(`Project ID: ${projectId}`);

  return app;
}

/**
 * Create a test user with custom claims
 */
async function createTestUser(
  auth: admin.auth.Auth,
  userData: (typeof TEST_USERS)[0]
): Promise<admin.auth.UserRecord> {
  try {
    // Create user
    const userRecord = await auth.createUser({
      email: userData.email,
      password: userData.password,
      displayName: userData.displayName,
      emailVerified: userData.emailVerified,
      disabled: userData.disabled
    });

    console.log(`✓ Created user: ${userData.email} (UID: ${userRecord.uid})`);

    // Set custom claims (roles, permissions, tenant)
    if (userData.customClaims) {
      await auth.setCustomUserClaims(userRecord.uid, userData.customClaims);
      console.log(`  ✓ Set custom claims: ${JSON.stringify(userData.customClaims)}`);
    }

    return userRecord;
  } catch (error: any) {
    if (error.code === 'auth/email-already-exists') {
      console.log(`⚠ User already exists: ${userData.email}`);
      // Get existing user
      const userRecord = await auth.getUserByEmail(userData.email);
      // Update custom claims
      if (userData.customClaims) {
        await auth.setCustomUserClaims(userRecord.uid, userData.customClaims);
        console.log(`  ✓ Updated custom claims: ${JSON.stringify(userData.customClaims)}`);
      }
      return userRecord;
    }
    throw error;
  }
}

/**
 * List all users in the emulator
 */
async function listAllUsers(auth: admin.auth.Auth): Promise<void> {
  try {
    const listUsersResult = await auth.listUsers();
    console.log(`\nTotal users in emulator: ${listUsersResult.users.length}`);

    if (listUsersResult.users.length > 0) {
      console.log('\nExisting users:');
      listUsersResult.users.forEach((user) => {
        console.log(`  - ${user.email} (UID: ${user.uid}, Disabled: ${user.disabled})`);
      });
    }
  } catch (error) {
    console.error('Error listing users:', error);
  }
}

/**
 * Delete all test users (cleanup)
 */
async function deleteAllUsers(auth: admin.auth.Auth): Promise<void> {
  try {
    const listUsersResult = await auth.listUsers();

    if (listUsersResult.users.length === 0) {
      console.log('No users to delete');
      return;
    }

    console.log(`\nDeleting ${listUsersResult.users.length} users...`);

    const deletePromises = listUsersResult.users.map((user) =>
      auth.deleteUser(user.uid).then(() => {
        console.log(`✓ Deleted user: ${user.email} (UID: ${user.uid})`);
      })
    );

    await Promise.all(deletePromises);
    console.log('All users deleted');
  } catch (error) {
    console.error('Error deleting users:', error);
  }
}

/**
 * Main seeding function
 */
async function seedUsers(): Promise<void> {
  console.log('=== Firebase Auth Emulator - User Seed Script ===\n');

  // Initialize Firebase
  const app = initializeFirebase();
  const auth = app.auth();

  // Check for command line arguments
  const args = process.argv.slice(2);

  // Handle --cleanup flag
  if (args.includes('--cleanup') || args.includes('-c')) {
    console.log('Cleaning up all users...\n');
    await deleteAllUsers(auth);
    await app.delete();
    console.log('\n✓ Cleanup complete');
    return;
  }

  // Handle --list flag
  if (args.includes('--list') || args.includes('-l')) {
    console.log('Listing all users...\n');
    await listAllUsers(auth);
    await app.delete();
    return;
  }

  // List existing users
  await listAllUsers(auth);

  // Create test users
  console.log('\nCreating test users...\n');

  for (const userData of TEST_USERS) {
    try {
      await createTestUser(auth, userData);
    } catch (error: any) {
      console.error(`✗ Error creating user ${userData.email}:`, error.message);
    }
  }

  // Verify users were created
  console.log('\nVerifying users...\n');
  await listAllUsers(auth);

  // Cleanup
  await app.delete();

  console.log('\n=== Seeding complete ===');
  console.log('\nYou can now use these test accounts:');
  console.log('-----------------------------------');
  TEST_USERS.forEach((user) => {
    const status = user.disabled ? 'DISABLED' : user.emailVerified ? 'ACTIVE' : 'UNVERIFIED';
    console.log(`\n${user.displayName} (${status})`);
    console.log(`  Email:    ${user.email}`);
    console.log(`  Password: ${user.password}`);
    console.log(`  Roles:    ${user.customClaims.roles.join(', ') || 'none'}`);
  });
  console.log('\n-----------------------------------');
}

// Run the seed script
seedUsers().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
