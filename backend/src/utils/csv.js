/**
 * A small RFC 4180 CSV reader.
 *
 * Written rather than installed on purpose: `pnpm` is the only package manager
 * this tree tolerates and it is not always on PATH, so pulling a parser in is
 * a bigger commitment than the fifty lines below. The cases that actually
 * matter in a school's export are all handled — quoted fields containing
 * commas, escaped quotes, newlines inside a quoted cell, CRLF, and the UTF-8
 * BOM that Excel puts at the front of every file it saves.
 *
 * A spreadsheet exported from Excel is the normal input here, so the BOM is
 * not an edge case: without stripping it the first header keeps that invisible character
 * and every row looks like it is missing its first column.
 */

const MAX_ROWS = 1000;

/**
 * Split CSV text into rows of raw string cells.
 *
 * Character-by-character rather than a regex, because a field may contain the
 * delimiter, the row separator, or an escaped quote, and no regex survives all
 * three at once.
 */
const splitRows = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Excel's byte-order mark, and nothing else, is stripped from the front.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  const endField = () => {
    row.push(field);
    field = '';
  };

  const endRow = () => {
    endField();
    // A trailing newline produces one empty final row; drop it rather than
    // reporting a phantom blank record to the admin.
    const isBlank = row.length === 1 && row[0].trim() === '';
    if (!isBlank) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // "" inside a quoted field is a literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ',') {
      endField();
      i += 1;
      continue;
    }

    if (char === '\r') {
      // Treat CRLF and a lone CR as one row break.
      if (text[i + 1] === '\n') i += 1;
      endRow();
      i += 1;
      continue;
    }

    if (char === '\n') {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  // Whatever is left when the text runs out is the last row, unless the file
  // ended on a row separator and there is nothing pending.
  if (field !== '' || row.length > 0) endRow();

  return rows;
};

/** Header cells are matched loosely so "First Name" and "firstname" agree. */
const normalizeHeader = (value) =>
  String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

/**
 * Parse CSV text into `{ headers, rows }`, where each row is an object keyed
 * by normalized header plus the 1-based `_line` it came from.
 *
 * `_line` is the line number in the file the admin is looking at — header
 * included — so an error message points at a row they can actually find.
 */
const parseCsv = (text, { maxRows = MAX_ROWS } = {}) => {
  const raw = splitRows(String(text || ''));

  if (raw.length === 0) {
    return { headers: [], rows: [], error: 'The file is empty.' };
  }

  const headers = raw[0].map(normalizeHeader);
  const dataRows = raw.slice(1);

  if (dataRows.length === 0) {
    return {
      headers,
      rows: [],
      error: 'The file has a header row but no data.',
    };
  }

  if (dataRows.length > maxRows) {
    return {
      headers,
      rows: [],
      error: `The file has ${dataRows.length} rows. Import at most ${maxRows} at a time.`,
    };
  }

  const rows = dataRows.map((cells, index) => {
    const record = { _line: index + 2 };
    headers.forEach((header, column) => {
      if (!header) return;
      record[header] = (cells[column] ?? '').trim();
    });
    return record;
  });

  return { headers, rows, error: null };
};

/** Quote a value for CSV output — used to build the downloadable template. */
const toCsvValue = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const toCsv = (headers, rows) =>
  [
    headers.map(toCsvValue).join(','),
    ...rows.map((row) => row.map(toCsvValue).join(',')),
  ].join('\r\n');

module.exports = { parseCsv, splitRows, normalizeHeader, toCsv, MAX_ROWS };
