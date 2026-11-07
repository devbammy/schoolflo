/**
 * How an email leaves the app: Resend's HTTP API when RESEND_API_KEY is set,
 * SMTP otherwise. The API path exists because some hosts block outbound SMTP,
 * and there the app saw neither a send nor an error.
 */

const ENV_KEYS = [
  'RESEND_API_KEY',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'FROM_EMAIL',
  'FROM_NAME',
];

let saved;
let realFetch;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  realFetch = global.fetch;
  jest.resetModules();
});

afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
  global.fetch = realFetch;
});

const load = () => require('../../src/services/notificationService');

const message = {
  to: 'teacher@school.ng',
  subject: 'Your account is ready',
  html: '<p>Welcome</p>',
};

describe('with RESEND_API_KEY set', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.FROM_EMAIL = 'noreply@gpis.com.ng';
    process.env.FROM_NAME = 'Glory and Praise';
  });

  it('sends through the Resend API, not SMTP', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_123' }),
    });

    const result = await load().sendEmail(message);

    expect(result).toEqual({ success: true, messageId: 'email_123' });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(options.body)).toEqual({
      from: 'Glory and Praise <noreply@gpis.com.ng>',
      to: ['teacher@school.ng'],
      subject: 'Your account is ready',
      html: '<p>Welcome</p>',
    });
  });

  it('reports Resend’s own reason when it refuses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({
        message: 'The gpis.com.ng domain is not verified.',
      }),
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await load().sendEmail(message);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/403: The gpis.com.ng domain is not verified/);
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/not verified/));
    spy.mockRestore();
  });

  it('does not throw when the network fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await load().sendEmail(message);

    expect(result).toEqual({ success: false, error: 'fetch failed' });
    spy.mockRestore();
  });

  it('says at startup which way email is going', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(load().verifyTransport()).resolves.toBe(true);

    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/Resend API, from noreply@gpis\.com\.ng/),
    );
    spy.mockRestore();
  });
});

describe('with neither set', () => {
  it('reports email as not configured without trying to send', async () => {
    global.fetch = jest.fn();

    const result = await load().sendEmail(message);

    expect(result).toEqual({
      success: false,
      error: 'Email is not configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('the startup environment check', () => {
  const base = {
    MONGO_URI: 'x',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  };

  it('accepts the Resend API key without any SMTP settings', () => {
    const { checkEnv } = require('../../src/config/env');

    const { warnings } = checkEnv({
      ...base,
      RESEND_API_KEY: 're_x',
      FROM_EMAIL: 'noreply@gpis.com.ng',
      FROM_NAME: 'GPPAF',
    });

    // Only the sending warnings. CLIENT_URL's warning mentions "emails" too.
    expect(warnings.join(' ')).not.toMatch(
      /SMTP|no email|\(email\)|RESEND_API_KEY/,
    );
  });

  it('warns when there is no way to send at all', () => {
    const { checkEnv } = require('../../src/config/env');

    const { warnings } = checkEnv(base);

    expect(warnings.join(' ')).toMatch(/Neither RESEND_API_KEY nor SMTP_HOST/);
  });
});
