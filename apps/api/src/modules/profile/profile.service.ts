import { withUserScope } from "@repo/db";
import { getProfileByUserId, ensureProfileRow, updateProfileByUserId } from "./profile.db";
import type { UpdateProfileRequest } from "./profile.schema";

export interface ProfileView {
  phone: string | null;
  dateOfBirth: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
}

function toDateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function toView(row: Awaited<ReturnType<typeof getProfileByUserId>>): ProfileView {
  return {
    phone: row?.phone ?? null,
    dateOfBirth: toDateOnly(row?.dateOfBirth ?? null),
    address: {
      street: row?.addressStreet ?? null,
      city: row?.addressCity ?? null,
      state: row?.addressState ?? null,
      postalCode: row?.addressPostalCode ?? null,
      country: row?.addressCountry ?? null,
    },
  };
}

export async function getProfile(userId: string): Promise<ProfileView> {
  const row = await withUserScope(userId, (tx) => getProfileByUserId(tx, userId));
  return toView(row);
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileRequest,
): Promise<ProfileView> {
  const row = await withUserScope(userId, async (tx) => {
    await ensureProfileRow(tx, userId);
    await updateProfileByUserId(tx, userId, {
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.dateOfBirth !== undefined && { dateOfBirth: input.dateOfBirth }),
      ...(input.address?.street !== undefined && { addressStreet: input.address.street }),
      ...(input.address?.city !== undefined && { addressCity: input.address.city }),
      ...(input.address?.state !== undefined && { addressState: input.address.state }),
      ...(input.address?.postalCode !== undefined && {
        addressPostalCode: input.address.postalCode,
      }),
      ...(input.address?.country !== undefined && { addressCountry: input.address.country }),
    });
    return getProfileByUserId(tx, userId);
  });

  return toView(row);
}
