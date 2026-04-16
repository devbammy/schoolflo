const sendSuccess = (res, statusCode = 200, message = 'Success', data = {}, meta = {}) => {
  const response = { success: true, message, data };
  if (Object.keys(meta).length > 0) response.meta = meta;
  return res.status(statusCode).json(response);
};

const sendError = (res, statusCode = 500, message = 'Error', errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

const sendPaginated = (res, data, total, page, limit) => {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
};

const getPaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

module.exports = { sendSuccess, sendError, sendPaginated, getPaginationParams };
