import type { WarehouseSummary } from "@/features/inventory/api";

type WarehouseWithBranch = WarehouseSummary & {
  branchId?: string;
  branch: { id?: string; name: string };
};

/** Warehouses include `branchId` and `branch.id` from GET /warehouses; the web type only lists `branch.name`. */
export function warehouseBranchId(warehouse: WarehouseSummary): string | null {
  const extra = warehouse as WarehouseWithBranch;
  if (typeof extra.branchId === "string" && extra.branchId.length > 0) {
    return extra.branchId;
  }
  if (typeof extra.branch.id === "string" && extra.branch.id.length > 0) {
    return extra.branch.id;
  }
  return null;
}
