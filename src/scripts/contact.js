// Contact form. Posts to settings.leadEndpoint when one is configured;
// otherwise falls back to opening a pre-filled mail client. Static-site safe.

const form = document.getElementById('contactForm');
if (form) initContact(form);

function initContact(form) {
  const cfg = JSON.parse(document.getElementById('formConfig').textContent);
  const status = document.getElementById('formStatus');
  const button = form.querySelector('button[type="submit"]');

  function values() {
    const d = new FormData(form);
    return {
      name: (d.get('name') || '').toString().trim(),
      email: (d.get('email') || '').toString().trim(),
      org: (d.get('org') || '').toString().trim(),
      message: (d.get('message') || '').toString().trim()
    };
  }

  function mailtoFor(v) {
    const subject = `Website enquiry — ${v.name}${v.org ? ' (' + v.org + ')' : ''}`;
    const body = [
      `Name: ${v.name}`,
      `Email: ${v.email}`,
      v.org ? `Organization: ${v.org}` : '',
      '',
      v.message
    ].filter(Boolean).join('\n');
    return `mailto:${cfg.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function done() {
    form.innerHTML = '';
    const h = document.createElement('p');
    h.className = 'form-sent-title';
    h.textContent = cfg.sentTitle;
    const p = document.createElement('p');
    p.className = 'contact-note';
    p.textContent = cfg.sentBody;
    form.append(h, p);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const v = values();

    if (!cfg.endpoint) {
      status.textContent = cfg.mailFallback;
      location.href = mailtoFor(v);
      return;
    }

    button.disabled = true;
    button.textContent = cfg.sending;
    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...v, page: location.href })
      });
      if (!res.ok) throw new Error('bad response');
      done();
    } catch {
      // endpoint unreachable — hand the message to the mail client instead
      status.textContent = cfg.mailFallback;
      location.href = mailtoFor(v);
      button.disabled = false;
      button.textContent = cfg.send;
    }
  });
}
