"use client";

import { useState, type ComponentType } from "react";
import { useStore } from "@tanstack/react-form";
import { Input } from "@/components/ui/input";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  useFieldContext,
  FormFieldSet,
  FormField,
  FormFieldError,
  createFormField,
} from "@/components/ui/form-context";
import { Spinner } from "@/components/ui/spinner";
import { Icons } from "@/components/icons";

interface TextFieldProps extends Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "onBlur"
> {
  label: string;
  description?: string;
  required?: boolean;
  type?: "text" | "email" | "password" | "tel" | "url" | "number";
  /** Leading icon (e.g. `Icons.mail`). Switches the field to the `InputGroup` layout —
   * plain fields without an icon keep the original bare `Input` markup unchanged. */
  icon?: ComponentType<{ className?: string }>;
  /** Extra content rendered to the right of the label, e.g. a "Forgot password?" link.
   * Generic on purpose — not specific to any one field. */
  labelSuffix?: React.ReactNode;
}

export function TextField({
  label,
  description,
  required,
  type = "text",
  className,
  icon: Icon,
  labelSuffix,
  ...inputProps
}: TextFieldProps) {
  const field = useFieldContext();
  const isTouched = useStore(field.store, (s) => s.meta.isTouched);
  const isValid = useStore(field.store, (s) => s.meta.isValid);
  const isValidating = useStore(field.store, (s) => s.meta.isValidating);
  const value = useStore(field.store, (s) => s.value) as string | number;
  const [passwordVisible, setPasswordVisible] = useState(false);
  const invalid = isTouched && !isValid;
  const isPassword = type === "password";
  // Icon and/or password-visibility toggle both need the InputGroup layout instead of
  // a bare Input; neither alone should force it on every other text field in the app.
  const useInputGroup = Icon !== undefined || isPassword;

  const handleChange = (rawValue: string) => {
    if (type === "number") {
      field.handleChange(rawValue === "" ? "" : parseFloat(rawValue));
    } else {
      field.handleChange(rawValue);
    }
  };

  return (
    <FormFieldSet>
      <FormField>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor={field.name}>
            {label}
            {required && " *"}
          </FieldLabel>
          {labelSuffix}
        </div>
        {useInputGroup ? (
          <InputGroup>
            {Icon && (
              <InputGroupAddon>
                <Icon className="size-4" />
              </InputGroupAddon>
            )}
            <InputGroupInput
              id={field.name}
              type={isPassword && passwordVisible ? "text" : type}
              value={value ?? ""}
              onBlur={field.handleBlur}
              onChange={(e) => handleChange(e.target.value)}
              aria-invalid={invalid}
              className={className}
              {...inputProps}
            />
            {isPassword && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  onClick={() => setPasswordVisible((v) => !v)}
                >
                  {passwordVisible ? <Icons.eyeOff /> : <Icons.eye />}
                </InputGroupButton>
              </InputGroupAddon>
            )}
            {isValidating && (
              <InputGroupAddon align="inline-end">
                <Spinner className="h-4 w-4" />
              </InputGroupAddon>
            )}
          </InputGroup>
        ) : (
          <div className="relative">
            <Input
              id={field.name}
              type={type}
              value={value ?? ""}
              onBlur={field.handleBlur}
              onChange={(e) => handleChange(e.target.value)}
              aria-invalid={invalid}
              className={className}
              {...inputProps}
            />
            {isValidating && (
              <div className="absolute top-1/2 right-3 -translate-y-1/2">
                <Spinner className="h-4 w-4" />
              </div>
            )}
          </div>
        )}
        {description && <FieldDescription>{description}</FieldDescription>}
      </FormField>
      <FormFieldError />
    </FormFieldSet>
  );
}

export const FormTextField = createFormField(TextField);
