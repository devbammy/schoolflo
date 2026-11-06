/**
 * How a list of named things is ordered.
 *
 * Lists used to come back in whatever order the records were created, or newest
 * first, so a school entering fifty subjects saw them in entry order and could
 * only find one by reading the whole list. Alphabetical is the default
 * everywhere a list holds named things; the caller may ask for another order.
 */

const SORT_CHOICES = ['az', 'za', 'newest', 'oldest'];

/**
 * Case-insensitive, and numbers compared as numbers: "Basic 2" sorts before
 * "Basic 10", and "jss 1" beside "JSS 1". A plain sort put every capital letter
 * ahead of every lower-case one and "Basic 10" ahead of "Basic 2".
 */
const NAME_COLLATION = { locale: 'en', numericOrdering: true, strength: 2 };

/**
 * The Mongo sort for a choice. `fields` are the name fields, most significant
 * first. An unknown or missing choice is A to Z.
 *
 * `_id` always comes last, so records with the same name keep one order across
 * pages rather than swapping between page 1 and page 2.
 */
const sortFor = (choice, fields) => {
  if (choice === 'newest') return { createdAt: -1, _id: -1 };
  if (choice === 'oldest') return { createdAt: 1, _id: 1 };

  const direction = choice === 'za' ? -1 : 1;
  const spec = {};
  fields.forEach((field) => {
    spec[field] = direction;
  });
  spec._id = direction;
  return spec;
};

/**
 * Apply a choice to a Mongoose query.
 *
 * `collate: false` is for a query that cannot take a collation: a `$text`
 * search, which the library uses, refuses any collation but the simple one.
 */
const applySort = (query, choice, fields, { collate = true } = {}) => {
  query.sort(sortFor(choice, fields));
  if (collate) query.collation(NAME_COLLATION);
  return query;
};

module.exports = { SORT_CHOICES, NAME_COLLATION, sortFor, applySort };
