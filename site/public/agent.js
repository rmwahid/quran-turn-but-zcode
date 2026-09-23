// /agent: copy the Ngaji Companion prompt, or share it where the platform can.
const prompt = document.getElementById('prompt').textContent;
const copyBtn = document.getElementById('copy-prompt');
const shareBtn = document.getElementById('share-prompt');

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  try { return document.execCommand('copy'); } finally { ta.remove(); }
}

function flash(btn, label) {
  btn.dataset.label ??= btn.textContent;
  btn.textContent = label;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = btn.dataset.label; }, 1800);
}

copyBtn.addEventListener('click', async () => {
  let ok = false;
  try {
    await navigator.clipboard.writeText(prompt);
    ok = true;
  } catch {
    ok = fallbackCopy(prompt);
  }
  flash(copyBtn, ok ? 'Copied ✓' : 'Select & copy');
});

if (typeof navigator.share === 'function') {
  shareBtn.hidden = false;
  shareBtn.addEventListener('click', async () => {
    try {
      await navigator.share({ title: 'Ngaji Companion for Muse', text: prompt, url: 'https://quran.allrize.tech/agent' });
    } catch {
      // Cancelled or unsupported: Copy still works.
    }
  });
}
