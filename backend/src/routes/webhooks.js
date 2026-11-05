const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { settlePayment } = require('../services/paymentService');
const audit = require('../services/auditService');

/**
 * A payer who never returns to the site is settled here and nowhere else, so
 * without this the most reliable path to the money was the one the audit log
 * never saw. Only the call that actually settled records it: gateways retry.
 */
const auditSettlement = async (req, reference, settlement) => {
  const { settled, alreadySettled, payment, overpaid } = settlement;
  if (!settled || alreadySettled) return;

  await audit.recordAnonymous(req, {
    action: 'payment.settle',
    entity: 'Payment',
    entityId: payment._id,
    entityLabel: payment.receiptNumber,
    subject: payment.student?._id || payment.student,
    meta: {
      reference,
      amountPaid: payment.amountPaid,
      status: payment.status,
      balance: payment.balance,
      gateway: payment.gateway,
      viaWebhook: true,
      overpaid: overpaid || undefined,
    },
  });
};

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
      const settlement = await settlePayment({ reference });
      const { settled, reason } = settlement;

      await auditSettlement(req, reference, settlement);

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

/**
 * @desc    Flutterwave payment webhook
 * @route   POST /webhooks/flutterwave
 * @access  Public (verified by the shared secret hash, not by JWT)
 *
 * Flutterwave does not sign the body. It echoes the "secret hash" you set in
 * its dashboard back in a `verif-hash` header, so that is what is compared
 * here (FLUTTERWAVE_WEBHOOK_HASH). This route did not exist before, so a
 * Flutterwave payment could only ever settle if the payer's browser made it
 * back to the site.
 *
 * The header only proves the call is Flutterwave's. settlePayment() still asks
 * Flutterwave's API what actually happened to the reference, so nothing in the
 * body is trusted for the amount.
 */
router.post(
  '/flutterwave',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const secret = process.env.FLUTTERWAVE_WEBHOOK_HASH;
    if (!secret) {
      console.error(
        'Flutterwave webhook received but FLUTTERWAVE_WEBHOOK_HASH is unset',
      );
      return res.sendStatus(500);
    }

    const received = req.headers['verif-hash'];
    if (
      typeof received !== 'string' ||
      received.length !== secret.length ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(received))
    ) {
      return res.sendStatus(401);
    }

    if (!Buffer.isBuffer(req.body)) return res.sendStatus(400);

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.sendStatus(200);
    }

    const reference = event?.data?.tx_ref;
    if (event?.event !== 'charge.completed' || !reference) {
      return res.sendStatus(200); // Not an event we act on — acknowledge it.
    }

    try {
      const settlement = await settlePayment({ reference });
      const { settled, reason } = settlement;

      await auditSettlement(req, reference, settlement);

      if (!settled) {
        console.error(
          `Flutterwave webhook: ${reference} not settled (${reason})`,
        );
      }
      return res.sendStatus(200);
    } catch (error) {
      console.error(
        `Flutterwave webhook error for ${reference}: ${error.message}`,
      );
      return res.sendStatus(500);
    }
  },
);

module.exports = router;
