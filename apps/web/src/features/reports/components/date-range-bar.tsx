"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { DateField, SelectField } from "@/components/ui/form-field";
import { Tabs } from "@/components/ui/tabs";
import {
  dateRangeIssue,
  defaultDateRange,
  maxEndDateFor,
  minStartDateFor,
  type DateRangeState,
} from "../lib/dates";
import { REPORT_DEFAULT_LIMIT, REPORT_GROUP_BY_OPTIONS } from "../lib/constants";
import type { ReportGroupBy } from "../types";

export function useReportPaging(initialLimit = REPORT_DEFAULT_LIMIT) {
  const [page, setPage] = React.useState(1);
  const [limit, setLimitState] = React.useState(initialLimit);
  const setLimit = (next: number) => {
    setPage(1);
    setLimitState(next);
  };
  return { page, setPage, limit, setLimit };
}

export function useReportDateRange() {
  const defaults = React.useMemo(() => defaultDateRange(), []);
  const [range, setRange] = React.useState<DateRangeState>(defaults);
  const [groupBy, setGroupBy] = React.useState<ReportGroupBy>("day");
  const issue = dateRangeIssue(range);
  return {
    range,
    setRange,
    groupBy,
    setGroupBy,
    issue,
    isValid: issue === null,
  };
}

export function DateRangeBar({
  range,
  onRangeChange,
  groupBy,
  onGroupByChange,
  issue,
}: {
  range: DateRangeState;
  onRangeChange: (next: DateRangeState) => void;
  groupBy?: ReportGroupBy;
  onGroupByChange?: (next: ReportGroupBy) => void;
  issue: ReturnType<typeof dateRangeIssue>;
}) {
  const t = useTranslations("reports");

  const validationMessage =
    issue === "inverted" ? t("rangeInverted") : issue === "tooLong" ? t("rangeTooLong") : undefined;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <DateField
        label={t("startDate")}
        value={range.startDate}
        max={range.endDate}
        min={minStartDateFor(range.endDate)}
        onChange={(event) => onRangeChange({ ...range, startDate: event.target.value })}
        error={issue === "inverted" || issue === "tooLong" ? validationMessage : undefined}
      />
      <DateField
        label={t("endDate")}
        value={range.endDate}
        min={range.startDate}
        max={maxEndDateFor(range.startDate)}
        onChange={(event) => onRangeChange({ ...range, endDate: event.target.value })}
        error={issue ? validationMessage : undefined}
      />
      {groupBy && onGroupByChange ? (
        <div className="flex flex-col">
          <span className="mb-1.5 text-sm font-medium text-ink">{t("groupBy")}</span>
          <Tabs
            label={t("groupBy")}
            value={groupBy}
            onValueChange={(value) => {
              if (value === "day" || value === "week" || value === "month") onGroupByChange(value);
            }}
            items={REPORT_GROUP_BY_OPTIONS.map((option) => ({
              value: option,
              label: t(`groupByOption.${option}`),
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

export function LimitSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  options: readonly number[];
  label: string;
}) {
  return (
    <SelectField label={label} wrapperClassName="w-36" value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </SelectField>
  );
}
