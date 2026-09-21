export function paginate(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}

export function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
