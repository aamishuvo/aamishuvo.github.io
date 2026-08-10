// Interactive board: a grid of cells, draggable pinned post-its connected to
// their cells with SVG wires, and click-to-spawn notes that fall after 8s.

const board = document.getElementById('boardEl');
if (board) initBoard(board);

function initBoard(board) {
  const data = JSON.parse(document.getElementById('boardData').textContent);
  const grid = document.getElementById('boardGrid');
  const svg = document.getElementById('wires');
  const FALL_AFTER_MS = 8000;

  // ── cells ──
  const cellEls = {};
  for (const cell of data.cells) {
    const el = document.createElement('button');
    el.className = 'board-cell';
    el.textContent = cell.label;
    el.dataset.id = cell.id;
    el.addEventListener('click', () => popNote(cell, el));
    grid.appendChild(el);
    cellEls[cell.id] = el;
  }

  // ── pinned post-its ──
  const wires = []; // { path, from: postit el, to: cell el }
  for (const pin of data.pinned) {
    const note = document.createElement('div');
    note.className = `postit ${pin.color}`;
    note.textContent = pin.text;
    note.style.left = pin.x + '%';
    note.style.top = pin.y + '%';
    note.style.rotate = (Math.random() * 8 - 4) + 'deg';
    board.appendChild(note);
    makeDraggable(note);
    if (pin.wireTo && cellEls[pin.wireTo]) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);
      wires.push({ path, from: note, to: cellEls[pin.wireTo] });
    }
  }

  // ── wires: quadratic curves with a little sag, like string ──
  function center(el) {
    const b = board.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 };
  }
  function drawWires() {
    for (const w of wires) {
      if (!w.from.isConnected) { w.path.remove(); continue; }
      const a = center(w.from), b = center(w.to);
      const mx = (a.x + b.x) / 2;
      const my = Math.max(a.y, b.y) + 30; // sag
      w.path.setAttribute('d', `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`);
    }
    requestAnimationFrame(drawWires);
  }
  requestAnimationFrame(drawWires);

  // ── drag (pointer events; works for touch too) ──
  function makeDraggable(el) {
    let sx, sy, ox, oy, dragging = false;
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY;
      ox = el.offsetLeft; oy = el.offsetTop;
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const bw = board.clientWidth, bh = board.clientHeight;
      const x = Math.min(Math.max(ox + e.clientX - sx, 0), bw - el.offsetWidth);
      const y = Math.min(Math.max(oy + e.clientY - sy, 0), bh - el.offsetHeight);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });
    const end = () => { dragging = false; el.classList.remove('dragging'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ── click a cell → a note pops up near it, then falls after 8s ──
  function popNote(cell, cellEl) {
    const note = document.createElement('div');
    note.className = `postit ${cell.color} pop`;
    note.textContent = cell.note;

    const b = board.getBoundingClientRect();
    const r = cellEl.getBoundingClientRect();
    const noteW = 160;
    let x = r.left - b.left + r.width / 2 - noteW / 2 + (Math.random() * 40 - 20);
    let y = r.top - b.top - 30 + (Math.random() * 24 - 12);
    x = Math.min(Math.max(x, 4), board.clientWidth - noteW - 4);
    y = Math.max(y, 4);
    note.style.left = x + 'px';
    note.style.top = y + 'px';
    note.style.rotate = (Math.random() * 10 - 5) + 'deg';

    board.appendChild(note);
    makeDraggable(note);

    setTimeout(() => {
      note.classList.add('falling');
      note.addEventListener('animationend', () => note.remove(), { once: true });
    }, FALL_AFTER_MS);
  }
}
