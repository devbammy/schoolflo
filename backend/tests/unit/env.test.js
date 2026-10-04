const { checkEnv } = require('../../src/config/env');

const good = {
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb://localhost/x',
  JWT_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  CLIENT_URL: 'https://school.example',
};

describe('checkEnv', () => {
  it('accepts a complete production configuration', () => {
    expect(checkEnv(good).errors).toEqual([]);
  });

  it('refuses to start without the secrets or database', () => {
    const { errors } = checkEnv({ NODE_ENV: 'production' });
    expect(errors.join(' ')).toMatch(/MONGO_URI/);
    expect(errors.join(' ')).toMatch(/JWT_SECRET/);
    expect(errors.join(' ')).toMatch(/JWT_REFRESH_SECRET/);
  });

  it('rejects weak or identical secrets in production', () => {
    expect(checkEnv({ ...good, JWT_SECRET: 'short' }).errors.join(' ')).toMatch(
      /shorter than 32/,
    );
    expect(
      checkEnv({ ...good, JWT_REFRESH_SECRET: good.JWT_SECRET }).errors.join(
        ' ',
      ),
    ).toMatch(/different/);
  });

  it('only warns about weak secrets outside production', () => {
    const { errors, warnings } = checkEnv({
      ...good,
      NODE_ENV: 'development',
      JWT_SECRET: 'short',
    });
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toMatch(/shorter than 32/);
  });

  it('requires CLIENT_URL in production', () => {
    const { CLIENT_URL, ...rest } = good;
    expect(checkEnv(rest).errors.join(' ')).toMatch(/CLIENT_URL/);
  });
});
