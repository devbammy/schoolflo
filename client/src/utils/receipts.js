/**
 * The receipt numbers on a payment record, for a history table.
 *
 * A record kept at the office accumulates, and each sum handed over has its own
 * receipt, so one record can hold several. Showing only the first left a parent
 * unable to find the number printed on their second receipt.
 */
export const receiptLabel = (payment) => {
  const numbers = (payment.instalments || [])
    .map((instalment) => instalment.receiptNumber)
    .filter(Boolean);

  if (numbers.length) return numbers.join(', ');
  return payment.receiptNumber || '—';
};
