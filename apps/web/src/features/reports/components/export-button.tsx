"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "../lib/csv";

export function ExportCsvButton({
  filename,
  headers,
  rows,
  disabled,
}: {
  filename: string;
  headers: string[];
  rows: ReadonlyArray<ReadonlyArray<string>>;
  disabled?: boolean;
}) {
  const t = useTranslations("reports");

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled || rows.length === 0}
      onClick={() => downloadCsv(filename, headers, rows)}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {t("exportCsv")}
    </Button>
  );
}
