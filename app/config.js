// Reader configuration. No keys or secrets live here.

// SHA-256 of data/quran-uthmani.txt. The reader refuses to render if the
// file it loads does not match. `npm run verify` checks this matches.
export const QURAN_SHA256 = '6933e133dd56db778c801bf738848454e43648105a151e8d84d86a7cae39ec5f';

// Opened only when the user clicks "Support": the site's "Support" modal, which
// pays through Midtrans Snap. The app itself never talks to Midtrans.
export const SUPPORT_URL = 'https://quran.allrize.tech/#support';

// Shown in the reader's small "visit quran.allrize.tech for updates" line.
// A test keeps it equal to package.json's version.
export const VERSION = '0.4.1';
export const SITE_URL = 'https://quran.allrize.tech';
