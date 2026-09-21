import * as React from "react";
import { cn } from "@/lib/utils";
import { Input, Label, Select, Textarea } from "./form";

interface FieldChromeProps {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  descriptionId: string;
  errorId: string;
}

function FieldChrome({ id, label, description, error, required, descriptionId, errorId, children }: FieldChromeProps & { children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-copper">*</span> : null}
      </Label>
      {children}
      {description && !error ? (
        <p id={descriptionId} className="mt-1.5 text-xs text-muted">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function useFieldIds(providedId: string | undefined, name: string | undefined) {
  const generated = React.useId();
  const id = providedId ?? name ?? generated;
  return { id, descriptionId: `${id}-description`, errorId: `${id}-error` };
}

function describedBy(hasDescription: boolean, hasError: boolean, descriptionId: string, errorId: string) {
  const ids = [hasError ? errorId : null, !hasError && hasDescription ? descriptionId : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id?: string;
  label: string;
  description?: string;
  error?: string;
  wrapperClassName?: string;
}

export function TextField({ id, label, description, error, required, className, wrapperClassName, name, ...props }: TextFieldProps) {
  const ids = useFieldIds(id, name);
  return (
    <div className={wrapperClassName}>
      <FieldChrome {...ids} label={label} description={description} error={error} required={required}>
        <Input
          id={ids.id}
          name={name}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(Boolean(description), Boolean(error), ids.descriptionId, ids.errorId)}
          className={className}
          {...props}
        />
      </FieldChrome>
    </div>
  );
}

export interface NumberFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  id?: string;
  label: string;
  description?: string;
  error?: string;
  wrapperClassName?: string;
  /** "money" restricts input to 2 decimal places and uses currency-friendly keyboard; "quantity" allows more precision. */
  kind?: "money" | "quantity" | "integer";
}

export function NumberField({
  id,
  label,
  description,
  error,
  required,
  className,
  wrapperClassName,
  name,
  kind = "quantity",
  ...props
}: NumberFieldProps) {
  const ids = useFieldIds(id, name);
  const step = kind === "money" ? "0.01" : kind === "integer" ? "1" : "any";
  return (
    <div className={wrapperClassName}>
      <FieldChrome {...ids} label={label} description={description} error={error} required={required}>
        <Input
          id={ids.id}
          name={name}
          type="number"
          inputMode={kind === "integer" ? "numeric" : "decimal"}
          step={step}
          min={kind === "money" || kind === "quantity" ? 0 : undefined}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(Boolean(description), Boolean(error), ids.descriptionId, ids.errorId)}
          className={className}
          {...props}
        />
      </FieldChrome>
    </div>
  );
}

export interface SelectFieldProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id?: string;
  label: string;
  description?: string;
  error?: string;
  wrapperClassName?: string;
}

export function SelectField({ id, label, description, error, required, className, wrapperClassName, name, children, ...props }: SelectFieldProps) {
  const ids = useFieldIds(id, name);
  return (
    <div className={wrapperClassName}>
      <FieldChrome {...ids} label={label} description={description} error={error} required={required}>
        <Select
          id={ids.id}
          name={name}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(Boolean(description), Boolean(error), ids.descriptionId, ids.errorId)}
          className={className}
          {...props}
        >
          {children}
        </Select>
      </FieldChrome>
    </div>
  );
}

export interface TextareaFieldProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id?: string;
  label: string;
  description?: string;
  error?: string;
  wrapperClassName?: string;
}

export function TextareaField({ id, label, description, error, required, className, wrapperClassName, name, ...props }: TextareaFieldProps) {
  const ids = useFieldIds(id, name);
  return (
    <div className={wrapperClassName}>
      <FieldChrome {...ids} label={label} description={description} error={error} required={required}>
        <Textarea
          id={ids.id}
          name={name}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(Boolean(description), Boolean(error), ids.descriptionId, ids.errorId)}
          className={className}
          {...props}
        />
      </FieldChrome>
    </div>
  );
}

export interface DateFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  id?: string;
  label: string;
  description?: string;
  error?: string;
  wrapperClassName?: string;
  includeTime?: boolean;
}

export function DateField({
  id,
  label,
  description,
  error,
  required,
  className,
  wrapperClassName,
  name,
  includeTime,
  ...props
}: DateFieldProps) {
  const ids = useFieldIds(id, name);
  return (
    <div className={wrapperClassName}>
      <FieldChrome {...ids} label={label} description={description} error={error} required={required}>
        <Input
          id={ids.id}
          name={name}
          type={includeTime ? "datetime-local" : "date"}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(Boolean(description), Boolean(error), ids.descriptionId, ids.errorId)}
          className={cn(className)}
          {...props}
        />
      </FieldChrome>
    </div>
  );
}
