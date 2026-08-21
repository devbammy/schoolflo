const { sendSuccess } = require('../utils/apiResponse');
const {
  search,
  groupsForRole,
  MIN_QUERY_LENGTH,
} = require('../services/searchService');

// @desc    Search everything this user is allowed to see
// @route   GET /api/v1/search?q=&types=students,classes&limit=5
// @access  Any authenticated user
const globalSearch = async (req, res) => {
  const { q, types, limit } = req.query;

  const requested = types
    ? String(types)
        .split(',')
        .map((type) => type.trim())
        .filter(Boolean)
    : undefined;

  const result = await search({
    user: req.user,
    query: q,
    types: requested,
    limit: Math.min(20, Math.max(1, parseInt(limit, 10) || 5)),
  });

  return sendSuccess(res, 200, 'Search results', {
    ...result,
    minLength: MIN_QUERY_LENGTH,
  });
};

// @desc    Which result groups this user's role can search
// @route   GET /api/v1/search/scopes
// @access  Any authenticated user
const getSearchScopes = async (req, res) =>
  sendSuccess(res, 200, 'Search scopes', {
    scopes: groupsForRole(req.user.role),
    minLength: MIN_QUERY_LENGTH,
  });

module.exports = { globalSearch, getSearchScopes };
