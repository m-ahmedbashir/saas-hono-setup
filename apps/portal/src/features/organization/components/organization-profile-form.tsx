"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppForm } from "@/components/ui/tanstack-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DetailField } from "@/components/detail-field";
import { Icons } from "@/components/icons";
import {
  type OrganizationProfile,
  type OrganizationProfileUpdate,
  updateOrganizationProfile,
} from "../api/service";
import { organizationKeys } from "../api/queries";
import {
  organizationProfileSchema,
  toProfileFormValues,
  toProfileUpdate,
} from "../schemas/organization-profile.schema";

export function OrganizationProfileForm({
  organizationId,
  profile,
}: {
  organizationId: string;
  profile: OrganizationProfile;
}) {
  const queryClient = useQueryClient();
  // What this form's values started from: the profile it was opened with, then whatever
  // its own last save returned. Deliberately not the live `profile` prop — a background
  // refetch can bring in another admin's change while this form still holds the old value,
  // and diffing against that would send the stale value back over theirs. The form's
  // defaultValues are frozen to the same snapshot: TanStack Form adopts changed
  // defaultValues into an untouched form (form-core 1.33.2 FormApi.js), which would let the
  // fields and this baseline drift apart.
  const saved = useRef(profile);
  const [initialValues] = useState(() => toProfileFormValues(profile));
  const save = useMutation({
    // Nothing changed → no request, and nothing written to the cache (writing the baseline
    // back could overwrite a fresher profile a background refetch already brought in).
    mutationFn: async (update: OrganizationProfileUpdate) =>
      Object.keys(update).length === 0 ? null : updateOrganizationProfile(update),
    onSuccess: (updated) => {
      if (!updated) return;
      saved.current = updated;
      queryClient.setQueryData(organizationKeys.profile(organizationId), updated);
    },
  });

  const form = useAppForm({
    defaultValues: initialValues,
    validators: { onSubmit: organizationProfileSchema },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync(toProfileUpdate(value, saved.current));
      } catch {
        // Surfaced via save.error below.
      }
    },
  });

  return (
    <form.AppForm>
      <form.Form className="mx-0 w-full gap-4 p-0 md:p-0" id="organization-profile-form">
        {save.error && (
          <Alert variant="destructive">
            <Icons.alertCircle className="size-4" />
            <AlertTitle>Update failed</AlertTitle>
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        )}
        {save.isSuccess && (
          <Alert>
            <Icons.check className="size-4" />
            <AlertTitle>Profile updated</AlertTitle>
          </Alert>
        )}
        {/* System-generated and permanent — shown, never editable, never sent. */}
        <dl>
          <DetailField label="Organization number" value={profile.orgNumber} mono />
        </dl>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.TextField name="industry" label="Industry" />
          <form.TextField name="companySize" label="Company size" placeholder="e.g. 11–50" />
          <form.TextField
            name="website"
            label="Website"
            type="url"
            inputMode="url"
            placeholder="https://example.com"
          />
          <form.TextField name="phone" label="Phone" type="tel" autoComplete="tel" />
          <form.TextField name="taxId" label="Tax ID" />
        </div>
        <form.TextareaField name="description" label="Description" maxLength={2000} />
        <div className="grid gap-4 sm:grid-cols-2">
          <form.TextField name="addressStreet" label="Street" autoComplete="street-address" />
          <form.TextField name="addressCity" label="City" autoComplete="address-level2" />
          <form.TextField
            name="addressState"
            label="State / region"
            autoComplete="address-level1"
          />
          <form.TextField name="addressPostalCode" label="Postal code" autoComplete="postal-code" />
          <form.TextField
            name="addressCountry"
            label="Country"
            autoComplete="country"
            placeholder="US"
            maxLength={2}
          />
        </div>
        <div className="flex justify-end">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <form.SubmitButton>{isSubmitting ? "Saving…" : "Save profile"}</form.SubmitButton>
            )}
          </form.Subscribe>
        </div>
      </form.Form>
    </form.AppForm>
  );
}

const isWebAddress = (value: string | null) => !!value && /^https?:\/\//i.test(value);

/** What a member without organizationProfile:manage sees — the same fields, as text. */
export function OrganizationProfileDetails({ profile }: { profile: OrganizationProfile }) {
  const { address } = profile;
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <DetailField label="Organization number" value={profile.orgNumber} mono />
      <DetailField label="Industry" value={profile.industry} />
      <DetailField label="Company size" value={profile.companySize} />
      {/* Linked only when it's an http(s) address — never render another scheme as a link. */}
      <DetailField label="Website" value={profile.website} link={isWebAddress(profile.website)} />
      <DetailField label="Phone" value={profile.phone} />
      <DetailField label="Tax ID" value={profile.taxId} />
      <DetailField label="Description" value={profile.description} />
      <DetailField label="Street" value={address.street} />
      <DetailField label="City" value={address.city} />
      <DetailField label="State / region" value={address.state} />
      <DetailField label="Postal code" value={address.postalCode} />
      <DetailField label="Country" value={address.country} />
    </dl>
  );
}
