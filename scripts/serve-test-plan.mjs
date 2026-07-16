/**
 * serve-test-plan.mjs
 *
 * Local interactive viewer for PILOT_TEST_PLAN.md — renders every "- [ ]"
 * line as a real checkbox. Clicking one toggles "[ ]" <-> "[x]" directly in
 * the markdown file on disk, so the file itself stays the single source of
 * truth (and git-diffable) — this is just a nicer way to check things off
 * than hand-editing "[ ]" to "[x]" in a text editor.
 *
 * Usage: node scripts/serve-test-plan.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.join(__dirname, '..', 'PILOT_TEST_PLAN.md');
const PORT = 4850;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Very small inline-markdown formatter: **bold** and `code` only.
function formatInline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function parseAndRender() {
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  const lines = raw.split('\n');

  let html = '';
  let inSection = false;
  let sectionOpenItemsHtml = '';
  let sectionTitle = '';
  let sectionChecked = 0;
  let sectionTotal = 0;
  let preamble = '';
  let inTable = false;

  function flushSection() {
    if (!inSection) return;
    const pct = sectionTotal ? Math.round((100 * sectionChecked) / sectionTotal) : 0;
    html += `<section class="sec">
      <div class="sec-head">
        <h2>${formatInline(sectionTitle)}</h2>
        <div class="sec-progress">
          <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="count">${sectionChecked}/${sectionTotal}</span>
        </div>
      </div>
      <ul class="items">${sectionOpenItemsHtml}</ul>
    </section>`;
    sectionOpenItemsHtml = '';
    sectionChecked = 0;
    sectionTotal = 0;
  }

  lines.forEach((line, idx) => {
    const lineNo = idx + 1; // 1-indexed, matches most editors
    const checkboxMatch = line.match(/^(\s*)- \[( |x)\] (.*)$/);
    const headingMatch = line.match(/^## (.+)$/);
    const tableRowMatch = line.match(/^\|.*\|$/);

    if (headingMatch) {
      flushSection();
      inSection = true;
      sectionTitle = headingMatch[1];
      return;
    }

    if (!inSection) {
      // Preamble content before the first "## " heading (title, intro, the
      // static "Progress at a glance" table) — rendered as plain HTML,
      // skipping the table since the page below computes live progress.
      if (tableRowMatch || /^\|---/.test(line)) { inTable = true; return; }
      if (inTable && line.trim() === '') { inTable = false; return; }
      if (inTable) return;
      // Skip the "# Title" line — the sticky header already shows it.
      if (line.startsWith('# ')) return;
      if (line.trim() === '---') { preamble += '<hr />'; return; }
      if (line.trim()) preamble += `<p>${formatInline(line)}</p>`;
      return;
    }

    if (checkboxMatch) {
      const [, , mark, rawText] = checkboxMatch;
      const checked = mark === 'x';
      const noteMatch = rawText.match(/^(.*?)\s*<!-- note:(.*?) -->\s*$/);
      const text = noteMatch ? noteMatch[1] : rawText;
      const note = noteMatch ? decodeURIComponent(noteMatch[2]) : '';
      const isBug = text.trim().startsWith('🐛');
      sectionTotal++;
      if (checked) sectionChecked++;
      sectionOpenItemsHtml += `<li class="item${isBug ? ' bug' : ''}${checked ? ' done' : ''}">
        <label>
          <input type="checkbox" data-line="${lineNo}" ${checked ? 'checked' : ''} />
          <span>${formatInline(text)}</span>
        </label>
        <input type="text" class="note" data-line="${lineNo}" data-saved="${escapeHtml(note)}" placeholder="Add a note / issue…" value="${escapeHtml(note)}" />
      </li>`;
    }
  });
  flushSection();

  const totalChecked = lines.filter((l) => /^\s*- \[x\]/.test(l)).length;
  const totalItems = lines.filter((l) => /^\s*- \[[ x]\]/.test(l)).length;
  const overallPct = totalItems ? Math.round((100 * totalChecked) / totalItems) : 0;

  return { preamble, html, totalChecked, totalItems, overallPct };
}

function renderPage() {
  const { preamble, html, totalChecked, totalItems, overallPct } = parseAndRender();
  return `<!doctype html>
<html lang="he" dir="ltr">
<head>
<meta charset="utf-8" />
<title>Kehila Pilot Test Plan</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --navy: #1B3A6B; --gold: #B8922A; --bg: #f5f2ea; --card: #ffffff; --border: #e2ddd0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: var(--bg); margin: 0; padding: 0 0 80px; color: #222; }
  header { background: var(--navy); color: #fff; padding: 24px 32px; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
  header h1 { margin: 0 0 12px; font-size: 20px; }
  .overall-bar { background: rgba(255,255,255,.2); border-radius: 999px; height: 10px; overflow: hidden; max-width: 480px; }
  .overall-fill { background: var(--gold); height: 100%; transition: width .2s; }
  .overall-label { font-size: 13px; margin-top: 6px; opacity: .9; }
  main { max-width: 820px; margin: 24px auto; padding: 0 16px; }
  .preamble h1 { font-size: 22px; }
  .preamble p { color: #555; font-size: 14px; }
  .preamble hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
  .sec { background: var(--card); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 16px; overflow: hidden; }
  .sec-head { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .sec-head h2 { margin: 0; font-size: 16px; color: var(--navy); }
  .sec-progress { display: flex; align-items: center; gap: 8px; }
  .bar { width: 120px; height: 8px; background: #eee; border-radius: 999px; overflow: hidden; }
  .bar-fill { background: var(--gold); height: 100%; transition: width .2s; }
  .count { font-size: 12px; color: #777; min-width: 40px; text-align: right; }
  .items { list-style: none; margin: 0; padding: 8px 0; }
  .item { padding: 8px 18px; border-bottom: 1px solid #f2f0ea; }
  .item:last-child { border-bottom: none; }
  .item label { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 14px; line-height: 1.5; }
  .item input[type=checkbox] { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--navy); cursor: pointer; }
  .item.done span { color: #999; text-decoration: line-through; }
  .item.bug span { color: #b3261e; }
  .item.bug.done span { color: #999; }
  .item .note { display: block; width: 100%; margin: 6px 0 0 26px; padding: 5px 9px; font-size: 13px;
    border: 1px solid var(--border); border-radius: 6px; background: #fffdf7; color: #6b5d2e; }
  .item .note:focus { outline: 2px solid var(--gold); border-color: var(--gold); }
  .item .note:not(:placeholder-shown) { border-color: #d9c98a; background: #fffbea; }
  code { background: #f0ede3; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  .reload-note { text-align: center; font-size: 12px; color: #999; margin-top: 24px; }
</style>
</head>
<body>
<header>
  <h1>Kehila Pilot Test Plan — מעלה אדומים</h1>
  <div class="overall-bar"><div class="overall-fill" id="overallFill" style="width:${overallPct}%"></div></div>
  <div class="overall-label" id="overallLabel">${totalChecked} / ${totalItems} checked (${overallPct}%)</div>
</header>
<main>
  <div class="preamble">${preamble}</div>
  <div id="sections">${html}</div>
  <p class="reload-note">Toggling a box or editing a note writes straight to PILOT_TEST_PLAN.md (notes are stored as a hidden comment, invisible when the file renders as plain markdown on GitHub). Edit the file directly and refresh this page to see changes here.</p>
</main>
<script>
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.tagName !== 'INPUT' || el.type !== 'checkbox') return;
  const line = el.dataset.line;
  const checked = el.checked;
  el.disabled = true;
  try {
    const res = await fetch('/api/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: Number(line), checked }),
    });
    if (!res.ok) throw new Error('toggle failed');
    const data = await res.json();
    // Update the item's own styling
    const li = el.closest('.item');
    li.classList.toggle('done', checked);
    // Update this section's progress bar/count
    const sec = el.closest('.sec');
    const fill = sec.querySelector('.bar-fill');
    const count = sec.querySelector('.count');
    fill.style.width = data.sectionPct + '%';
    count.textContent = data.sectionChecked + '/' + data.sectionTotal;
    // Update overall progress
    document.getElementById('overallFill').style.width = data.overallPct + '%';
    document.getElementById('overallLabel').textContent =
      data.totalChecked + ' / ' + data.totalItems + ' checked (' + data.overallPct + '%)';
  } catch (err) {
    el.checked = !checked; // revert on failure
    alert('Could not save — is the file writable? ' + err.message);
  } finally {
    el.disabled = false;
  }
});

document.addEventListener('focusout', async (e) => {
  const el = e.target;
  if (!el.classList || !el.classList.contains('note')) return;
  const line = el.dataset.line;
  const value = el.value;
  if (el.dataset.saved === value) return; // unchanged since last save
  try {
    const res = await fetch('/api/note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: Number(line), note: value }),
    });
    if (!res.ok) throw new Error('save failed');
    el.dataset.saved = value;
  } catch (err) {
    alert('Could not save note: ' + err.message);
  }
});
// Ctrl/Cmd+Enter in a note field saves immediately (blurring is the trigger).
document.addEventListener('keydown', (e) => {
  if (e.target.classList && e.target.classList.contains('note') && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.target.blur();
  }
});
</script>
</body>
</html>`;
}

function toggleLine(lineNo, checked) {
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  const lines = raw.split('\n');
  const idx = lineNo - 1;
  if (idx < 0 || idx >= lines.length) throw new Error('line out of range');
  const match = lines[idx].match(/^(\s*- \[)( |x)(\] .*)$/);
  if (!match) throw new Error('line is not a checkbox');
  lines[idx] = match[1] + (checked ? 'x' : ' ') + match[3];
  fs.writeFileSync(FILE_PATH, lines.join('\n'));

  // Recompute the containing section's counts (and overall) fresh from disk.
  const headings = [];
  lines.forEach((l, i) => { if (/^## /.test(l)) headings.push(i); });
  let sectionStart = 0;
  for (const h of headings) { if (h <= idx) sectionStart = h; }
  let sectionEnd = lines.length;
  for (const h of headings) { if (h > sectionStart) { sectionEnd = h; break; } }

  let sectionChecked = 0, sectionTotal = 0;
  for (let i = sectionStart; i < sectionEnd; i++) {
    if (/^\s*- \[[ x]\]/.test(lines[i])) {
      sectionTotal++;
      if (/^\s*- \[x\]/.test(lines[i])) sectionChecked++;
    }
  }
  const totalChecked = lines.filter((l) => /^\s*- \[x\]/.test(l)).length;
  const totalItems = lines.filter((l) => /^\s*- \[[ x]\]/.test(l)).length;

  return {
    sectionChecked, sectionTotal,
    sectionPct: sectionTotal ? Math.round((100 * sectionChecked) / sectionTotal) : 0,
    totalChecked, totalItems,
    overallPct: totalItems ? Math.round((100 * totalChecked) / totalItems) : 0,
  };
}

// Notes are stored as a trailing `<!-- note:<uri-encoded text> -->` HTML
// comment on the checkbox's own line — invisible when the file renders as
// plain markdown (e.g. on GitHub), but round-trips cleanly through this tool.
function setNote(lineNo, note) {
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  const lines = raw.split('\n');
  const idx = lineNo - 1;
  if (idx < 0 || idx >= lines.length) throw new Error('line out of range');
  const match = lines[idx].match(/^(\s*- \[[ x]\] )(.*?)(?:\s*<!-- note:.*? -->)?$/);
  if (!match) throw new Error('line is not a checkbox');
  const [, prefix, text] = match;
  const trimmed = note.trim();
  lines[idx] = trimmed ? `${prefix}${text} <!-- note:${encodeURIComponent(trimmed)} -->` : `${prefix}${text}`;
  fs.writeFileSync(FILE_PATH, lines.join('\n'));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderPage());
    return;
  }
  if (req.method === 'POST' && req.url === '/api/toggle') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { line, checked } = JSON.parse(body);
        const result = toggleLine(line, checked);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/note') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { line, note } = JSON.parse(body);
        setNote(line, note);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Pilot test plan running at http://localhost:${PORT}`);
});
