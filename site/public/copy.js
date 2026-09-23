// "Copy" buttons on the install cards.
for (const btn of document.querySelectorAll('[data-copy]')) {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.dataset.label ??= btn.textContent;
      btn.textContent = 'Copied ✓';
    } catch {
      btn.dataset.label ??= btn.textContent;
      btn.textContent = 'Select & copy';
    }
    setTimeout(() => { btn.textContent = btn.dataset.label || 'Copy'; }, 1800);
  });
}
