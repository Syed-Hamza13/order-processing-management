// Central error handler. Every route wraps its logic in a try/catch and calls next(err),
// or async routes are wrapped with asyncHandler below.

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Invalid or missing security token. Please refresh the page and try again.' });
  }
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Something went wrong on the server.' });
}

module.exports = { asyncHandler, errorHandler };
