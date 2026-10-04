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
});
