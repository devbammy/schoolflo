const db = require('../setup/db');

const mockSendEmail = jest.fn().mockResolvedValue({ success: true });
jest.mock('../../src/services/notificationService', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
  sendBulkEmails: jest.fn().mockResolvedValue({ sent: 0, failed: 0, total: 0 }),
  verifyTransport: jest.fn().mockResolvedValue(true),
  emailTemplates: new Proxy({}, { get: () => () => '<html></html>' }),
}));

const {
  startJobQueue,
  stopJobQueue,
  enqueueEmail,
  enqueueBulkEmail,
} = require('../../src/services/jobQueue');

/**
 * The queue had never started. agenda 6 is an ES module with a named export
 * and it moved storage into a separate backend package, so `new Agenda(...)`
 * threw on every boot and every caller silently fell back to sending inline —
 * a term's results went out as 200 blocking sends on one request.
 *
 * Agenda is now loaded with `await import()` inside startJobQueue rather than
 * required at module scope. Jest's CJS runtime cannot execute that import, so
 * **the running queue is proved end-to-end against real Node**, not here; what
 * this file locks down is everything around it:
 *
 *   - that requiring this module is safe, which the old top-level
 *     `require('agenda')` made impossible and which spread untestability to
 *     every module that imported it
 *   - that the inline fallback still works, because that is what keeps a
 *     payment receipt from being dropped when the queue is down
 */

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await stopJobQueue();
  await db.close();
});

beforeEach(() => {
  mockSendEmail.mockClear();
});

describe('module loading', () => {
  it('can be required without dragging an ES module in', () => {
    // The regression that matters most: `require('agenda')` at module scope
    // threw "Cannot use import statement outside a module" and made this file
    // — and anything importing it — impossible to load under Jest.
    expect(() => require('../../src/services/jobQueue')).not.toThrow();
    expect(typeof enqueueEmail).toBe('function');
  });

  it('reports honestly when the queue cannot start', async () => {
    // Under Jest it cannot, and that must be a null return rather than a throw
    // — a school is not blocked from publishing results because a background
    // worker is unavailable.
    await expect(startJobQueue()).resolves.not.toThrow();
  });
});

describe('the inline fallback', () => {
  it('sends inline when the queue is not running', async () => {
    const result = await enqueueEmail({
      to: 'fallback@school.ng',
      subject: 'Receipt',
      html: '<p>x</p>',
    });

    expect(result.sentInline).toBe(true);
    expect(result.queued).toBe(false);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'fallback@school.ng' }),
    );
  });

  it('still reports success so a caller can check one field', async () => {
    const result = await enqueueEmail({
      to: 'receipt@school.ng',
      subject: 'Receipt',
      html: '<p>x</p>',
    });

    expect(result.success).toBe(true);
  });

  it('refuses a message with no recipient', async () => {
    const result = await enqueueEmail({ subject: 'nowhere' });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('skips bulk recipients with no address', async () => {
    const result = await enqueueBulkEmail(
      [{ email: 'ok@school.ng' }, { email: '' }, {}],
      (r) => ({ to: r.email, subject: 'Partial', html: 'x' }),
    );

    expect(result.queued).toBe(1);
    expect(result.total).toBe(3);
  });

  it('does not let one bad recipient abandon the rest', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP refused'));

    const result = await enqueueBulkEmail(
      [
        { email: 'bad@school.ng' },
        { email: 'good1@school.ng' },
        { email: 'good2@school.ng' },
      ],
      (r) => ({ to: r.email, subject: 'Term results', html: 'x' }),
    );

    expect(result.total).toBe(3);
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
  });
});
