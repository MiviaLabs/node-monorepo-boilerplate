import { ApiProperty } from '@nestjs/swagger';

import type { AuthResponse } from '../auth.types';

/**
 * Auth response DTO
 *
 * Response DTO for authentication operations
 */
export class AuthResponseDto {
  @ApiProperty({
    description: 'Access token (JWT)',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...'
  })
  declare accessToken: string;

  @ApiProperty({
    description: 'Refresh token',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...'
  })
  declare refreshToken: string;

  @ApiProperty({
    description: 'ID token (JWT)',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...'
  })
  declare idToken: string;

  @ApiProperty({
    description: 'Token expiration time (seconds)',
    example: 3600
  })
  declare expiresIn: number;

  @ApiProperty({
    description: 'Refresh token expiration time (seconds)',
    example: 1209600
  })
  declare refreshExpiresIn: number;

  @ApiProperty({
    description: 'User information',
    type: 'object',
    properties: {
      userId: { type: 'string' },
      username: { type: 'string' },
      email: { type: 'string' },
      emailVerified: { type: 'boolean' },
      roles: { type: 'array', items: { type: 'string' } },
      permissions: { type: 'array', items: { type: 'string' } },
      tenantId: { type: 'string' }
    },
    example: {
      userId: '123',
      username: 'user@example.com',
      email: 'user@example.com',
      emailVerified: true,
      roles: ['user'],
      permissions: [],
      tenantId: 'abc-123'
    }
  })
  declare user: {
    userId: string;
    username: string;
    email: string;
    emailVerified?: boolean;
    roles: string[];
    permissions: string[];
    tenantId: string;
  };

  @ApiProperty({
    description: 'Whether this is a new user registration',
    example: false
  })
  declare isNewUser: boolean;

  /**
   * Create from auth response
   */
  static fromAuthResponse(response: AuthResponse): AuthResponseDto {
    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      idToken: response.idToken,
      expiresIn: response.expiresIn,
      refreshExpiresIn: response.refreshExpiresIn,
      user: {
        userId: response.user.userId,
        username: response.user.username ?? '',
        email: response.user.email ?? '',
        ...(response.user.emailVerified !== undefined && {
          emailVerified: response.user.emailVerified
        }),
        roles: response.user.roles ?? [],
        permissions: response.user.permissions ?? [],
        tenantId: response.user.tenantId ?? ''
      },
      isNewUser: response.isNewUser
    };
  }
}
