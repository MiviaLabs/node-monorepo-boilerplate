/**
 * User Address Types
 *
 * Web-layer address metadata and input contracts for profile address management.
 */

export const ADDRESS_TYPES = ['primary', 'billing', 'shipping', 'office'] as const;

export type AddressType = (typeof ADDRESS_TYPES)[number];

export interface UserAddress {
  id: number;
  organizationId: number;
  userId: number;
  addressType: AddressType;
  label: string | null;
  countryCode: string | null;
  isDefault: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  components?: AddressComponentsInput;
}

export interface AddressComponentsInput {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CreateUserAddressInput {
  userId: string;
  addressType: AddressType;
  isDefault?: boolean;
  label?: string;
  countryCode: string;
  components: AddressComponentsInput;
}

export interface UpdateUserAddressInput {
  userId: string;
  addressId: string;
  addressType?: AddressType;
  isDefault?: boolean;
  label?: string;
  countryCode?: string;
  components?: AddressComponentsInput;
}
