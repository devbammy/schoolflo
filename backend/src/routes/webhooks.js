const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { settlePayment } = require('../services/paymentService');

/**
 * Constant-time comparison of two hex signatures.
 * timingSafeEqual throws on length mismatch, so guard that first.
 */
const signatureMatches = (expected, received) => {
  if (typeof received !== 'string' || expected.length !== received.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
};

/**
 * @desc    Paystack payment webhook — the authoritative settlement path
 * @route   POST /webhooks/paystack
 * @access  Public (verified by HMAC signature, not by JWT)
 *
 * Mounted outside /api so the rate limiter never turns a real payment event
 * into a 429, and registered before express.json() so the raw body needed for
 * the signature check survives.
 *
 * Paystack retries non-2xx responses, so failures here are safe: settlePayment
 * is idempotent and a later retry will land the payment.
 */
router.post(
  '/paystack',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      console.error(
        'Paystack webhook received but PAYSTACK_SECRET_KEY is unset',
      );
      return res.sendStatus(500);
    }

    // express.raw() only populates a Buffer when the request actually carries
    // Content-Type: application/json. Anything else leaves req.body as a plain
    // object, which crypto.update() rejects outright — so check before hashing
    // rather than throwing a 500 out of an unauthenticated endpoint.
    if (!Buffer.isBuffer(req.body)) {
      return res.sendStatus(400);
    }

    const expected = crypto
      .createHmac('sha512', secret)
      .update(req.body)
      .digest('hex');

    if (!signatureMatches(expected, req.headers['x-paystack-signature'])) {
      return res.sendStatus(401);
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      // Malformed body from a correctly signed source: acknowledge so Paystack
      // stops retrying something that can never succeed.
      return res.sendStatus(200);
    }

    if (event.event !== 'charge.success') {
      return res.sendStatus(200); // Event we don't act on — acknowledge it.
    }

    const reference = event.data?.reference;
    if (!reference) return res.sendStatus(200);

    try {
      const { settled, reason } = await settlePayment({ reference });

      if (!settled && reason === 'not_found') {
        // No local record for this reference — retrying will not help.
        console.error(`Paystack webhook: unknown reference ${reference}`);
        return res.sendStatus(200);
      }

      if (!settled) {
        console.error(`Paystack webhook: ${reference} not settled (${reason})`);
        return res.sendStatus(200);
      }

      return res.sendStatus(200);
    } catch (error) {
      // Transient failure (DB down, gateway unreachable) — a non-2xx asks
      // Paystack to retry.
      console.error(
        `Paystack webhook error for ${reference}: ${error.message}`,
      );
      return res.sendStatus(500);
    }
  },
);

module.exports = router;
