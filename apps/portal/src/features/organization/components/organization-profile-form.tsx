"use client";

import { useLayoutEffect, useRef } from "react";
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
  // The last saved profile — the baseline a save is diffed against. A ref, since the form's
  // onSubmit is created once while `profile` updates after every save. Updated after commit,
  // not during render, so a render React discards can never change the baseline.
  const saved = useRef(profile);
  useLayoutEffect(() => {
    saved.current = profile;
  }, [profile]);
  const save = useMutation({
    mutationFn: (update: OrganizationProfileUpdate) =>
      Object.keys(update).length === 0
        ? Promise.resolve(saved.current)
        : updateOrganizationProfile(update),
    onSuccess: (updated) =>
      queryClient.setQueryData(organizationKeys.profile(organizationId), updated),
  });

  const form = useAppForm({
    defaultValues: toProfileFormValues(profile),
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
