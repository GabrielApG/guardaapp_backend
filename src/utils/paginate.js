function paginate(query = {}) {
  const page    = Math.max(1, parseInt(query.page)    || 1);
  const perPage = Math.min(100, parseInt(query.perPage) || 20);
  const offset  = (page - 1) * perPage;
  return { page, perPage, offset };
}

function paginateMeta(page, perPage, total) {
  return { page, perPage, total, totalPages: Math.ceil(total / perPage) };
}

module.exports = { paginate, paginateMeta };
