"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import PageContainer from "@/components/layout/page-container";
import { useAppForm } from "@/components/ui/tanstack-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";
import { useSwitchOrganization } from "@/hooks/use-switch-organization";
import { createOrganization, describeOrganizationError } from "../api/service";
import {
  createOrganizationSchema,
  type CreateOrganizationValues,
} from "../schemas/create-organization.schema";

/**
 * Any signed-in user can start an organization and becomes its owner (Better Auth's
 * defaults: allowUserToCreateOrganization and organizationLimit unset — spec Open
 * question 1). Better Auth already makes the new org active; switching through
 * useSwitchOrganization as well is what clears the previous account's cached data.
 */
export function CreateOrganizationView() {
  const router = useRouter();
  const create = useMutation({ mutationFn: createOrganization });
  const switchTo = useSwitchOrganization();

  const form = useAppForm({
    defaultValues: { name: "" } as CreateOrganizationValues,
    validators: { onSubmit: createOrganizationSchema },
    onSubmit: async ({ value }) => {
      try {
        const organization = await create.mutateAsync({ name: value.name.trim() });
        await switchTo.mutateAsync(organization.id);
        router.push("/team");
      } catch {
        // Surfaced via create.error / switchTo.error below.
      }
    },
  });

  return (
    <PageContainer
      pageTitle="Create an organization"
      pageDescription="Start a team to invite people and share a plan. You'll be its owner."
    >
      <div className="bg-card w-full max-w-xl rounded-xl border p-6">
        <form.AppForm>
          <form.Form className="mx-0 w-full gap-4 p-0 md:p-0" id="create-organization-form">
            {create.error && (
              <Alert variant="destructive">
                <Icons.alertCircle className="size-4" />
                <AlertDescription>{describeOrganizationError(create.error)}</AlertDescription>
              </Alert>
            )}
            {switchTo.error && (
              <Alert variant="destructive">
                <Icons.alertCircle className="size-4" />
                <AlertTitle>Organization created</AlertTitle>
                <AlertDescription>
                  We couldn&apos;t open it automatically. Choose it from the account switcher.
                </AlertDescription>
              </Alert>
            )}
            <form.TextField
              name="name"
              label="Organization name"
              autoComplete="organization"
              placeholder="Acme Inc."
            />
            <div className="flex justify-end">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <form.SubmitButton>
                    {isSubmitting ? "Creating…" : "Create organization"}
                  </form.SubmitButton>
                )}
              </form.Subscribe>
            </div>
          </form.Form>
        </form.AppForm>
      </div>
    </PageContainer>
  );
}
