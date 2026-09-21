import type { Request } from "express";

export type PaginationParams = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parsePagination(req: Request): PaginationParams {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(String(req.query.pageSize ?? String(DEFAULT_PAGE_SIZE)), 10) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPageMeta(total: number, params: PaginationParams) {
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
