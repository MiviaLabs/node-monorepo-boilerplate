import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateMyProfileDto } from '../update-my-profile.dto';

describe('UpdateMyProfileDto', () => {
  it('should pass with a valid displayName', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, { displayName: 'Jane Doe' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should trim displayName during transformation', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, { displayName: '  Jane Doe  ' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.displayName).toBe('Jane Doe');
  });

  it('should fail when displayName is too short after trim', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, { displayName: ' a ' });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass with valid phoneNumber only', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, { phoneNumber: '+14155552671' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should trim phoneNumber during transformation', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, { phoneNumber: '  +14155552671  ' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.phoneNumber).toBe('+14155552671');
  });

  it('should allow an empty phoneNumber to clear the current value', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, { phoneNumber: '   ' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.phoneNumber).toBe('');
  });

  it('should fail with invalid phoneNumber format', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, { phoneNumber: '4155552671' });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
