const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  globalSearch,
  getSearchScopes,
} = require('../controllers/searchController');

const searchRules = [
  query('q')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Search text must be text.')
    .bail()
    .trim()
    // Long enough to be a name or a title; anything beyond is a paste, not a
    // search, and only widens the regex scan.
    .isLength({ max: 100 })
    .withMessage('Search text is too long.'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20.')
    .toInt(),
];

router.get('/scopes', protect, getSearchScopes);

router.get('/', protect, validate(searchRules), globalSearch);

module.exports = router;
