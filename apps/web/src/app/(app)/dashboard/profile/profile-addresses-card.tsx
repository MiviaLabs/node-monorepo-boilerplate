'use client';

import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { AddressType, UserAddress } from '~/types/address.types';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { api } from '~/utils/api';

interface ProfileAddressesCardProps {
  userId: string;
  initialAddresses: UserAddress[];
}

const ADDRESS_TYPE_OPTIONS: Array<{ label: string; value: AddressType }> = [
  { label: 'Primary', value: 'primary' },
  { label: 'Billing', value: 'billing' },
  { label: 'Shipping', value: 'shipping' },
  { label: 'Office', value: 'office' }
];

interface AddressFormState {
  addressType: AddressType;
  label: string;
  countryCode: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

const DEFAULT_FORM: AddressFormState = {
  addressType: 'primary',
  label: '',
  countryCode: 'US',
  street: '',
  street2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  isDefault: false
};

function toComponents(form: AddressFormState) {
  return {
    street: form.street.trim() || undefined,
    street2: form.street2.trim() || undefined,
    city: form.city.trim() || undefined,
    state: form.state.trim() || undefined,
    postalCode: form.postalCode.trim() || undefined,
    country: form.country.trim() || undefined
  };
}

function toUpdateComponents(form: AddressFormState) {
  const normalize = (value: string): string => value.trim();
  return {
    street: normalize(form.street),
    street2: normalize(form.street2),
    city: normalize(form.city),
    state: normalize(form.state),
    postalCode: normalize(form.postalCode),
    country: normalize(form.country)
  };
}

function hasAnyComponent(components: ReturnType<typeof toComponents>): boolean {
  return Object.values(components).some((value) => Boolean(value && value.length > 0));
}

function typeLabel(type: AddressType): string {
  return ADDRESS_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function ProfileAddressesCard({ userId, initialAddresses }: ProfileAddressesCardProps) {
  const utils = api.useUtils();
  const [form, setForm] = useState<AddressFormState>(DEFAULT_FORM);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  const addressesQuery = api.addresses.getUserAddresses.useQuery(
    { userId },
    {
      initialData: initialAddresses,
      staleTime: 30_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false
    }
  );

  const createMutation = api.addresses.createUserAddress.useMutation({
    onSuccess: async () => {
      await utils.addresses.getUserAddresses.invalidate({ userId });
      toast.success('Address created');
      setForm(DEFAULT_FORM);
    },
    onError: (error) => {
      toast.error('Unable to create address', { description: error.message });
    }
  });

  const updateMutation = api.addresses.updateUserAddress.useMutation({
    onSuccess: async () => {
      await utils.addresses.getUserAddresses.invalidate({ userId });
      toast.success('Address updated');
      setEditingAddressId(null);
      setForm(DEFAULT_FORM);
    },
    onError: (error) => {
      toast.error('Unable to update address', { description: error.message });
    }
  });

  const deleteMutation = api.addresses.deleteUserAddress.useMutation({
    onSuccess: async () => {
      await utils.addresses.getUserAddresses.invalidate({ userId });
      toast.success('Address removed');
    },
    onError: (error) => {
      toast.error('Unable to remove address', { description: error.message });
    }
  });

  const setDefaultMutation = api.addresses.setDefaultAddress.useMutation({
    onSuccess: async () => {
      await utils.addresses.getUserAddresses.invalidate({ userId });
      toast.success('Default address updated');
    },
    onError: (error) => {
      toast.error('Unable to set default address', { description: error.message });
    }
  });

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    setDefaultMutation.isPending;

  const addresses = useMemo(() => addressesQuery.data ?? [], [addressesQuery.data]);

  const onSubmit = async () => {
    const components = toComponents(form);

    if (!editingAddressId && !hasAnyComponent(components)) {
      toast.error('Add at least one address component');
      return;
    }

    if (!/^[A-Z]{2}$/.test(form.countryCode.trim())) {
      toast.error('Country code must be a 2-letter ISO value (for example US)');
      return;
    }

    if (editingAddressId) {
      const hasMetadataUpdate =
        form.label.trim().length > 0 ||
        form.countryCode.trim().length > 0 ||
        form.isDefault ||
        form.addressType !== 'primary';

      if (!hasMetadataUpdate && !hasAnyComponent(components)) {
        toast.error('Provide at least one field to update');
        return;
      }

      await updateMutation.mutateAsync({
        userId,
        addressId: editingAddressId,
        addressType: form.addressType,
        isDefault: form.isDefault,
        label: form.label.trim() || undefined,
        countryCode: form.countryCode.trim().toUpperCase(),
        components: toUpdateComponents(form)
      });
      return;
    }

    await createMutation.mutateAsync({
      userId,
      addressType: form.addressType,
      isDefault: form.isDefault,
      label: form.label.trim() || undefined,
      countryCode: form.countryCode.trim().toUpperCase(),
      components
    });
  };

  const beginEdit = (address: UserAddress) => {
    setEditingAddressId(String(address.id));
    setForm({
      ...DEFAULT_FORM,
      addressType: address.addressType,
      label: address.label ?? '',
      countryCode: address.countryCode ?? 'US',
      street: address.components?.street ?? '',
      street2: address.components?.street2 ?? '',
      city: address.components?.city ?? '',
      state: address.components?.state ?? '',
      postalCode: address.components?.postalCode ?? '',
      country: address.components?.country ?? '',
      isDefault: address.isDefault
    });
  };

  return (
    <Card className={enterpriseCardVariants()}>
      <CardHeader>
        <CardTitle className="text-base">Address details</CardTitle>
        <CardDescription>
          Manage your personal addresses. Requests are sent through the Next.js tRPC route.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Address type</Label>
            <Select
              value={form.addressType}
              onValueChange={(value: AddressType) =>
                setForm((prev) => ({ ...prev, addressType: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ADDRESS_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address-label">Label</Label>
            <Input
              id="address-label"
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Home"
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country-code">Country code</Label>
            <Input
              id="country-code"
              value={form.countryCode}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, countryCode: event.target.value.toUpperCase() }))
              }
              maxLength={2}
              placeholder="US"
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="street">Street</Label>
            <Input
              id="street"
              value={form.street}
              onChange={(event) => setForm((prev) => ({ ...prev, street: event.target.value }))}
              placeholder="123 Main St"
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="street2">Street 2</Label>
            <Input
              id="street2"
              value={form.street2}
              onChange={(event) => setForm((prev) => ({ ...prev, street2: event.target.value }))}
              placeholder="Apt 4B"
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={form.city}
              onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
              placeholder="San Francisco"
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State / Province</Label>
            <Input
              id="state"
              value={form.state}
              onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
              placeholder="CA"
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">Postal code</Label>
            <Input
              id="postalCode"
              value={form.postalCode}
              onChange={(event) => setForm((prev) => ({ ...prev, postalCode: event.target.value }))}
              placeholder="94105"
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={form.country}
              onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
              placeholder="United States"
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void onSubmit()} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {editingAddressId ? 'Update address' : 'Add address'}
          </Button>
          {editingAddressId ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingAddressId(null);
                setForm(DEFAULT_FORM);
              }}
              disabled={isSaving}
            >
              Cancel edit
            </Button>
          ) : null}
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, isDefault: event.target.checked }))
              }
              disabled={isSaving}
            />
            Set as default
          </label>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Saved addresses</h4>
          {addressesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading addresses...</p>
          ) : addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No addresses saved yet.</p>
          ) : (
            <div className="space-y-2">
              {addresses.map((address) => (
                <div
                  key={address.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/30 px-3 py-2"
                >
                  <div className="flex min-w-[260px] items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {address.label?.trim().length
                        ? address.label.trim()
                        : typeLabel(address.addressType)}
                    </span>
                    <Badge variant="outline">{typeLabel(address.addressType)}</Badge>
                    {address.countryCode ? (
                      <Badge variant="secondary">{address.countryCode}</Badge>
                    ) : null}
                    {address.isDefault ? <Badge>Default</Badge> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => beginEdit(address)}
                      disabled={isSaving}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!address.isDefault ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void setDefaultMutation.mutateAsync({
                            userId,
                            addressId: String(address.id)
                          })
                        }
                        disabled={isSaving}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void deleteMutation.mutateAsync({
                          userId,
                          addressId: String(address.id)
                        })
                      }
                      disabled={isSaving}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
