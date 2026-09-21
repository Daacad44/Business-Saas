"use client";

import type { CustomerSummary, ProductSummary, ProductVariantSummary, SaleType } from "@daljir/types";
import { createSaleSchema } from "@daljir/validation";
import { useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Card } from "@/components/ui/form";
import { DateField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { listProductVariants } from "@/features/inventory/api";
import { inventoryKeys, useBranches, useWarehouses } from "@/features/inventory/hooks";
import { ProductPicker } from "@/features/shared/product-picker";
import { saleErrorMessage } from "@/features/sales/lib/sale-error-message";
import { useCreateSale } from "@/features/sales/hooks";
import { formatMoney, formatQuantity } from "@/lib/format";
import { isNonNegativeDecimal, isPositiveDecimal, userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { cartLineKey, incrementQuantity, type CartLine } from "../lib/cart";
import { previewCartTotals } from "../lib/cart-totals";
import { decimalStringToJsonNumber } from "../lib/decimal-math";
import { warehouseBranchId } from "../lib/locations";
import { CustomerPicker } from "./customer-picker";
import { VariantPickerModal } from "./variant-picker-modal";

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function PosPage() {
  const t = useTranslations("pos");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const canCreate = useHasPermission("sales.create");

  const branches = useBranches();
  const warehouses = useWarehouses();
  const createSale = useCreateSale();
  const queryClient = useQueryClient();

  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [orderDiscount, setOrderDiscount] = React.useState("0.00");
  const [notes, setNotes] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [warehouseId, setWarehouseId] = React.useState("");
  const [saleType, setSaleType] = React.useState<SaleType>("CASH");
  const [customer, setCustomer] = React.useState<CustomerSummary | null>(null);
  const [dueDate, setDueDate] = React.useState(defaultDueDate);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = React.useState<ProductSummary | null>(null);
  const [variantOptions, setVariantOptions] = React.useState<ProductVariantSummary[] | null>(null);
  const [variantError, setVariantError] = React.useState<unknown>(null);
  const [variantLoading, setVariantLoading] = React.useState(false);
  const [submitLocked, setSubmitLocked] = React.useState(false);
  const lastQtyRef = React.useRef<HTMLInputElement | null>(null);

  const defaultBranch = (branches.data ?? []).find((branch) => branch.isDefault) ?? branches.data?.[0];
  const effectiveBranchId = branchId || defaultBranch?.id || "";
  const warehousesForBranch = (warehouses.data ?? []).filter((warehouse) => {
    if (!effectiveBranchId) return true;
    const parent = warehouseBranchId(warehouse);
    return parent === null || parent === effectiveBranchId;
  });
  const defaultWarehouse = warehousesForBranch.find((warehouse) => warehouse.isDefault) ?? warehousesForBranch[0];
  const effectiveWarehouseId = warehouseId || defaultWarehouse?.id || "";

  const preview = previewCartTotals(lines, orderDiscount);

  function addProduct(product: ProductSummary, variant?: ProductVariantSummary) {
    const variantId = variant?.id ?? null;
    const key = cartLineKey(product.id, variantId);
    const unitPrice = variant?.sellingPrice ?? product.sellingPrice;
    setLines((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key ? { ...line, quantity: incrementQuantity(line.quantity) } : line,
        );
      }
      return [
        ...current,
        {
          key,
          productId: product.id,
          variantId,
          productName: product.name,
          variantName: variant?.name ?? null,
          sku: variant?.sku ?? product.sku,
          unitPrice,
          taxRate: product.taxRate,
          quantity: "1.000",
          discountAmount: "0.00",
        },
      ];
    });
    setFormError(null);
  }

  async function onPickerSelect(product: ProductSummary) {
    if (!product.hasVariants) {
      addProduct(product);
      return;
    }
    setPendingProduct(product);
    setVariantOptions(null);
    setVariantError(null);
    setVariantLoading(true);
    try {
      const variants = await queryClient.fetchQuery({
        queryKey: inventoryKeys.productVariants(product.id),
        queryFn: () => listProductVariants(product.id),
      });
      const active = variants.filter((variant) => variant.status === "ACTIVE");
      if (active.length <= 1) {
        addProduct(product, active[0]);
        setPendingProduct(null);
        setVariantOptions(null);
      } else {
        setVariantOptions(active);
      }
    } catch (error) {
      setVariantError(error);
    } finally {
      setVariantLoading(false);
    }
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function buildPayload() {
    return {
      branchId: effectiveBranchId,
      warehouseId: effectiveWarehouseId,
      customerId: customer?.id,
      type: saleType,
      items: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId ?? undefined,
        quantity: decimalStringToJsonNumber(line.quantity),
        unitPrice: decimalStringToJsonNumber(line.unitPrice),
        discountAmount: decimalStringToJsonNumber(line.discountAmount),
        taxAmount: 0,
      })),
      discountAmount: decimalStringToJsonNumber(orderDiscount),
      notes: notes.trim() || undefined,
      dueDate: saleType === "CREDIT" ? new Date(`${dueDate}T00:00:00`) : undefined,
    };
  }

  function validateCart(): string | null {
    if (!canCreate) return tc("forbidden");
    if (lines.length === 0) return t("emptyCart");
    if (!effectiveBranchId) return t("branchRequired");
    if (!effectiveWarehouseId) return t("warehouseRequired");
    if (saleType === "CREDIT" && !customer) return t("customerRequiredCredit");
    if (saleType === "CREDIT" && !dueDate) return t("dueDateRequired");
    for (const line of lines) {
      if (!isPositiveDecimal(line.quantity)) return t("invalidQuantity");
      if (!isNonNegativeDecimal(line.discountAmount)) return t("invalidDiscount");
    }
    if (!isNonNegativeDecimal(orderDiscount)) return t("invalidDiscount");
    const parsed = createSaleSchema.safeParse(buildPayload());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return first?.message ?? t("invalidCart");
    }
    return null;
  }

  function requestCheckout() {
    const message = validateCart();
    if (message) {
      setFormError(message);
      toast({ title: message, variant: "error" });
      return;
    }
    setFormError(null);
    setConfirmOpen(true);
  }

  async function confirmSale() {
    if (submitLocked || createSale.isPending) return;
    setSubmitLocked(true);
    const message = validateCart();
    if (message) {
      setSubmitLocked(false);
      setFormError(message);
      setConfirmOpen(false);
      toast({ title: message, variant: "error" });
      return;
    }
    try {
      const result = await createSale.mutateAsync(buildPayload());
      toast({ title: t("saleCompleted"), variant: "success" });
      setConfirmOpen(false);
      router.push(`/sales/${result.id}/receipt?created=1`);
    } catch (error) {
      setSubmitLocked(false);
      const description = saleErrorMessage(error, (key) => t(key), tc("error"), tc("forbidden"));
      setFormError(description);
      toast({ title: description, variant: "error" });
    }
  }

  function onPageKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "F2") {
      event.preventDefault();
      lastQtyRef.current?.focus();
      lastQtyRef.current?.select();
      return;
    }
    if (event.key === "F4" || (event.key === "Enter" && event.ctrlKey)) {
      event.preventDefault();
      if (!confirmOpen) requestCheckout();
    }
  }

  if (branches.isLoading || warehouses.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (branches.isError) {
    return (
      <ErrorState
        description={userFacingError(branches.error, tc("error"), tc("forbidden"))}
        onRetry={() => branches.refetch()}
      />
    );
  }

  if (warehouses.isError) {
    return (
      <ErrorState
        description={userFacingError(warehouses.error, tc("error"), tc("forbidden"))}
        onRetry={() => warehouses.refetch()}
      />
    );
  }

  if ((branches.data ?? []).length === 0 || (warehouses.data ?? []).length === 0) {
    return <EmptyState title={t("noLocations")} description={t("noLocationsDescription")} />;
  }

  const lastIndex = lines.length - 1;
  const submitting = submitLocked || createSale.isPending;

  return (
    <div onKeyDown={onPageKeyDown}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-copper">{t("eyebrow")}</p>
          <h1 className="mt-1 font-display text-4xl">{t("title")}</h1>
        </div>
        <p className="text-xs text-muted">{t("shortcuts")}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <ProductPicker
            label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            autoFocus
            clearOnSelect
            onSelect={onPickerSelect}
            disabled={!canCreate || submitting}
          />

          {lines.length === 0 ? (
            <EmptyState icon={ShoppingCart} title={t("emptyCart")} description={t("emptyCartDescription")} />
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-line bg-paper">
              <table className="w-full min-w-max border-collapse text-sm">
                <caption className="sr-only">{t("cartCaption")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th scope="col" className="px-4 py-3">
                      {t("item")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      {t("price")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("quantity")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("lineDiscount")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      {t("lineTotal")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">{tc("actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const linePreview = preview.lines[index];
                    return (
                      <tr key={line.key} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{line.productName}</p>
                          <p className="text-xs text-muted">
                            {line.sku}
                            {line.variantName ? ` · ${line.variantName}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">{formatMoney(line.unitPrice)}</td>
                        <td className="px-4 py-3">
                          <input
                            ref={index === lastIndex ? lastQtyRef : undefined}
                            aria-label={t("quantity")}
                            inputMode="decimal"
                            value={line.quantity}
                            disabled={submitting}
                            onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                            className="h-10 w-24 rounded-xl border border-line bg-paper px-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            aria-label={t("lineDiscount")}
                            inputMode="decimal"
                            value={line.discountAmount}
                            disabled={submitting}
                            onChange={(event) => updateLine(line.key, { discountAmount: event.target.value })}
                            className="h-10 w-24 rounded-xl border border-line bg-paper px-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {linePreview ? formatMoney(linePreview.lineTotal) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={submitting}
                            onClick={() => removeLine(line.key)}
                            aria-label={t("removeLine")}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Card className="h-fit space-y-4">
          <SelectField
            label={t("branch")}
            required
            value={effectiveBranchId}
            disabled={submitting}
            onChange={(event) => {
              const nextBranch = event.target.value;
              setBranchId(nextBranch);
              const nextWarehouses = (warehouses.data ?? []).filter(
                (warehouse) => warehouseBranchId(warehouse) === nextBranch,
              );
              setWarehouseId(nextWarehouses[0]?.id ?? "");
            }}
          >
            {(branches.data ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("warehouse")}
            required
            value={effectiveWarehouseId}
            disabled={submitting}
            onChange={(event) => setWarehouseId(event.target.value)}
          >
            {warehousesForBranch.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </SelectField>

          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-ink">{t("saleType")}</legend>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={saleType === "CASH" ? "primary" : "secondary"}
                disabled={submitting}
                onClick={() => setSaleType("CASH")}
              >
                {t("typeCash")}
              </Button>
              <Button
                type="button"
                variant={saleType === "CREDIT" ? "primary" : "secondary"}
                disabled={submitting}
                onClick={() => setSaleType("CREDIT")}
              >
                {t("typeCredit")}
              </Button>
            </div>
          </fieldset>

          {saleType === "CREDIT" ? (
            <>
              <CustomerPicker
                label={t("customer")}
                value={customer}
                onChange={setCustomer}
                disabled={submitting}
                required
              />
              <DateField
                label={t("dueDate")}
                required
                value={dueDate}
                disabled={submitting}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </>
          ) : null}

          <TextField
            label={t("orderDiscount")}
            inputMode="decimal"
            value={orderDiscount}
            disabled={submitting}
            onChange={(event) => setOrderDiscount(event.target.value)}
          />
          <TextareaField
            label={t("notes")}
            value={notes}
            disabled={submitting}
            onChange={(event) => setNotes(event.target.value)}
          />

          <div className="rounded-2xl bg-sand/70 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("previewLabel")}</p>
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between">
                <dt>{t("subtotal")}</dt>
                <dd>{formatMoney(preview.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("discount")}</dt>
                <dd>{formatMoney(preview.discountAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("tax")}</dt>
                <dd>{formatMoney(preview.taxAmount)}</dd>
              </div>
              <div className="flex justify-between font-display text-2xl text-ink">
                <dt>{t("total")}</dt>
                <dd>{formatMoney(preview.totalAmount)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">{t("previewHint")}</p>
          </div>

          {formError ? (
            <p role="alert" className="text-sm text-red-700">
              {formError}
            </p>
          ) : null}

          <Button
            type="button"
            className="w-full"
            disabled={!canCreate || submitting || lines.length === 0}
            onClick={requestCheckout}
          >
            {t("checkout")}
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          if (!submitting) setConfirmOpen(false);
        }}
        onConfirm={confirmSale}
        pending={submitting}
        title={t("confirmTitle")}
        description={t("confirmBody", {
          type: saleType === "CASH" ? t("typeCash") : t("typeCredit"),
          total: formatMoney(preview.totalAmount),
          items: formatQuantity(String(lines.length), { maximumFractionDigits: 0 }),
        })}
        confirmLabel={t("confirmSale")}
      />

      <VariantPickerModal
        open={Boolean(pendingProduct) && ((variantOptions?.length ?? 0) > 1 || variantLoading || Boolean(variantError))}
        onClose={() => {
          setPendingProduct(null);
          setVariantOptions(null);
          setVariantError(null);
        }}
        productName={pendingProduct?.name ?? ""}
        variants={variantOptions ?? []}
        isLoading={variantLoading}
        isError={Boolean(variantError)}
        error={variantError}
        onRetry={() => {
          if (pendingProduct) void onPickerSelect(pendingProduct);
        }}
        onSelect={(variant) => {
          if (!pendingProduct) return;
          addProduct(pendingProduct, variant);
          setPendingProduct(null);
          setVariantOptions(null);
        }}
      />
    </div>
  );
}
