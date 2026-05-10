const sendSuccess = (
  res,
  statusCode = 200,
  message = 'Success',
  data = {},
  meta = {},
) => {
  if (typeof statusCode !== 'number') statusCode = 200;
  const response = { success: true, message, data };
  if (Object.keys(meta).length > 0) response.meta = meta;
  return res.status(statusCode).json(response);
};

const sendError = (
  res,
  messageOrStatusCode = 'Error',
  statusCodeOrMessage = 500,
  errors = null,
) => {
  let statusCode = 500;
  let message = 'Error';

  if (typeof messageOrStatusCode === 'number') {
    statusCode = messageOrStatusCode;
    message =
      typeof statusCodeOrMessage === 'string' ? statusCodeOrMessage : 'Error';
  } else {
    message = messageOrStatusCode;
    statusCode =
      typeof statusCodeOrMessage === 'number' ? statusCodeOrMessage : 500;
  }

  if (typeof statusCode !== 'number') statusCode = 500;
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

// const sendSuccess = (
//   res,
//   data = {},
//   message = 'Success',
//   statusCode = 200,
//   meta = {},
// ) => {
//   if (typeof statusCode !== 'number') statusCode = 200;
//   const response = { success: true, message, data };
//   if (Object.keys(meta).length > 0) response.meta = meta;
//   return res.status(statusCode).json(response);
// };

// const sendError = (res, message = 'Error', statusCode = 500, errors = null) => {
//   if (typeof statusCode !== 'number') statusCode = 200;
//   const response = { success: false, message };
//   if (errors) response.errors = errors;
//   return res.status(statusCode).json(response);
// };

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
