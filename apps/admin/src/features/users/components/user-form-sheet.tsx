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
import { createEmployeeMutation } from "../api/mutations";
import { toast } from "sonner";
import { createEmployeeSchema, type CreateEmployeeFormValues } from "../schemas/user";
import { ROLE_OPTIONS } from "./users-table/options";

interface UserFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Create-only — no self-signup for platform staff (per AGENTS.md's Platform admin
// section, the admin sets the initial password and shares it out of band; there's no
// email-sending infrastructure anywhere in this repo to build a real invite-link flow
// on top of). Editing an existing employee's role/ban status happens via
// users-table/cell-action.tsx instead, not here.
export function UserFormSheet({ open, onOpenChange }: UserFormSheetProps) {
  const createMutation = useMutation({
    ...createEmployeeMutation,
    onSuccess: () => {
      toast.success("Employee added");
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => toast.error(error.message || "Failed to add employee"),
  });

  const form = useAppForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "support",
    } as CreateEmployeeFormValues,
    validators: { onSubmit: createEmployeeSchema },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync(value);
    },
  });

  const { FormTextField, FormSelectField } = useFormFields<CreateEmployeeFormValues>();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Add Employee</SheetTitle>
          <SheetDescription>
            Create a platform account for a team member. Share the password with them directly —
            there's no invite email yet.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto">
          <form.AppForm>
            <form.Form id="user-form-sheet" className="space-y-4">
              <FormTextField name="name" label="Name" required placeholder="Jane Doe" />

              <FormTextField
                name="email"
                label="Email"
                required
                type="email"
                autoComplete="off"
                placeholder="jane@example.com"
              />

              <FormTextField
                name="password"
                label="Password"
                required
                type="password"
                autoComplete="new-password"
                description="At least 8 characters. Share this with them directly."
              />

              <FormSelectField
                name="role"
                label="Role"
                required
                options={ROLE_OPTIONS}
                placeholder="Select role"
                description="Support can view users; Admin has full platform access."
              />
            </form.Form>
          </form.AppForm>
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="user-form-sheet" isLoading={createMutation.isPending}>
            <Icons.check /> Add Employee
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function UserFormSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className="mr-2 h-4 w-4" /> Add Employee
      </Button>
      <UserFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
