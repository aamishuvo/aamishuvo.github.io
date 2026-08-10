// Strategic diagnostic: 3 questions read aloud via the Web Speech API,
// a 0–9 score, a personalized verdict, and lead capture.
// Leads: POSTed to settings.leadEndpoint when configured (e.g. Formspree),
// always offered as a pre-filled mailto as well.

const mount = document.getElementById('diagMount');
if (mount) initQuiz(mount);

function initQuiz(mount) {
  const data = JSON.parse(document.getElementById('quizData').textContent);
  const ui = data.ui;
  const isBn = data.lang === 'bn';

  let voiceOn = true;
  let step = -1;            // -1 intro, 0..n-1 questions, n form, n+1 verdict
  const answers = [];       // picked scores
  const lead = { name: '', email: '' };

  // ── speech ──
  function speak(text) {
    if (!voiceOn || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = isBn ? 'bn-BD' : 'en-GB';
    u.rate = 1.02;
    u.pitch = 0.9;
    const voices = speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang.toLowerCase().startsWith(isBn ? 'bn' : 'en'));
    if (match) u.voice = match;
    speechSynthesis.speak(u);
  }
  // some browsers load voices asynchronously
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  const voiceBtn = document.getElementById('voiceToggle');
  voiceBtn.addEventListener('click', () => {
    voiceOn = !voiceOn;
    voiceBtn.setAttribute('aria-pressed', String(voiceOn));
    voiceBtn.querySelector('span').textContent = voiceOn ? '🔊' : '🔇';
    if (!voiceOn && 'speechSynthesis' in window) speechSynthesis.cancel();
  });

  document.getElementById('diagStart').addEventListener('click', () => { step = 0; render(); });

  const h = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  function render() {
    // keep the voice toggle alive across steps
    mount.querySelectorAll(':scope > *:not(#voiceToggle)').forEach((el) => {
      if (el.id !== 'voiceToggle') el.remove();
    });

    if (step >= 0 && step < data.questions.length) renderQuestion();
    else if (step === data.questions.length) renderForm();
    else if (step > data.questions.length) renderVerdict();
  }

  function renderQuestion() {
    const q = data.questions[step];
    const wrap = h('div', 'diag-step');
    wrap.appendChild(h('p', 'diag-progress',
      ui.questionOf.replace('{n}', fmtNum(step + 1)).replace('{total}', fmtNum(data.questions.length))));
    wrap.appendChild(h('p', 'diag-q', q.q));
    const opts = h('div', 'diag-opts');
    q.options.forEach((o) => {
      const btn = h('button', 'diag-opt', o.label);
      btn.addEventListener('click', () => {
        opts.querySelectorAll('.diag-opt').forEach((b) => b.classList.remove('picked'));
        btn.classList.add('picked');
        answers[step] = o.score;
        setTimeout(() => { step++; render(); }, 420);
      });
      opts.appendChild(btn);
    });
    wrap.appendChild(opts);
    mount.insertBefore(wrap, voiceBtn);
    speak(q.q);
  }

  function renderForm() {
    const wrap = h('div', 'diag-step');
    wrap.appendChild(h('p', 'diag-q', isBn ? 'রায় প্রস্তুত। কার নামে লিখব?' : 'Verdict ready. Who should it address?'));
    const form = h('form', 'diag-form');

    const nameLabel = h('label', '', ui.yourName);
    const nameInput = h('input');
    nameInput.placeholder = ui.namePlaceholder;
    nameInput.required = true;
    nameInput.name = 'name';

    const emailLabel = h('label', '', ui.yourEmail);
    const emailInput = h('input');
    emailInput.type = 'email';
    emailInput.placeholder = ui.emailPlaceholder;
    emailInput.name = 'email';

    const go = h('button', 'btn', ui.seeVerdict);
    go.type = 'submit';

    form.append(nameLabel, nameInput, emailLabel, emailInput, go);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      lead.name = nameInput.value.trim() || (isBn ? 'বন্ধু' : 'friend');
      lead.email = emailInput.value.trim();
      step++;
      render();
      sendLeadSilently();
    });
    wrap.appendChild(form);
    mount.insertBefore(wrap, voiceBtn);
    speak(isBn ? 'শেষ ধাপ। আপনার নামটা বলুন।' : 'Last step. Tell me your name.');
  }

  function fmtNum(n) {
    return new Intl.NumberFormat(isBn ? 'bn-BD' : 'en-US').format(n);
  }

  function score() { return answers.reduce((a, b) => a + (b || 0), 0); }
  function maxScore() { return data.questions.length * 3; }
  function verdictFor(s) { return data.verdicts.find((v) => s >= v.min) || data.verdicts[data.verdicts.length - 1]; }

  function renderVerdict() {
    const s = score();
    const v = verdictFor(s);
    const text = v.text.replaceAll('{name}', lead.name);

    const wrap = h('div', 'diag-step');
    const ring = h('div', 'score-ring');
    const num = h('div', 'score-num', `${fmtNum(s)}/${fmtNum(maxScore())}`);
    const label = h('div', 'score-label', ui.scoreLabel);
    ring.append(num, label);
    wrap.appendChild(ring);
    wrap.appendChild(h('p', 'verdict-title', v.title));
    wrap.appendChild(h('p', 'verdict-text', text));

    const actions = h('div', 'diag-actions');
    const mail = h('a', 'btn', ui.sendLead);
    const subject = isBn ? `ডায়াগনস্টিক ফলাফল — ${lead.name}` : `Diagnostic read-out — ${lead.name}`;
    const bodyLines = [
      `${isBn ? 'নাম' : 'Name'}: ${lead.name}`,
      `${isBn ? 'ইমেইল' : 'Email'}: ${lead.email || '—'}`,
      `${isBn ? 'স্কোর' : 'Score'}: ${s}/${maxScore()}`,
      `${isBn ? 'রায়' : 'Verdict'}: ${v.title}`,
      '',
      ...data.questions.map((q, i) => `Q${i + 1} (${q.id}): ${answers[i]}/3`)
    ];
    mail.href = `mailto:${data.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
    const retake = h('button', 'btn ghost', ui.retake);
    retake.addEventListener('click', () => { step = 0; answers.length = 0; render(); });
    actions.append(mail, retake);
    wrap.appendChild(actions);
    mount.insertBefore(wrap, voiceBtn);

    speak(`${v.title}. ${text}`);
  }

  // If a lead endpoint (e.g. Formspree) is configured, deliver the lead
  // without requiring the visitor to open their mail client.
  function sendLeadSilently() {
    if (!data.leadEndpoint) return;
    try {
      fetch(data.leadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: lead.name,
          email: lead.email,
          score: `${score()}/${maxScore()}`,
          verdict: verdictFor(score()).title,
          answers: data.questions.map((q, i) => ({ id: q.id, score: answers[i] })),
          lang: data.lang,
          page: location.href
        })
      });
    } catch { /* lead capture is best-effort */ }
  }
}
