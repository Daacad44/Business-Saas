"use client";

import { createCustomerNoteSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TextareaField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api-errors";
import { useCreateNote, useCustomerNotes } from "@/features/customers/hooks";

export function CustomerNotesTab({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { toast } = useToast();

  const notes = useCustomerNotes(customerId);
  const createNote = useCreateNote();

  const form = useForm<{ note: string }>({
    resolver: zodResolver(createCustomerNoteSchema),
    defaultValues: { note: "" },
  });

  async function onSubmit(values: { note: string }) {
    try {
      await createNote.mutateAsync({ customerId, input: values });
      toast({ title: t("noteAdded"), variant: "success" });
      form.reset();
    } catch (error) {
      toast({ title: errorMessage(error, tc("error")), variant: "error" });
    }
  }

  return (
    <div>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={form.handleSubmit(onSubmit)}>
        <TextareaField
          label={t("newNote")}
          wrapperClassName="flex-1"
          {...form.register("note")}
          error={form.formState.errors.note?.message}
        />
        <Button type="submit" disabled={createNote.isPending}>
          {t("addNote")}
        </Button>
      </form>

      <div className="mt-4">
        {notes.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : notes.isError ? (
          <ErrorState description={errorMessage(notes.error, tc("error"))} onRetry={() => notes.refetch()} />
        ) : (notes.data ?? []).length === 0 ? (
          <EmptyState title={t("noNotes")} />
        ) : (
          <ul className="space-y-3">
            {(notes.data ?? []).map((note) => (
              <li key={note.id} className="rounded-2xl border border-line p-4">
                <p className="text-sm text-ink">{note.note}</p>
                <p className="mt-1 text-xs text-muted">{formatDateTime(note.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
