// Float mode: the reader as a small always-on-top ayah card (Chrome's Document
// Picture-in-Picture). It sits beside the agent, never moves on its own and
// never steals focus: when the agent needs you, a strip slides into the card
// and you choose when to go (Space/Enter). Ayah text still only ever reaches
// the page through textContent, exactly like the main reader.

export const canFloat = () => 'documentPictureInPicture' in window;

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function el(doc, tag, props = {}, children = []) {
  const node = Object.assign(doc.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
}

export class FloatCard {
  constructor({ onKey, onBack, onClose }) {
    this.onKey = onKey;
    this.onBack = onBack;
    this.onClose = onClose;
    this.win = null;
    this.alertKind = null; // 'needs_you' | 'done' | null
    this.doneId = null; // which finished turn the "saved" strip belongs to
    this.dismissedDone = null;
  }

  get open() { return Boolean(this.win && !this.win.closed); }

  // Must be called from a user gesture (click or key press).
  async show({ width = 360, height = 240 } = {}) {
    if (this.open) { this.win.focus(); return; }
    const win = await window.documentPictureInPicture.requestWindow({ width, height });
    this.win = win;
    const doc = win.document;
    doc.documentElement.lang = 'en';
    const theme = document.documentElement.dataset.theme;
    if (theme) doc.documentElement.dataset.theme = theme;
    doc.documentElement.style.cssText = document.documentElement.style.cssText; // --ayah-size etc.
    doc.head.append(el(doc, 'link', { rel: 'stylesheet', href: new URL('reader.css', location.href).href }));
    doc.title = 'Quran Turn';
    doc.body.className = 'float-body';

    const b = (cls, text, label) => el(doc, 'button', { type: 'button', className: cls, textContent: text, ...(label ? { ariaLabel: label, title: label } : {}) });
    this.els = {
      dot: el(doc, 'span', { className: 'fdot' }),
      status: el(doc, 'span', { className: 'fstatus-text' }),
      ref: el(doc, 'span', { className: 'fref' }),
      close: b('ficon', '×', 'Close float (back to the full reader)'),
      alertTitle: el(doc, 'span', { className: 'falert-title' }),
      back: b('fback', 'Back to Claude'),
      hint: el(doc, 'kbd', { className: 'fkey', textContent: 'space' }),
      text: el(doc, 'span', { className: 'fayah-text' }),
      end: el(doc, 'span', { className: 'fayah-end', ariaHidden: 'true' }),
      prev: b('fnav-btn', '→', 'Previous ayah (→)'),
      next: b('fnav-btn', '←', 'Next ayah (←)'),
      counter: el(doc, 'span', { className: 'fcounter' }),
    };
    const e = this.els;
    e.ayah = el(doc, 'p', { className: 'fayah', lang: 'ar', dir: 'rtl' }, [e.text, ' ', e.end]);
    e.alert = el(doc, 'div', { className: 'falert', role: 'status' }, [
      el(doc, 'div', { className: 'falert-inner' }, [e.alertTitle, el(doc, 'span', { className: 'falert-actions' }, [e.back, e.hint])]),
    ]);
    e.card = el(doc, 'main', { className: 'fcard' }, [
      el(doc, 'header', { className: 'fbar' }, [el(doc, 'span', { className: 'fstatus' }, [e.dot, e.status]), e.ref, e.close]),
      e.alert,
      el(doc, 'section', { className: 'fstage' }, [e.ayah]),
      el(doc, 'footer', { className: 'fnav' }, [e.prev, e.counter, e.next]),
    ]);
    doc.body.append(e.card);

    e.close.addEventListener('click', () => this.close());
    e.back.addEventListener('click', () => this.confirmBack());
    e.prev.addEventListener('click', () => this.onKey({ key: 'ArrowRight', preventDefault() {} }));
    e.next.addEventListener('click', () => this.onKey({ key: 'ArrowLeft', preventDefault() {} }));
    doc.addEventListener('keydown', (ev) => this.handleKey(ev));
    win.addEventListener('pagehide', () => { this.win = null; this.onClose?.(); });

    if (!reduceMotion()) {
      e.card.animate(
        [{ opacity: 0, transform: 'translateY(8px) scale(0.97)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: EASE },
      );
    }
  }

  // Animate out, then close the window.
  async close() {
    if (!this.open) return;
    if (!reduceMotion()) {
      await this.els.card.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(0.97)' }],
        { duration: 200, easing: EASE, fill: 'forwards' },
      ).finished.catch(() => {});
    }
    this.win?.close();
  }

  // The alert strip is "confirm to leave": Space/Enter (or the button) goes back to the agent.
  confirmBack() {
    if (this.alertKind === 'done') this.setAlert(null);
    this.onBack();
  }

  handleKey(ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if ((ev.key === ' ' || ev.key === 'Enter') && this.alertKind && !ev.target.closest?.('button')) {
      ev.preventDefault();
      return this.confirmBack();
    }
    if (ev.key === 'Escape') return this.close();
    // Reading on after a finished turn quietly clears the "saved" strip.
    if (this.alertKind === 'done' && ['ArrowLeft', 'ArrowRight', 'j', 'k'].includes(ev.key)) this.setAlert(null);
    this.onKey(ev);
  }

  setAlert(kind, title) {
    const a = this.els.alert;
    if (!kind && this.alertKind === 'done') this.dismissedDone = this.doneId;
    this.alertKind = kind;
    if (kind) {
      this.els.alertTitle.textContent = title;
      a.dataset.kind = kind;
    }
    a.classList.toggle('show', Boolean(kind));
  }

  // s: { fill(el), surah, ayah, end, ref, status, statusText, name, counter, canSwitch, doneId, doneTitle }
  render(s) {
    if (!this.open) return;
    const e = this.els;
    const changed = e.text.dataset.key !== `${s.surah}:${s.ayah}`;
    e.text.dataset.key = `${s.surah}:${s.ayah}`;
    s.fill(e.text); // the caller writes the ayah with textContent and verifies it
    e.end.textContent = s.end;
    e.ref.textContent = s.ref;
    e.counter.textContent = s.counter;
    e.card.dataset.status = s.status;
    e.status.textContent = s.statusText;
    e.back.textContent = `Back to ${s.name}`;
    e.back.hidden = !s.canSwitch;
    e.hint.hidden = !s.canSwitch;
    if (changed && !reduceMotion()) {
      e.ayah.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE });
    }
    this.doneId = s.doneId;
    if (s.status === 'needs_you') this.setAlert('needs_you', `${s.name} needs you`);
    else if (s.status === 'done' && s.doneId && s.doneId !== this.dismissedDone) this.setAlert('done', s.doneTitle);
    else if (this.alertKind === 'needs_you' || s.status !== 'done') this.setAlert(null);
  }
}
