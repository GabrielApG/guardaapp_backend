function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code   = err.code   || 'INTERNAL_ERROR';
  const message = err.message || 'Erro interno do servidor.';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(status).json({
    success: false,
    error: { code, message, details: err.details || [] },
  });
}

module.exports = errorHandler;
