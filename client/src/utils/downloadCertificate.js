import toast from 'react-hot-toast';
import { certificateService } from '../services/api';

/**
 * Fetch a certificate's PDF through the authenticated endpoint and save it.
 *
 * These documents used to be plain links to a public file host, so a link
 * could be forwarded, bookmarked or leaked and still open. The download now
 * needs the signed-in user's token, which a bare <a href> cannot send — so the
 * file is fetched with it and handed to the browser as a download.
 *
 * Saved as a file rather than opened in a tab: a blob opened in a new tab is
 * blocked by popup blockers on phones and inherits the page's strict security
 * policy, while a download works everywhere.
 */
export async function downloadCertificate(certificate) {
  const toastId = toast.loading('Preparing your document…');

  try {
    const response = await certificateService.download(certificate._id);

    const url = URL.createObjectURL(
      new Blob([response.data], { type: 'application/pdf' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(certificate.certificateNumber || 'certificate').replace(
      /[^\w.-]+/g,
      '_',
    )}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);

    toast.success('Downloaded', { id: toastId });
  } catch (error) {
    // An error body arrives as a Blob because the request asked for one, so
    // read the server's message out of it rather than showing a generic one.
    let message = 'Could not download this document.';
    try {
      const text = await error.response?.data?.text?.();
      message = JSON.parse(text).message || message;
    } catch {
      // keep the generic message
    }
    toast.error(message, { id: toastId });
  }
}
