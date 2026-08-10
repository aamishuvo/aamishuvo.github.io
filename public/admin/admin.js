/* Admin panel — vanilla JS, no dependencies.
   Edits repo content through the GitHub Contents API; every save is a commit,
   and GitHub Actions rebuilds the site. The token lives only in this browser. */

(() => {
  'use strict';

  const API = 'https://api.github.com';
  const FILES = {
    'site-en': { path: 'src/data/en.json', title: 'Site content — English' },
    'site-bn': { path: 'src/data/bn.json', title: 'Site content — বাংলা' },
    postits: { path: 'src/data/postits.json', title: 'Post-it board' },
    quiz: { path: 'src/data/quiz.json', title: 'Strategic diagnostic' },
    settings: { path: 'src/data/settings.json', title: 'Settings (email, links, lead endpoint)' }
  };
  const BLOG_DIRS = { en: 'src/content/blog/en', bn: 'src/content/blog/bn' };
  const IMG_DIR = 'public/assets/img';

  const $ = (sel, el = document) => el.querySelector(sel);
  const state = {
    token: '', repo: '', branch: 'main',
    tab: 'site-en',
    cache: {} // path -> { sha, data (parsed json) | text }
  };

  /* ── utf-8 safe base64 ── */
  const enc = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const dec = (b64) => {
    const bin = atob(b64.replace(/\n/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  /* ── github api ── */
  async function gh(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${state.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers
      }
    });
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).message || res.statusText;
      throw new Error(`GitHub ${res.status}: ${msg}`);
    }
    return res.status === 204 ? null : res.json();
  }
  const contentsUrl = (path) => `/repos/${state.repo}/contents/${path}`;

  async function readFile(path) {
    const json = await gh(`${contentsUrl(path)}?ref=${encodeURIComponent(state.branch)}`);
    return { sha: json.sha, text: dec(json.content) };
  }
  async function writeFile(path, text, message, sha) {
    const body = { message, content: enc(text), branch: state.branch };
    if (sha) body.sha = sha;
    const res = await gh(contentsUrl(path), { method: 'PUT', body: JSON.stringify(body) });
    return res.content.sha;
  }
  async function deleteFile(path, message, sha) {
    await gh(contentsUrl(path), { method: 'DELETE', body: JSON.stringify({ message, sha, branch: state.branch }) });
  }
  async function listDir(path) {
    try {
      return await gh(`${contentsUrl(path)}?ref=${encodeURIComponent(state.branch)}`);
    } catch (e) {
      if (String(e).includes('404')) return [];
      throw e;
    }
  }

  /* ── status bar ── */
  const statusEl = $('#status');
  function status(text, cls = '') {
    statusEl.textContent = text;
    statusEl.className = cls;
  }
  async function busy(label, fn) {
    status(label + '…', 'busy');
    try {
      const out = await fn();
      status('Saved. The site rebuilds in a minute or two.', 'ok');
      return out;
    } catch (e) {
      status(String(e.message || e), 'err');
      alert(e.message || e);
      throw e;
    }
  }

  /* ── login flow ── */
  const loginEl = $('#login'), appEl = $('#app');

  function storedAuth() {
    const raw = localStorage.getItem('admin-auth') || sessionStorage.getItem('admin-auth');
    return raw ? JSON.parse(raw) : null;
  }

  async function tryLogin(token, repo, branch, remember) {
    state.token = token.trim();
    state.repo = repo.trim();
    state.branch = branch.trim() || 'main';
    await gh(`/repos/${state.repo}`); // validates token + repo access
    const payload = JSON.stringify({ token: state.token, repo: state.repo, branch: state.branch });
    (remember ? localStorage : sessionStorage).setItem('admin-auth', payload);
    loginEl.hidden = true;
    appEl.hidden = false;
    $('#actionsLink').href = `https://github.com/${state.repo}/actions`;
    openTab(state.tab);
  }

  $('#loginBtn').addEventListener('click', async () => {
    $('#loginErr').textContent = '';
    try {
      await tryLogin($('#tokenInput').value, $('#repoInput').value, $('#branchInput').value, $('#rememberInput').checked);
    } catch (e) {
      $('#loginErr').textContent = e.message || String(e);
    }
  });

  $('#logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('admin-auth');
    sessionStorage.removeItem('admin-auth');
    location.reload();
  });

  const saved = storedAuth();
  if (saved) {
    tryLogin(saved.token, saved.repo, saved.branch, !!localStorage.getItem('admin-auth'))
      .catch(() => { localStorage.removeItem('admin-auth'); sessionStorage.removeItem('admin-auth'); });
  }

  /* ── tabs ── */
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b === btn));
    openTab(btn.dataset.tab);
  });

  const panel = $('#panel');
  function openTab(tab) {
    state.tab = tab;
    panel.innerHTML = '';
    if (tab === 'blog') renderBlog();
    else if (tab === 'images') renderImages();
    else renderJsonEditor(tab);
  }

  /* ══════════════ generic JSON editor ══════════════
     Recursively renders a friendly form for any JSON structure.
     Inputs write straight back into the in-memory object; Save commits it. */

  const label = (key) =>
    String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());

  function fieldFor(obj, key, value) {
    const wrap = document.createElement('label');
    wrap.append(label(key));
    let input;
    if (key === 'availability' && typeof value === 'string') {
      // one-click status switch; the site colors the hero pill to match
      input = document.createElement('select');
      for (const [val, text] of [
        ['employed', '🔴 Employed — not available (red)'],
        ['available', '🟢 Open to work (green)'],
        ['break', '🟡 On a break from corporate life (amber)']
      ]) {
        const o = document.createElement('option');
        o.value = val; o.textContent = text;
        input.append(o);
      }
      input.value = value;
      input.addEventListener('change', () => { obj[key] = input.value; });
      wrap.append(input);
      return wrap;
    }
    if (typeof value === 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value;
      input.style.width = 'auto';
      input.addEventListener('change', () => { obj[key] = input.checked; });
    } else if (typeof value === 'number') {
      input = document.createElement('input');
      input.type = 'number';
      input.value = value;
      input.addEventListener('input', () => { obj[key] = Number(input.value); });
    } else {
      const long = String(value).length > 70 || String(value).includes('\n');
      input = document.createElement(long ? 'textarea' : 'input');
      input.value = value;
      input.addEventListener('input', () => { obj[key] = input.value; });
    }
    wrap.append(input);
    return wrap;
  }

  function renderNode(container, obj, key, value) {
    if (Array.isArray(value)) {
      const fs = document.createElement('fieldset');
      const lg = document.createElement('legend');
      lg.textContent = label(key);
      fs.append(lg);
      const renderItems = () => {
        fs.querySelectorAll(':scope > .arr-item, :scope > .add-item').forEach((n) => n.remove());
        value.forEach((item, i) => {
          const box = document.createElement('div');
          box.className = 'arr-item';
          const rm = document.createElement('button');
          rm.className = 'rm';
          rm.type = 'button';
          rm.textContent = '✕ remove';
          rm.addEventListener('click', () => {
            if (!confirm('Remove this item?')) return;
            value.splice(i, 1);
            renderItems();
          });
          box.append(rm);
          if (item !== null && typeof item === 'object') {
            for (const [k, v] of Object.entries(item)) renderNode(box, item, k, v);
          } else {
            box.append(fieldFor(value, i, item));
          }
          fs.append(box);
        });
        const add = document.createElement('button');
        add.className = 'add-item';
        add.type = 'button';
        add.textContent = '+ add item';
        add.addEventListener('click', () => {
          const template = value[value.length - 1];
          value.push(template !== null && typeof template === 'object'
            ? JSON.parse(JSON.stringify(template))
            : (typeof template === 'number' ? 0 : ''));
          renderItems();
        });
        fs.append(add);
      };
      renderItems();
      container.append(fs);
    } else if (value !== null && typeof value === 'object') {
      const fs = document.createElement('fieldset');
      const lg = document.createElement('legend');
      lg.textContent = label(key);
      fs.append(lg);
      for (const [k, v] of Object.entries(value)) renderNode(fs, value, k, v);
      container.append(fs);
    } else {
      container.append(fieldFor(obj, key, value));
    }
  }

  async function renderJsonEditor(tab) {
    const { path, title } = FILES[tab];
    status('Loading ' + path + '…', 'busy');
    const { sha, text } = await readFile(path);
    const data = JSON.parse(text);
    state.cache[path] = { sha, data };
    status('Ready.');

    const head = document.createElement('div');
    head.className = 'editor-head';
    head.innerHTML = `<h2>${title}</h2>`;
    const save = document.createElement('button');
    save.className = 'btn';
    save.textContent = 'Save & publish';
    save.addEventListener('click', () => busy('Saving', async () => {
      save.disabled = true;
      try {
        const newSha = await writeFile(path, JSON.stringify(data, null, 2) + '\n', `admin: update ${path}`, state.cache[path].sha);
        state.cache[path].sha = newSha;
      } finally {
        save.disabled = false;
      }
    }));
    head.append(save);
    panel.append(head);

    const form = document.createElement('div');
    for (const [k, v] of Object.entries(data)) renderNode(form, data, k, v);
    panel.append(form);
  }

  /* ══════════════ blog editor ══════════════ */

  function parseFrontmatter(text) {
    const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) return { fm: {}, body: text };
    const fm = {};
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (!kv) continue;
      let v = kv[2].trim();
      if (v.startsWith('[')) {
        try { v = JSON.parse(v.replace(/'/g, '"')); } catch { v = []; }
      } else {
        v = v.replace(/^["']|["']$/g, '');
      }
      fm[kv[1]] = v;
    }
    return { fm, body: m[2] };
  }

  function serializePost(fm, body) {
    const esc = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
    const lines = ['---',
      `title: ${esc(fm.title)}`,
      `description: ${esc(fm.description)}`,
      `date: ${fm.date}`,
      `lang: ${fm.lang}`,
      `tags: ${JSON.stringify(fm.tags || [])}`,
      `draft: ${fm.draft ? 'true' : 'false'}`,
      '---', '', body.trim(), ''];
    return lines.join('\n');
  }

  async function renderBlog() {
    status('Loading posts…', 'busy');
    const [en, bn] = await Promise.all([listDir(BLOG_DIRS.en), listDir(BLOG_DIRS.bn)]);
    status('Ready.');

    const head = document.createElement('div');
    head.className = 'editor-head';
    head.innerHTML = '<h2>Blog posts</h2>';
    const add = document.createElement('button');
    add.className = 'btn';
    add.textContent = '+ New post';
    add.addEventListener('click', () => editPost(null));
    head.append(add);
    panel.append(head);

    const list = document.createElement('div');
    list.className = 'post-list';
    const rows = [...en.map((f) => ({ ...f, lang: 'en' })), ...bn.map((f) => ({ ...f, lang: 'bn' }))]
      .filter((f) => f.name.endsWith('.md'));
    for (const f of rows) {
      const row = document.createElement('div');
      row.className = 'post-row';
      row.innerHTML = `<span class="lang-chip">${f.lang}</span><b>${f.name}</b>`;
      const edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => editPost(f));
      const del = document.createElement('button');
      del.className = 'danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm(`Delete ${f.name}? This removes the published post.`)) return;
        await busy('Deleting', () => deleteFile(f.path, `admin: delete post ${f.name}`, f.sha));
        openTab('blog');
      });
      row.append(edit, del);
      list.append(row);
    }
    panel.append(list);
  }

  async function editPost(file) {
    panel.innerHTML = '';
    let fm = { title: '', description: '', date: new Date().toISOString().slice(0, 10), lang: 'en', tags: [], draft: false };
    let body = '';
    let sha = null;
    let existingPath = null;

    if (file) {
      status('Loading ' + file.name + '…', 'busy');
      const res = await readFile(file.path);
      sha = res.sha;
      existingPath = file.path;
      const parsed = parseFrontmatter(res.text);
      fm = { ...fm, ...parsed.fm, lang: file.lang };
      if (typeof fm.tags === 'string') fm.tags = fm.tags ? [fm.tags] : [];
      body = parsed.body.trim();
      status('Ready.');
    }

    const head = document.createElement('div');
    head.className = 'editor-head';
    head.innerHTML = `<h2>${file ? 'Edit: ' + file.name : 'New post'}</h2>`;
    const back = document.createElement('button');
    back.className = 'ghost';
    back.textContent = '← All posts';
    back.addEventListener('click', () => openTab('blog'));
    head.append(back);
    panel.append(head);

    const ed = document.createElement('div');
    ed.className = 'post-editor';
    ed.innerHTML = `
      <div class="two-col">
        <label>Title<input id="pTitle"></label>
        <label>Slug (filename, no .md)<input id="pSlug" ${file ? 'disabled' : ''}></label>
        <label>Date (YYYY-MM-DD)<input id="pDate"></label>
        <label>Language
          <select id="pLang" ${file ? 'disabled' : ''}>
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
          </select>
        </label>
        <label>Tags (comma-separated)<input id="pTags"></label>
        <label class="check" style="align-self:center"><input type="checkbox" id="pDraft" style="width:auto"> Draft (hidden from site)</label>
      </div>
      <label>Description<textarea id="pDesc"></textarea></label>
      <label>Body (Markdown)<textarea id="pBody" class="body"></textarea></label>
    `;
    panel.append(ed);

    $('#pTitle').value = fm.title;
    $('#pSlug').value = file ? file.name.replace(/\.md$/, '') : '';
    $('#pDate').value = String(fm.date).slice(0, 10);
    $('#pLang').value = fm.lang;
    $('#pTags').value = (fm.tags || []).join(', ');
    $('#pDraft').checked = fm.draft === true || fm.draft === 'true';
    $('#pDesc').value = fm.description;
    $('#pBody').value = body;

    const save = document.createElement('button');
    save.className = 'btn';
    save.textContent = 'Save & publish';
    save.addEventListener('click', () => busy('Saving post', async () => {
      const lang = $('#pLang').value;
      const slug = ($('#pSlug').value || $('#pTitle').value)
        .toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
      if (!slug) throw new Error('A slug (or title) is required.');
      const text = serializePost({
        title: $('#pTitle').value,
        description: $('#pDesc').value,
        date: $('#pDate').value,
        lang,
        tags: $('#pTags').value.split(',').map((s) => s.trim()).filter(Boolean),
        draft: $('#pDraft').checked
      }, $('#pBody').value);
      const path = existingPath || `${BLOG_DIRS[lang]}/${slug}.md`;
      const newSha = await writeFile(path, text, `admin: ${file ? 'update' : 'create'} post ${slug}`, sha);
      sha = newSha;
      existingPath = path;
    }));
    panel.append(save);
  }

  /* ══════════════ images ══════════════ */

  async function renderImages() {
    status('Loading images…', 'busy');
    const files = (await listDir(IMG_DIR)).filter((f) => f.type === 'file');
    status('Ready.');

    const head = document.createElement('div');
    head.className = 'editor-head';
    head.innerHTML = '<h2>Images</h2><span style="color:var(--muted);font-size:.8rem">Files land in /assets/img/ — reference them from posts as /assets/img/name.ext</span>';
    panel.append(head);

    const drop = document.createElement('div');
    drop.className = 'drop';
    drop.textContent = 'Click or drop an image here to upload';
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.hidden = true;
    drop.append(picker);
    drop.addEventListener('click', () => picker.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
    });
    picker.addEventListener('change', () => { if (picker.files[0]) upload(picker.files[0]); });
    panel.append(drop);

    const grid = document.createElement('div');
    grid.className = 'img-grid';
    for (const f of files) {
      const card = document.createElement('div');
      card.className = 'img-card';
      card.innerHTML = `<img src="${f.download_url}" loading="lazy" alt=""><span>${f.name}</span>`;
      const del = document.createElement('button');
      del.className = 'ghost';
      del.style.marginTop = '.4rem';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm(`Delete ${f.name}?`)) return;
        await busy('Deleting', () => deleteFile(f.path, `admin: delete image ${f.name}`, f.sha));
        openTab('images');
      });
      card.append(del);
      grid.append(card);
    }
    panel.append(grid);

    async function upload(fileObj) {
      await busy('Uploading ' + fileObj.name, async () => {
        const buf = new Uint8Array(await fileObj.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000)
          bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const name = fileObj.name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
        const path = `${IMG_DIR}/${name}`;
        let sha;
        try { sha = (await gh(`${contentsUrl(path)}?ref=${encodeURIComponent(state.branch)}`)).sha; } catch { /* new file */ }
        const body = { message: `admin: upload image ${name}`, content: btoa(bin), branch: state.branch };
        if (sha) body.sha = sha;
        await gh(contentsUrl(path), { method: 'PUT', body: JSON.stringify(body) });
      });
      openTab('images');
    }
  }
})();
