"use client";

import { useState } from "react";
import { useAppForm, useFormFields } from "@/components/ui/tanstack-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Icons } from "@/components/icons";
import { useMutation } from "@tanstack/react-query";
import { createPlatformOrganizationMutation } from "../api/mutations";
import { toast } from "sonner";
import {
  createPlatformOrganizationSchema,
  type CreatePlatformOrganizationFormValues,
} from "../schemas/organization";

interface OrganizationFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Provisions a brand-new owner account for a company that doesn't have one yet — not
// an "attach existing user" flow. Mirrors features/users' "Add Employee" sheet: the
// admin sets the owner's password here and shares it with the company out of band,
// there's no invite-email flow anywhere in this repo to build on top of.
export function OrganizationFormSheet({ open, onOpenChange }: OrganizationFormSheetProps) {
  const createMutation = useMutation({
    ...createPlatformOrganizationMutation,
    onSuccess: () => {
      toast.success("Organization created");
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => toast.error(error.message || "Failed to create organization"),
  });

  const form = useAppForm({
    defaultValues: {
      organizationName: "",
      organizationSlug: "",
      ownerName: "",
      ownerEmail: "",
      ownerPassword: "",
    } as CreatePlatformOrganizationFormValues,
    validators: { onSubmit: createPlatformOrganizationSchema },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync(value);
    },
  });

  const { FormTextField } = useFormFields<CreatePlatformOrganizationFormValues>();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Create Organization</SheetTitle>
          <SheetDescription>
            Provisions a new organization and its owner account. Share the password with the company
            directly — there's no invite email yet.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto">
          <form.AppForm>
            <form.Form id="organization-form-sheet" className="space-y-4">
              <FormTextField
                name="organizationName"
                label="Organization Name"
                required
                placeholder="Acme Inc"
              />

              <FormTextField
                name="organizationSlug"
                label="Organization Slug"
                required
                placeholder="acme-inc"
                description="Lowercase letters, numbers, and hyphens only."
              />

              <FormTextField name="ownerName" label="Owner Name" required placeholder="Jane Doe" />

              <FormTextField
                name="ownerEmail"
                label="Owner Email"
                required
                type="email"
                autoComplete="off"
                placeholder="jane@acme.com"
              />

              <FormTextField
                name="ownerPassword"
                label="Owner Password"
                required
                type="password"
                autoComplete="new-password"
                description="At least 8 characters. Share this with the owner directly."
              />
            </form.Form>
          </form.AppForm>
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="organization-form-sheet" isLoading={createMutation.isPending}>
            <Icons.check /> Create Organization
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function OrganizationFormSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className="mr-2 h-4 w-4" /> Create Organization
      </Button>
      <OrganizationFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
