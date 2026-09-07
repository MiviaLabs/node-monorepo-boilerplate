import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ChangeMyPasswordDto } from '../change-my-password.dto';

describe('ChangeMyPasswordDto', () => {
  it('should pass with valid payload', async () => {
    const dto = plainToInstance(ChangeMyPasswordDto, {
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass123!'
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should trim password fields during transformation', async () => {
    const dto = plainToInstance(ChangeMyPasswordDto, {
      currentPassword: '  OldPass123!  ',
      newPassword: '  NewPass123!  '
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.currentPassword).toBe('OldPass123!');
    expect(dto.newPassword).toBe('NewPass123!');
  });

  it('should fail with weak new password', async () => {
    const dto = plainToInstance(ChangeMyPasswordDto, {
      currentPassword: 'OldPass123!',
      newPassword: 'weakpass'
    });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
  });
});
