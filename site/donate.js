// "Support" donation modal, the same flow as lpdpfind.allrize.tech: pick an amount,
// the site's /api creates a Midtrans Snap transaction, Snap's popup takes payment.
// Snap's script is loaded only after the visitor clicks "Lanjutkan".
const API_URL = '/api';
const MIN_AMOUNT = 5000;
let selectedAmount = 5000;
let snapLoaded = false;

const $ = (id) => document.getElementById(id);
const formatIdr = (n) => `Rp${n.toLocaleString('id-ID')}`;

function parseIdrAmount(raw) {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : null;
}

function setActive(amount) {
  for (const b of $('sedekahPresets').querySelectorAll('.sedekah-preset')) {
    const on = Number(b.dataset.amount) === amount;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function showError(msg) { $('sedekahError').textContent = msg; $('sedekahError').hidden = false; }
function hideError() { $('sedekahError').hidden = true; $('sedekahError').textContent = ''; }

function openModal() {
  selectedAmount = 5000;
  setActive(5000);
  $('sedekahCustomAmount').value = '';
  hideError();
  $('sedekahModal').hidden = false;
  $('sedekahModal').setAttribute('aria-hidden', 'false');
  $('sedekahModal').querySelector('.sedekah-preset.active')?.focus();
}

function closeModal() {
  $('sedekahModal').hidden = true;
  $('sedekahModal').setAttribute('aria-hidden', 'true');
  hideError();
}

function toast(msg, type = '') {
  document.querySelector('.sedekah-toast')?.remove();
  const el = document.createElement('div');
  el.className = `sedekah-toast${type ? ` ${type}` : ''}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function loadSnap(clientKey, url) {
  if (window.snap && snapLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url || 'https://app.midtrans.com/snap/snap.js';
    s.setAttribute('data-client-key', clientKey);
    s.onload = () => { snapLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Gagal memuat Midtrans. Coba lagi.'));
    document.head.appendChild(s);
  });
}

async function submit() {
  const amount = parseIdrAmount($('sedekahCustomAmount').value) || selectedAmount;
  if (!amount || amount < MIN_AMOUNT) return showError(`Nominal minimal ${formatIdr(MIN_AMOUNT)}`);
  hideError();
  const btn = $('sedekahSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  try {
    const cfgRes = await fetch(`${API_URL}/donations/config`);
    const config = cfgRes.ok ? await cfgRes.json().catch(() => ({})) : {};
    if (!config.enabled) throw new Error('Pembayaran belum tersedia. Coba lagi nanti.');
    await loadSnap(config.client_key, config.snap_script_url);
    const res = await fetch(`${API_URL}/donations/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || 'Gagal membuat transaksi');
    closeModal();
    window.snap.pay(payload.token, {
      onSuccess: () => toast('Terima kasih atas dukunganmu!', 'success'),
      onPending: () => toast('Pembayaran menunggu konfirmasi.'),
      onError: () => toast('Pembayaran dibatalkan atau gagal.'),
      onClose: () => {},
    });
  } catch (err) {
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lanjutkan';
  }
}

function init() {
  const modal = $('sedekahModal');
  if (!modal) return;
  for (const b of document.querySelectorAll('[data-sedekah-open]')) b.addEventListener('click', openModal);
  $('sedekahModalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  for (const b of $('sedekahPresets').querySelectorAll('.sedekah-preset')) {
    b.addEventListener('click', () => {
      selectedAmount = Number(b.dataset.amount);
      setActive(selectedAmount);
      $('sedekahCustomAmount').value = '';
      hideError();
    });
  }
  $('sedekahCustomAmount').addEventListener('input', () => { setActive(-1); hideError(); });
  $('sedekahCustomAmount').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  $('sedekahSubmitBtn').addEventListener('click', submit);

  const params = new URLSearchParams(location.search);
  if (params.get('sedekah') === 'success') {
    toast('Terima kasih atas dukunganmu!', 'success');
    params.delete('sedekah');
    const qs = params.toString();
    history.replaceState({}, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  }
  // quran-turn.org/support and the app's Support link open the modal directly.
  if (location.hash === '#support' || document.body.dataset.openSedekah === 'true') openModal();
}

init();
