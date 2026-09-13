const {
  parseCsv,
  splitRows,
  normalizeHeader,
  toCsv,
} = require('../../src/utils/csv');

describe('splitRows', () => {
  it('splits plain rows and cells', () => {
    expect(splitRows('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles CRLF, which is what Excel writes', () => {
    expect(splitRows('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(splitRows('name,note\n"Doe, John",ok')).toEqual([
      ['name', 'note'],
      ['Doe, John', 'ok'],
    ]);
  });

  it('unescapes a doubled quote', () => {
    expect(splitRows('note\n"She said ""hi"""')).toEqual([
      ['note'],
      ['She said "hi"'],
    ]);
  });

  it('keeps a newline inside a quoted field', () => {
    expect(splitRows('address\n"12 Broad St\nLagos"')).toEqual([
      ['address'],
      ['12 Broad St\nLagos'],
    ]);
  });

  it('strips the UTF-8 BOM Excel puts at the front', () => {
    // Without this the first header keeps that invisible character and every row looks like
    // it is missing its first column.
    const withBom = `${String.fromCharCode(0xfeff)}email,role\na@b.ng,Student`;
    expect(splitRows(withBom)[0][0]).toBe('email');
  });

  it('does not invent a row from a trailing newline', () => {
    expect(splitRows('a\n1\n')).toHaveLength(2);
  });

  it('preserves empty cells rather than collapsing them', () => {
    expect(splitRows('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('normalizeHeader', () => {
  it('matches the spellings a person actually types', () => {
    [
      'First Name',
      'firstname',
      'FIRST_NAME',
      'first-name',
      '  firstName  ',
    ].forEach((variant) => expect(normalizeHeader(variant)).toBe('firstname'));
  });
});

describe('parseCsv', () => {
  it('keys rows by normalized header and records the file line', () => {
    const { rows } = parseCsv('First Name,Email\nAda,ada@school.ng');

    expect(rows).toEqual([
      { _line: 2, firstname: 'Ada', email: 'ada@school.ng' },
    ]);
  });

  it('numbers lines the way the admin sees them in the file', () => {
    // Header is line 1, so the first record is line 2 — an error pointing at
    // "row 3" has to mean the third line of their spreadsheet.
    const { rows } = parseCsv('a\n1\n2\n3');
    expect(rows.map((r) => r._line)).toEqual([2, 3, 4]);
  });

  it('trims surrounding whitespace from values', () => {
    const { rows } = parseCsv('email\n   ada@school.ng   ');
    expect(rows[0].email).toBe('ada@school.ng');
  });

  it('reports an empty file rather than throwing', () => {
    expect(parseCsv('').error).toMatch(/empty/i);
  });

  it('reports a header-only file', () => {
    expect(parseCsv('firstname,email').error).toMatch(/no data/i);
  });

  it('refuses a file beyond the row cap', () => {
    const big = [
      'email',
      ...Array.from({ length: 6 }, (_, i) => `u${i}@s.ng`),
    ].join('\n');
    expect(parseCsv(big, { maxRows: 5 }).error).toMatch(/at most 5/);
  });

  it('ignores a column with a blank header', () => {
    const { rows } = parseCsv('firstname,,email\nAda,junk,ada@school.ng');
    expect(rows[0]).toEqual({
      _line: 2,
      firstname: 'Ada',
      email: 'ada@school.ng',
    });
  });
});

describe('toCsv', () => {
  it('quotes only what needs quoting', () => {
    expect(toCsv(['a', 'b'], [['plain', 'has,comma']])).toBe(
      'a,b\r\nplain,"has,comma"',
    );
  });

  it('round-trips through the parser', () => {
    const csv = toCsv(['firstname', 'note'], [['Ada', 'She said "hi", twice']]);
    const { rows } = parseCsv(csv);
    expect(rows[0].note).toBe('She said "hi", twice');
  });
});
