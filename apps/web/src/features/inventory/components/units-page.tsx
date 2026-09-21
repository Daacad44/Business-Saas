"use client";

import type { UnitSummary } from "@daljir/types";
import { createUnitSchema, updateUnitSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { applyFieldErrors, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useCreateUnit, useDeleteUnit, useUnits, useUpdateUnit } from "@/features/inventory/hooks";

type UnitFormValues = { name: string; symbol: string };

function UnitFormModal({
  open,
  onClose,
  unit,
}: {
  open: boolean;
  onClose: () => void;
  unit: UnitSummary | null;
}) {
  const t = useTranslations("units");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const isEdit = Boolean(unit);
  const pending = createUnit.isPending || updateUnit.isPending;

  const form = useForm<UnitFormValues>({
    resolver: withBlankAsUndefined(
      zodResolver(isEdit ? updateUnitSchema : createUnitSchema) as Resolver<UnitFormValues>,
    ),
    defaultValues: { name: unit?.name ?? "", symbol: unit?.symbol ?? "" },
  });

  React.useEffect(() => {
    form.reset({ name: unit?.name ?? "", symbol: unit?.symbol ?? "" });
  }, [unit, form]);

  async function onSubmit(values: UnitFormValues) {
    try {
      if (isEdit && unit) {
        await updateUnit.mutateAsync({ id: unit.id, input: values });
        toast({ title: t("updated"), variant: "success" });
      } else {
        await createUnit.mutateAsync(values);
        toast({ title: t("created"), variant: "success" });
      }
      onClose();
      form.reset();
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) {
        toast({ title: userFacingError(error, tc("error"), tc("forbidden")), variant: "error" });
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t("editTitle") : t("createTitle")}
      preventClose={pending}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="unit-form" disabled={pending || form.formState.isSubmitting}>
            {isEdit ? tc("save") : tc("create")}
          </Button>
        </>
      }
    >
      <form id="unit-form" className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <TextField
          label={t("name")}
          required
          {...form.register("name")}
          error={form.formState.errors.name?.message}
        />
        <TextField
          label={t("symbol")}
          required
          {...form.register("symbol")}
          error={form.formState.errors.symbol?.message}
        />
      </form>
    </Modal>
  );
}

export function UnitsPage() {
  const t = useTranslations("units");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canCreate = useHasPermission("inventory.create");

  const units = useUnits();
  const deleteUnit = useDeleteUnit();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingUnit, setEditingUnit] = React.useState<UnitSummary | null>(null);
  const [deletingUnit, setDeletingUnit] = React.useState<UnitSummary | null>(null);
  const [deleteError, setDeleteError] = React.useState<string>();

  function openCreate() {
    setEditingUnit(null);
    setFormOpen(true);
  }

  function openEdit(unit: UnitSummary) {
    setEditingUnit(unit);
    setFormOpen(true);
  }

  function openDelete(unit: UnitSummary) {
    setDeleteError(undefined);
    setDeletingUnit(unit);
  }

  async function confirmDelete() {
    if (!deletingUnit) return;
    try {
      await deleteUnit.mutateAsync(deletingUnit.id);
      toast({ title: t("deleted"), variant: "success" });
      setDeletingUnit(null);
    } catch (error) {
      setDeleteError(userFacingError(error, t("inUse"), tc("forbidden")));
    }
  }

  const columns: DataTableColumn<UnitSummary>[] = [
    { id: "name", header: t("name"), accessor: (row) => row.name },
    { id: "symbol", header: t("symbol"), accessor: (row) => row.symbol },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canCreate ? <Button onClick={openCreate}>{t("addUnit")}</Button> : null}
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={units.data ?? []}
          getRowId={(row) => row.id}
          isLoading={units.isLoading}
          error={units.isError ? userFacingError(units.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => units.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
          rowActions={
            canCreate
              ? (row) => (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                      {tc("edit")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openDelete(row)}>
                      {tc("delete")}
                    </Button>
                  </div>
                )
              : undefined
          }
        />
      </div>

      <UnitFormModal open={formOpen} onClose={() => setFormOpen(false)} unit={editingUnit} />

      <ConfirmDialog
        open={Boolean(deletingUnit)}
        onClose={() => setDeletingUnit(null)}
        onConfirm={confirmDelete}
        title={t("deleteTitle")}
        description={deleteError ?? t("deleteBody", { name: deletingUnit?.name ?? "" })}
        destructive
        pending={deleteUnit.isPending}
      />
    </div>
  );
}
