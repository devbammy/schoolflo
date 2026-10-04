/**
 * The public address of the web client, for links we put in emails and hand to
 * payment gateways.
 *
 * CLIENT_URL may list several origins separated by commas — server.js uses the
 * whole list for CORS — but a link needs exactly one. Interpolating the raw
 * value produced `https://a.com,https://b.com/reset-password/...`, which broke
 * every reset, welcome and payment-return link for any school that allowed
 * more than one origin. The first entry is the canonical one.
 */
const clientUrl = () => {
  const first = (process.env.CLIENT_URL || '').split(',')[0].trim();
  return (first || 'http://localhost:5173').replace(/\/$/, '');
};

module.exports = { clientUrl };
