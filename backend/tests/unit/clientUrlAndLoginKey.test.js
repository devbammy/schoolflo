const { clientUrl } = require('../../src/config/clientUrl');
const { byLoginTarget } = require('../../src/middleware/rateLimitKeys');

describe('clientUrl', () => {
  const original = process.env.CLIENT_URL;
  afterEach(() => {
    process.env.CLIENT_URL = original;
  });

  it('uses only the first origin when several are listed', () => {
    process.env.CLIENT_URL = 'https://a.example/, https://b.example';
    expect(clientUrl()).toBe('https://a.example');
  });

  it('falls back to the local dev client when unset', () => {
    delete process.env.CLIENT_URL;
    expect(clientUrl()).toBe('http://localhost:5173');
  });
});

describe('byLoginTarget', () => {
  const key = (email) => byLoginTarget({ body: { email }, ip: '1.2.3.4' });

  it('counts different spellings of one address as one account', () => {
    expect(key('  Teacher@School.com ')).toBe(key('teacher@school.com'));
    expect(key('a@googlemail.com')).toBe(key('a@gmail.com'));
  });

  it('keeps +tagged addresses separate, as the login lookup does', () => {
    expect(key('parent+kid@gmail.com')).not.toBe(key('parent@gmail.com'));
  });

  // Students sign in with an admission number, typed on a phone that
  // capitalises and spaces it. Each spelling must share one budget.
  it('counts every spelling of one admission number as one account', () => {
    const typed = (identifier) =>
      byLoginTarget({ body: { identifier }, ip: '1.2.3.4' });

    expect(typed(' ao 260012')).toBe(typed('AO260012'));
    expect(typed('AO260012')).not.toBe(typed('AO260013'));
    expect(typed('AO260012')).not.toMatch(/ip/);
  });

  it('reads the identifier field as well as the older email field', () => {
    expect(
      byLoginTarget({ body: { identifier: 'Teacher@School.com' }, ip: '1' }),
    ).toBe(key('teacher@school.com'));
  });
});
