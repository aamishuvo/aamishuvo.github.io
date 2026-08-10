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
  const MODEL_DIR = 'public/assets/models';

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
    // image/model fields get an upload button and a live thumbnail
    if (typeof value === 'string' && /^(logo|cover|photo|image|icon|avatarModel)$|Photo$|Image$|Logo$|Model$/i.test(String(key))) {
      const isModelField = /model/i.test(String(key));
      const row = document.createElement('div');
      row.className = 'img-field';

      const thumb = document.createElement('span');
      thumb.className = 'img-thumb';

      input = document.createElement('input');
      input.value = value;
      input.placeholder = isModelField ? '/assets/models/avatar.glb' : '/assets/img/logo.png';

      const drawThumb = () => {
        thumb.innerHTML = '';
        if (!input.value.trim()) { thumb.textContent = '—'; return; }
        if (isModelField) { thumb.textContent = '3D'; return; }
        const img = document.createElement('img');
        img.src = input.value.trim();
        img.alt = '';
        thumb.append(img);
      };
      input.addEventListener('input', () => { obj[key] = input.value; drawThumb(); });

      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'ghost';
      pick.textContent = 'Upload…';
      pick.addEventListener('click', () => {
        const fp = document.createElement('input');
        fp.type = 'file';
        fp.accept = isModelField ? '.glb,.gltf,model/gltf-binary' : 'image/*';
        fp.onchange = async () => {
          if (!fp.files[0]) return;
          const url = await busy(isModelField ? 'Uploading 3D model' : 'Uploading image', () => uploadImage(fp.files[0]));
          input.value = url;
          obj[key] = url;
          drawThumb();
        };
        fp.click();
      });

      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'ghost';
      clear.textContent = 'Clear';
      clear.addEventListener('click', () => { input.value = ''; obj[key] = ''; drawThumb(); });

      drawThumb();
      row.append(thumb, input, pick, clear);
      wrap.append(row);
      return wrap;
    }

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
        fs.querySelectorAll(':scope > .arr-item, :scope > .add-item, :scope > .arr-hint').forEach((n) => n.remove());

        if (value.length > 1) {
          const hint = document.createElement('p');
          hint.className = 'arr-hint';
          hint.textContent = 'Drag ⠿ to reorder, or use ↑ ↓. The order here is the order on the site.';
          fs.append(hint);
        }

        const move = (from, to) => {
          if (to < 0 || to >= value.length) return;
          value.splice(to, 0, value.splice(from, 1)[0]);
          renderItems();
        };

        value.forEach((item, i) => {
          const box = document.createElement('div');
          box.className = 'arr-item';
          box.draggable = false;

          const tools = document.createElement('div');
          tools.className = 'arr-tools';

          const grip = document.createElement('span');
          grip.className = 'grip';
          grip.textContent = '⠿';
          grip.title = 'Drag to reorder';
          // only start a drag from the handle, so text fields stay selectable
          grip.addEventListener('mousedown', () => { box.draggable = true; });
          grip.addEventListener('mouseup', () => { box.draggable = false; });

          const up = document.createElement('button');
          up.type = 'button'; up.className = 'ord'; up.textContent = '↑'; up.title = 'Move up';
          up.disabled = i === 0;
          up.addEventListener('click', () => move(i, i - 1));

          const down = document.createElement('button');
          down.type = 'button'; down.className = 'ord'; down.textContent = '↓'; down.title = 'Move down';
          down.disabled = i === value.length - 1;
          down.addEventListener('click', () => move(i, i + 1));

          const pos = document.createElement('span');
          pos.className = 'arr-pos';
          pos.textContent = `${i + 1} / ${value.length}`;

          const rm = document.createElement('button');
          rm.className = 'rm';
          rm.type = 'button';
          rm.textContent = '✕ remove';
          rm.addEventListener('click', () => {
            if (!confirm('Remove this item?')) return;
            value.splice(i, 1);
            renderItems();
          });

          tools.append(grip, up, down, pos, rm);
          box.append(tools);

          box.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
            box.classList.add('dragging');
          });
          box.addEventListener('dragend', () => {
            box.classList.remove('dragging');
            box.draggable = false;
            fs.querySelectorAll('.arr-item').forEach((n) => n.classList.remove('drop-target'));
          });
          box.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            box.classList.add('drop-target');
          });
          box.addEventListener('dragleave', () => box.classList.remove('drop-target'));
          box.addEventListener('drop', (e) => {
            e.preventDefault();
            box.classList.remove('drop-target');
            const from = Number(e.dataTransfer.getData('text/plain'));
            if (!Number.isNaN(from) && from !== i) move(from, i);
          });

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
      `title: ${esc(fm.title)}`];
    if (fm.subtitle) lines.push(`subtitle: ${esc(fm.subtitle)}`);
    lines.push(`description: ${esc(fm.description)}`);
    if (fm.cover) lines.push(`cover: ${esc(fm.cover)}`);
    lines.push(
      `date: ${fm.date}`,
      `lang: ${fm.lang}`,
      `tags: ${JSON.stringify(fm.tags || [])}`,
      `draft: ${fm.draft ? 'true' : 'false'}`,
      '---', '', body.trim(), '');
    return lines.join('\n');
  }

  /* Upload a File to public/assets (img or models) and return its site path. */
  async function uploadImage(fileObj) {
    const buf = new Uint8Array(await fileObj.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000)
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const name = fileObj.name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
    const isModel = /\.(glb|gltf)$/.test(name);
    const dir = isModel ? MODEL_DIR : IMG_DIR;
    const path = `${dir}/${name}`;
    let sha;
    try { sha = (await gh(`${contentsUrl(path)}?ref=${encodeURIComponent(state.branch)}`)).sha; } catch { /* new file */ }
    const body = { message: `admin: upload ${isModel ? 'model' : 'image'} ${name}`, content: btoa(bin), branch: state.branch };
    if (sha) body.sha = sha;
    await gh(contentsUrl(path), { method: 'PUT', body: JSON.stringify(body) });
    return `/assets/${isModel ? 'models' : 'img'}/${name}`;
  }

  /* Minimal Markdown → HTML, for the editor preview only. */
  function mdPreview(md) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => esc(s)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

    const out = [];
    let inList = false, inQuote = false, inCode = false;
    for (const raw of md.split('\n')) {
      const line = raw.trimEnd();
      if (/^```/.test(line)) {
        out.push(inCode ? '</code></pre>' : '<pre><code>');
        inCode = !inCode;
        continue;
      }
      if (inCode) { out.push(esc(raw)); continue; }
      const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
      const closeQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };

      if (/^#{1,6}\s/.test(line)) {
        closeList(); closeQuote();
        const level = line.match(/^#+/)[0].length;
        out.push(`<h${level}>${inline(line.replace(/^#+\s*/, ''))}</h${level}>`);
      } else if (/^[-*]\s+/.test(line)) {
        closeQuote();
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      } else if (/^>\s?/.test(line)) {
        closeList();
        if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
        out.push(`<p>${inline(line.replace(/^>\s?/, ''))}</p>`);
      } else if (!line.trim()) {
        closeList(); closeQuote();
      } else {
        closeList(); closeQuote();
        out.push(`<p>${inline(line)}</p>`);
      }
    }
    if (inList) out.push('</ul>');
    if (inQuote) out.push('</blockquote>');
    if (inCode) out.push('</code></pre>');
    return out.join('\n');
  }

  /* Wrap or insert markdown around the textarea selection. */
  function surround(ta, before, after = '', placeholder = '') {
    const start = ta.selectionStart, end = ta.selectionEnd;
    const selected = ta.value.slice(start, end) || placeholder;
    ta.setRangeText(before + selected + after, start, end, 'end');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
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
    let fm = { title: '', subtitle: '', description: '', cover: '', date: new Date().toISOString().slice(0, 10), lang: 'en', tags: [], draft: false };
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
      <label>Title<input id="pTitle" placeholder="The headline of the post"></label>
      <label>Subtitle (optional — shown in the handwritten style)<input id="pSubtitle"></label>
      <div class="two-col">
        <label>Slug (filename, no .md)<input id="pSlug" ${file ? 'disabled' : ''}></label>
        <label>Date (YYYY-MM-DD)<input id="pDate" type="date"></label>
        <label>Language
          <select id="pLang" ${file ? 'disabled' : ''}>
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
          </select>
        </label>
        <label>Tags (comma-separated)<input id="pTags"></label>
      </div>
      <label>Description (shown on cards and in search results)<textarea id="pDesc"></textarea></label>
      <label>Cover image
        <div class="cover-row">
          <input id="pCover" placeholder="/assets/img/cover.jpg">
          <button type="button" class="ghost" id="pCoverBtn">Upload…</button>
        </div>
      </label>
      <div id="pCoverPreview"></div>
      <label class="check"><input type="checkbox" id="pDraft" style="width:auto"> Draft (hidden from the site)</label>

      <div class="md-toolbar" id="mdToolbar">
        <button type="button" data-md="h2" title="Heading">H2</button>
        <button type="button" data-md="h3" title="Sub-heading">H3</button>
        <button type="button" data-md="bold" title="Bold"><b>B</b></button>
        <button type="button" data-md="italic" title="Italic"><i>I</i></button>
        <button type="button" data-md="link" title="Link">🔗</button>
        <button type="button" data-md="list" title="Bullet list">• List</button>
        <button type="button" data-md="quote" title="Quote">❝</button>
        <button type="button" data-md="code" title="Code">&lt;/&gt;</button>
        <button type="button" data-md="hr" title="Divider">―</button>
        <button type="button" data-md="image" title="Upload and insert an image">🖼 Image</button>
        <button type="button" id="previewToggle" class="right">Preview</button>
      </div>
      <div class="editor-split" id="editorSplit">
        <textarea id="pBody" class="body" placeholder="Write your post in Markdown. Drag an image straight into this box to upload it."></textarea>
        <div class="md-preview" id="mdPreviewPane" hidden></div>
      </div>
    `;
    panel.append(ed);

    $('#pTitle').value = fm.title;
    $('#pSubtitle').value = fm.subtitle || '';
    $('#pSlug').value = file ? file.name.replace(/\.md$/, '') : '';
    $('#pDate').value = String(fm.date).slice(0, 10);
    $('#pLang').value = fm.lang;
    $('#pTags').value = (fm.tags || []).join(', ');
    $('#pDraft').checked = fm.draft === true || fm.draft === 'true';
    $('#pDesc').value = fm.description;
    $('#pCover').value = fm.cover || '';
    $('#pBody').value = body;

    const bodyTa = $('#pBody');
    const previewPane = $('#mdPreviewPane');
    const coverPreview = $('#pCoverPreview');

    const drawCover = () => {
      coverPreview.innerHTML = '';
      const url = $('#pCover').value.trim();
      if (!url) return;
      const img = document.createElement('img');
      img.src = url;
      img.className = 'cover-preview';
      coverPreview.append(img);
    };
    $('#pCover').addEventListener('input', drawCover);
    drawCover();

    const filePicker = document.createElement('input');
    filePicker.type = 'file';
    filePicker.accept = 'image/*';
    filePicker.hidden = true;
    panel.append(filePicker);

    $('#pCoverBtn').addEventListener('click', () => {
      filePicker.onchange = async () => {
        if (!filePicker.files[0]) return;
        const url = await busy('Uploading cover', () => uploadImage(filePicker.files[0]));
        $('#pCover').value = url;
        drawCover();
        filePicker.value = '';
      };
      filePicker.click();
    });

    // toolbar
    $('#mdToolbar').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-md]');
      if (!btn) return;
      const kind = btn.dataset.md;
      if (kind === 'h2') surround(bodyTa, '\n## ', '\n', 'Heading');
      else if (kind === 'h3') surround(bodyTa, '\n### ', '\n', 'Sub-heading');
      else if (kind === 'bold') surround(bodyTa, '**', '**', 'bold text');
      else if (kind === 'italic') surround(bodyTa, '*', '*', 'italic text');
      else if (kind === 'link') surround(bodyTa, '[', '](https://)', 'link text');
      else if (kind === 'list') surround(bodyTa, '\n- ', '\n', 'list item');
      else if (kind === 'quote') surround(bodyTa, '\n> ', '\n', 'quoted line');
      else if (kind === 'code') surround(bodyTa, '\n```\n', '\n```\n', 'code');
      else if (kind === 'hr') surround(bodyTa, '\n\n---\n\n', '', '');
      else if (kind === 'image') {
        filePicker.onchange = async () => {
          if (!filePicker.files[0]) return;
          const url = await busy('Uploading image', () => uploadImage(filePicker.files[0]));
          surround(bodyTa, `\n![](${url})\n`, '', '');
          filePicker.value = '';
        };
        filePicker.click();
      }
    });

    // drag an image straight into the body
    bodyTa.addEventListener('dragover', (e) => { e.preventDefault(); bodyTa.classList.add('drag-over'); });
    bodyTa.addEventListener('dragleave', () => bodyTa.classList.remove('drag-over'));
    bodyTa.addEventListener('drop', async (e) => {
      const f = e.dataTransfer.files[0];
      if (!f || !f.type.startsWith('image/')) return;
      e.preventDefault();
      bodyTa.classList.remove('drag-over');
      const url = await busy('Uploading image', () => uploadImage(f));
      surround(bodyTa, `\n![](${url})\n`, '', '');
    });

    // preview
    const refreshPreview = () => { previewPane.innerHTML = mdPreview(bodyTa.value); };
    bodyTa.addEventListener('input', () => { if (!previewPane.hidden) refreshPreview(); });
    $('#previewToggle').addEventListener('click', () => {
      previewPane.hidden = !previewPane.hidden;
      $('#editorSplit').classList.toggle('split', !previewPane.hidden);
      $('#previewToggle').classList.toggle('on', !previewPane.hidden);
      if (!previewPane.hidden) refreshPreview();
    });

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
        subtitle: $('#pSubtitle').value,
        description: $('#pDesc').value,
        cover: $('#pCover').value.trim(),
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
      await busy('Uploading ' + fileObj.name, () => uploadImage(fileObj));
      openTab('images');
    }
  }
})();
