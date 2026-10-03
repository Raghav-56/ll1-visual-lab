import { analyze, parseTrace, readInput, formatRhs, formatProduction, formatSet } from './grammar.mjs';
import { examples, repairs } from './examples.mjs';
import { capture, captureAll, fly, changeStack, rearrangeSymbols } from './motion.mjs';

const $ = id => document.getElementById(id);
const escape = text => String(text).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]);
const state = {
  analysis: null, example: null, lhs: 'S', token: 'a', pairIndex: 0, walk: -1,
  frames: [], frame: 0, traceTimer: null, traceBusy: false, traceVersion: 0, traceMotion: null,
  repair: 0, repairFrame: 0, repairTimer: null, repairMotion: null,
  placements: [], buildIndex: 0, buildPlaying: false, buildTimer: null, buildBusy: false, buildVersion: 0, buildMotion: null,
};
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const setText = (id, text) => { $(id).textContent = text; };
const activePairs = () => state.analysis.pairs.filter(pair => pair.lhs === state.lhs);
const selectedPair = () => activePairs()[state.pairIndex];
const entriesFor = lhs => state.analysis.entries.filter(entry => entry.production.lhs === lhs);
const badge = (pass, text) => `<span class="check-icon" aria-label="${pass ? 'Pass' : 'Fail'}">${pass ? '✓' : '×'}</span>${text}`;

function chip(token, { collision = false, follow = false, selectable = false, reason = '' } = {}) {
  const classes = ['token', collision ? 'collision' : '', follow ? 'follow' : '', token === 'ε' ? 'epsilon' : '', token === state.token ? 'selected' : ''].filter(Boolean).join(' ');
  const inside = `${escape(token)}${reason ? `<span class="reason">${escape(reason)}</span>` : ''}`;
  return selectable && token !== 'ε'
    ? `<button class="${classes}" data-token="${escape(token)}" aria-label="Inspect lookahead ${escape(token)}${reason ? ` via ${escape(reason)}` : ''}">${inside}</button>`
    : `<span class="${classes}">${inside}</span>`;
}

function selectDecision(lhs, token, preferWitness = true) {
  state.lhs = lhs;
  state.token = token;
  const pairs = activePairs();
  state.pairIndex = preferWitness ? Math.max(0, pairs.findIndex(pair => pair.selectOverlap.has(token))) : Math.min(state.pairIndex, Math.max(0, pairs.length - 1));
  renderWorkbench();
}

function chooseExample(id, jump = false) {
  const example = examples.find(item => item.id === id);
  if (!example) return;
  cancelTrace();
  state.example = example;
  state.analysis = analyze(example.source);
  state.walk = -1;
  state.lhs = example.focus;
  state.token = example.look;
  state.pairIndex = 0;
  $('example-select').value = id;
  $('grammar-input').value = example.source;
  $('input-tokens').value = example.input;
  setText('editor-error', '');
  renderGrammar();
  selectDecision(example.focus, example.look);
  resetBuild();
  loadTrace();
  if (jump) $('explore').scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
}

function renderGrammar() {
  const a = state.analysis;
  $('grammar-display').innerHTML = a.nonterminals.map(lhs => `<div class="production-line"><span class="nt">${escape(lhs)}</span><span class="arrow">→</span>${entriesFor(lhs).map(entry => escape(formatRhs(entry.production.rhs))).join('<span class="alt">|</span>')}</div>`).join('');
  setText('example-note', state.example?.note ?? 'The lab checks LL(1) for your grammar. It does not assess general ambiguity.');
  const verdict = $('grammar-verdict');
  verdict.className = `verdict${a.ll1 ? '' : ' bad'}`;
  verdict.innerHTML = `<strong>${a.ll1 ? 'This grammar is LL(1)' : 'This grammar is not LL(1)'}</strong><span>${a.ll1 ? 'Every table cell has at most one production.' : `${a.conflicts.length} conflicting cell${a.conflicts.length === 1 ? '' : 's'}. One token cannot always choose.`}</span>`;
  $('conflict-list').innerHTML = a.conflicts.map(conflict => `<button data-cell-lhs="${escape(conflict.lhs)}" data-cell-token="${escape(conflict.token)}" aria-label="Inspect conflict at ${escape(conflict.lhs)}, ${escape(conflict.token)}">M[${escape(conflict.lhs)}, ${escape(conflict.token)}]</button>`).join('');
  document.querySelectorAll('.quick-examples button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.example === state.example?.id)));
}

function renderWorkbench() {
  const focused = document.activeElement;
  const container = focused.closest?.('#lookahead-tokens, #sets-content, #table-content');
  const restore = container ? { container: container.id, token: focused.dataset.token, lhs: focused.dataset.cellLhs, cellToken: focused.dataset.cellToken } : null;
  const a = state.analysis;
  $('nonterminal-select').innerHTML = a.nonterminals.map(lhs => `<option value="${escape(lhs)}">${escape(lhs)}</option>`).join('');
  $('nonterminal-select').value = state.lhs;
  const pairs = activePairs();
  $('pair-select').innerHTML = pairs.length ? pairs.map((pair, index) => `<option value="${index}">${escape(pair.left.production.id)} / ${escape(pair.right.production.id)} · ${escape(formatRhs(pair.left.production.rhs))} / ${escape(formatRhs(pair.right.production.rhs))}</option>`).join('') : '<option>One alternative</option>';
  $('pair-select').value = pairs.length ? String(state.pairIndex) : 'One alternative';
  $('pair-select').disabled = pairs.length < 2;
  $('lookahead-tokens').innerHTML = [...a.terminals, '$'].map(token => `<button data-token="${escape(token)}" aria-pressed="${token === state.token}">${escape(token)}</button>`).join('');
  renderRules();
  renderSets();
  renderTable();
  renderDecision();
  renderWalk();
  if (restore) {
    const target = restore.lhs
      ? $(restore.container).querySelector(`[data-cell-lhs="${CSS.escape(restore.lhs)}"][data-cell-token="${CSS.escape(restore.cellToken)}"]`)
      : $(restore.container).querySelector(`[data-token="${CSS.escape(restore.token)}"]`);
    target?.focus({ preventScroll: true });
  }
}

function renderRules() {
  const pair = selectedPair();
  if (!pair) {
    $('rules-content').innerHTML = `<div class="pair-caption">${escape(formatProduction(entriesFor(state.lhs)[0].production))}</div><p class="card-intro">${escape(state.lhs)} has only one alternative. There is no pair that can violate these three rules.</p><p class="card-intro">The whole grammar still needs every other row checked.</p>`;
    return;
  }
  const [rule1, rule2, rule3] = pair.rules;
  const nullableText = pair.bothNullable ? 'Both α and β derive ε. They compete on FOLLOW.' : pair.left.nullable ? 'Only α derives ε.' : pair.right.nullable ? 'Only β derives ε.' : 'Neither alternative derives ε.';
  const rule3Text = pair.followOverlap.size ? `${formatSet(pair.followOverlap)} can begin the other branch and also follow ${state.lhs}.` : pair.left.nullable || pair.right.nullable ? `No starting terminal of the other branch is in FOLLOW(${state.lhs}).` : 'Neither alternative is nullable, so no FOLLOW test is needed.';
  const rows = [
    [rule1, '1. No shared starting terminal', rule1 ? 'No terminal can begin strings derived from both alternatives.' : `Both can begin with ${formatSet(pair.firstOverlap)}.`],
    [rule2, '2. At most one empty route', nullableText],
    [rule3, '3. Empty must not compete with what follows', rule3Text],
  ];
  $('rules-content').innerHTML = `<div class="pair-caption">${escape(state.lhs)} → α | β<br>α = ${escape(formatRhs(pair.left.production.rhs))}<br>β = ${escape(formatRhs(pair.right.production.rhs))}</div>${rows.map(([pass, title, text]) => `<div class="rule-row${pass ? '' : ' fail'}">${badge(pass, `<div><strong>${escape(title)}</strong><p>${escape(text)}</p></div>`)}</div>`).join('')}`;
}

function renderSets() {
  const pair = selectedPair();
  const entries = pair ? [pair.left, pair.right] : entriesFor(state.lhs);
  const follow = state.analysis.follow.get(state.lhs);
  let html = '';
  if (pair) {
    const fullFirstOverlap = new Set([...pair.firstOverlap, ...(pair.bothNullable ? ['ε'] : [])]);
    html += `<div class="formula-box mono">FIRST(α) ∩ FIRST(β) = ${escape(formatSet(fullFirstOverlap))}<br>${pair.right.nullable ? `β is nullable: FIRST(α) ∩ FOLLOW(${escape(state.lhs)}) = ${escape(formatSet(new Set([...pair.left.first].filter(token => follow.has(token)))))}<br>` : ''}${pair.left.nullable ? `α is nullable: FIRST(β) ∩ FOLLOW(${escape(state.lhs)}) = ${escape(formatSet(new Set([...pair.right.first].filter(token => follow.has(token)))))}<br>` : ''}${!pair.left.nullable && !pair.right.nullable ? 'No nullable branch, so no FOLLOW comparison.' : ''}</div>`;
  }
  for (const [index, entry] of entries.entries()) {
    html += `<div class="set-row"><span class="set-label">FIRST(${pair ? (index ? 'β' : 'α') : 'RHS'})</span>${[...entry.first].map(token => chip(token, { collision: pair && (pair.firstOverlap.has(token) || token === 'ε' && pair.bothNullable) })).join('') || '<span>∅</span>'}</div>`;
  }
  html += `<div class="set-row"><span class="set-label">FOLLOW(${escape(state.lhs)})</span>${[...follow].map(token => chip(token, { follow: true, collision: pair?.followOverlap.has(token) })).join('')}</div>`;
  html += '<div class="set-lanes"><p class="formula">SELECT = FIRST(RHS) − {ε}<br>Also add FOLLOW(head) if the RHS is nullable.</p>';
  for (const entry of entries) {
    html += `<div class="select-lane"><div class="lane-head">${escape(entry.production.id)} · ${escape(formatProduction(entry.production))}</div><div class="set-row">${[...entry.select].map(token => chip(token, { collision: pair?.selectOverlap.has(token), follow: entry.reasons.get(token).includes('FOLLOW'), selectable: true, reason: entry.reasons.get(token).join('+') })).join('')}</div></div>`;
  }
  html += '</div>';
  html += pair ? `<div class="set-outcome${pair.selectOverlap.size ? ' bad' : ''}">${pair.selectOverlap.size ? `SELECT sets overlap on ${escape(formatSet(pair.selectOverlap))}. Those columns get both productions.` : 'The two SELECT sets are disjoint. They never claim the same cell.'}</div>` : '<div class="set-outcome">One alternative supplies this row. SELECT tells us which columns contain it.</div>';
  $('sets-content').innerHTML = html;
}

function renderTable() {
  const a = state.analysis;
  $('table-content').innerHTML = `<table class="parsing-table"><caption class="sr-only">Predictive parsing table. Entries name production IDs. Empty cells are input errors. Multiple IDs in a cell are conflicts.</caption><thead><tr><th scope="col">M</th>${[...a.terminals, '$'].map(token => `<th scope="col">${escape(token)}</th>`).join('')}</tr></thead><tbody>${a.nonterminals.map(lhs => `<tr><th scope="row">${escape(lhs)}</th>${[...a.terminals, '$'].map(token => {
    const choices = a.table.get(lhs).get(token);
    const active = lhs === state.lhs && token === state.token;
    return `<td class="${choices.length > 1 ? 'conflict' : choices.length ? 'has-entry' : ''}${active ? ' active' : ''}"><button data-cell-lhs="${escape(lhs)}" data-cell-token="${escape(token)}" aria-pressed="${active}" aria-label="Cell ${escape(lhs)}, ${escape(token)}: ${choices.length} production${choices.length === 1 ? '' : 's'}">${choices.map(entry => escape(entry.production.id)).join('<br>') || '∅'}</button></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
  const choices = a.table.get(state.lhs).get(state.token);
  $('cell-detail').innerHTML = `<div class="cell-detail"><strong>M[${escape(state.lhs)}, ${escape(state.token)}] · ${choices.length} ${choices.length === 1 ? 'entry' : 'entries'}</strong>${choices.map(entry => `<span class="cell-entry">${escape(entry.production.id)} · ${escape(formatProduction(entry.production))}</span><p>Selected via ${escape(entry.reasons.get(state.token).join(' and '))}${entry.reasons.get(state.token).includes('FOLLOW') ? ` because the RHS is nullable and ${escape(state.token)} follows ${escape(state.lhs)}` : ` because ${escape(state.token)} can begin the RHS`}.</p>`).join('')}<p>${choices.length > 1 ? 'This cell breaks the LL(1) condition.' : choices.length ? 'Exactly one production. The parser can expand here.' : 'No production for this token. Empty cells are allowed in an LL(1) table.'}</p></div>`;
}

function renderDecision() {
  const choices = state.analysis.table.get(state.lhs).get(state.token);
  const entries = entriesFor(state.lhs);
  const shown = entries.slice(0, 7);
  const height = 144 + shown.length * 52;
  let paths = '';
  let activePaths = '';
  let nodes = '';
  for (const [index, entry] of shown.entries()) {
    const y = 125 + index * 52;
    const active = choices.includes(entry);
    const colorClass = active ? (choices.length > 1 ? 'conflict' : 'active') : '';
    const path = `M 180 90 L 40 90 L 40 ${y + 18} L 57 ${y + 18}`;
    const edge = `<path class="svg-edge ${colorClass}" stroke-linejoin="round" d="${path}"/>`;
    if (active) activePaths += edge;
    else paths += edge;
    if (active && !reducedMotion()) activePaths += `<circle r="4" fill="var(--${choices.length > 1 ? 'bad' : 'accent'})"><animateMotion dur="0.7s" repeatCount="1" fill="freeze" path="${path}"/></circle>`;
    nodes += `<rect class="${active ? (choices.length > 1 ? 'svg-conflict' : 'svg-active') : 'svg-box'}" x="58" y="${y}" width="277" height="37" rx="7"/><text x="72" y="${y + 23}" style="font-size:${formatProduction(entry.production).length > 28 ? '9' : '11'}px;opacity:${active ? 1 : .55}">${escape(entry.production.id)} · ${escape(formatProduction(entry.production))}</text>`;
  }
  const summary = choices.length > 1 ? `${choices.length} choices. Stop at the conflict.` : choices.length ? 'One choice. Expand this production.' : 'Zero choices. Report an input error.';
  $('decision-content').innerHTML = `<svg class="decision-svg" viewBox="0 0 360 ${height}" role="img" aria-label="At stack top ${escape(state.lhs)} with lookahead ${escape(state.token)}, ${choices.length} productions are selectable"><rect class="svg-box" x="20" y="8" width="136" height="49" rx="8"/><text x="88" y="27" text-anchor="middle" style="font-size:9px">STACK TOP</text><text x="88" y="45" text-anchor="middle">${escape(state.lhs)}</text><rect class="svg-box" x="204" y="8" width="136" height="49" rx="8"/><text x="272" y="27" text-anchor="middle" style="font-size:9px">NEXT TOKEN</text><text x="272" y="45" text-anchor="middle">${escape(state.token)}</text><path class="svg-edge" d="M88 57 L88 77 L180 77 M272 57 L272 77 L180 77 L180 90"/>${paths}${activePaths}${nodes}</svg><p class="decision-note${choices.length > 1 ? ' bad' : ''}"><strong>${summary}</strong>${shown.length < entries.length ? ` Showing ${shown.length} of ${entries.length} alternatives. The table retains them all.` : ''}</p>`;
}

const walkMessages = [
  '1. The three rules check each competing pair: their first terminals, their empty routes, and any FOLLOW competition.',
  '2. The same checks become disjoint FIRST/FOLLOW sets. SELECT translates them into actual lookahead tokens.',
  '3. Each SELECT token puts its production into a table cell. Overlapping SELECT sets create a cell with multiple entries.',
  '4. The parser looks up the stack top and next token. One entry chooses a production; multiple entries block the choice.',
];
function renderWalk() {
  ['rules-view', 'sets-view', 'table-view', 'decision-view'].forEach((id, index) => $(id).classList.toggle('walk-active', state.walk === index));
  setText('walk-caption', state.walk >= 0 ? walkMessages[state.walk] : '');
  setText('walk-button', state.walk < 0 ? 'Walk the four views' : state.walk === 3 ? 'Replay the four views' : `Continue to view ${state.walk + 2} →`);
}

function stopBuild() {
  clearTimeout(state.buildTimer);
  state.buildTimer = null;
  state.buildPlaying = false;
  setText('build-play', 'Play');
}

function cancelBuild() {
  stopBuild();
  state.buildVersion++;
  state.buildMotion?.abort();
  state.buildMotion = null;
  state.buildBusy = false;
}

function resetBuild() {
  cancelBuild();
  state.placements = state.analysis.entries.flatMap(entry => [...entry.select].map(token => ({ entry, token })));
  state.buildIndex = 0;
  renderBuild();
  setText('build-message', 'Each lookahead in SELECT places its production in one cell.');
}

function updateBuildControls() {
  $('build-prev').disabled = state.buildBusy || state.buildIndex === 0;
  $('build-next').disabled = state.buildBusy || state.buildIndex === state.placements.length;
  setText('build-progress', `${state.buildIndex} / ${state.placements.length} entries`);
}

function renderBuild() {
  const a = state.analysis;
  const row = new Map(a.nonterminals.map(lhs => [lhs, new Map([...a.terminals, '$'].map(token => [token, []]))]));
  for (const { entry, token } of state.placements.slice(0, state.buildIndex)) row.get(entry.production.lhs).get(token).push(entry);
  const next = state.placements[state.buildIndex];
  if (next) {
    const { entry, token } = next;
    const reasons = entry.reasons.get(token);
    const routes = [
      ...(reasons.includes('FIRST') ? [`${token} ∈ FIRST(${formatRhs(entry.production.rhs)})`] : []),
      ...(reasons.includes('FOLLOW') ? [`The RHS is nullable and ${token} ∈ FOLLOW(${entry.production.lhs})`] : []),
    ];
    $('build-source').innerHTML = `<span class="token production-badge${reasons.includes('FOLLOW') ? ' follow' : ''}" id="build-production">${escape(entry.production.id)}</span><code>${escape(formatProduction(entry.production))}</code><span>on</span>${chip(token, { follow: reasons.includes('FOLLOW') })}<p>${escape(routes.join('. '))}. Place ${escape(entry.production.id)} in M[${escape(entry.production.lhs)}, ${escape(token)}]${reasons.length > 1 ? ' once, even though both routes select it' : ''}.</p>`;
  } else {
    $('build-source').innerHTML = `<strong>Table complete.</strong><p>${a.ll1 ? 'Every cell has at most one production.' : `${a.conflicts.length} cell${a.conflicts.length === 1 ? '' : 's'} contain${a.conflicts.length === 1 ? 's' : ''} multiple productions. The grammar is not LL(1).`}</p>`;
  }
  $('build-table').innerHTML = `<table class="parsing-table build-table"><caption class="sr-only">Table under construction. ${state.buildIndex} of ${state.placements.length} entries placed.</caption><thead><tr><th scope="col">M</th>${[...a.terminals, '$'].map(token => `<th scope="col">${escape(token)}</th>`).join('')}</tr></thead><tbody>${a.nonterminals.map(lhs => `<tr><th scope="row">${escape(lhs)}</th>${[...a.terminals, '$'].map(token => {
    const choices = row.get(lhs).get(token);
    return `<td data-build-lhs="${escape(lhs)}" data-build-token="${escape(token)}" class="${choices.length > 1 ? 'conflict' : choices.length ? 'has-entry' : ''}"><button data-cell-lhs="${escape(lhs)}" data-cell-token="${escape(token)}" aria-label="Construction cell ${escape(lhs)}, ${escape(token)}: ${choices.length} productions">${choices.map(entry => `<span class="placed-production">${escape(entry.production.id)}</span>`).join('') || '∅'}</button></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
  updateBuildControls();
}

async function placeEntry() {
  if (state.buildBusy || state.buildIndex >= state.placements.length) return;
  const version = state.buildVersion;
  const { entry, token } = state.placements[state.buildIndex];
  const controller = new AbortController();
  state.buildMotion = controller;
  state.buildBusy = true;
  updateBuildControls();
  const target = $('build-table').querySelector(`[data-build-lhs="${CSS.escape(entry.production.lhs)}"][data-build-token="${CSS.escape(token)}"]`);
  await fly($('build-production'), target, { signal: controller.signal });
  if (version !== state.buildVersion || controller.signal.aborted) return;
  state.buildIndex++;
  state.buildBusy = false;
  state.buildMotion = null;
  renderBuild();
  selectDecision(entry.production.lhs, token);
  const count = state.placements.slice(0, state.buildIndex).filter(placement => placement.entry.production.lhs === entry.production.lhs && placement.token === token).length;
  setText('build-message', `Placed ${entry.production.id} in M[${entry.production.lhs}, ${token}]. ${count === 1 ? 'The cell has one production.' : `The cell now has ${count} productions. This is a conflict.`}`);
}

function playBuild() {
  if (state.buildPlaying) { stopBuild(); return; }
  if (state.buildIndex === state.placements.length) resetBuild();
  state.buildPlaying = true;
  setText('build-play', 'Pause');
  const version = state.buildVersion;
  const tick = async () => {
    await placeEntry();
    if (version !== state.buildVersion || !state.buildPlaying) return;
    if (state.buildIndex === state.placements.length) { stopBuild(); return; }
    state.buildTimer = setTimeout(tick, 600);
  };
  tick();
}

function stopTrace() {
  clearInterval(state.traceTimer);
  state.traceTimer = null;
  setText('trace-play', 'Play');
}
function cancelTrace() {
  stopTrace();
  state.traceVersion++;
  state.traceMotion?.abort();
  state.traceMotion = null;
  state.traceBusy = false;
}
function loadTrace() {
  cancelTrace();
  try {
    state.frames = parseTrace(state.analysis, readInput($('input-tokens').value, state.analysis));
    state.frame = 0;
    setText('input-error', '');
    renderTrace();
  } catch (error) { setText('input-error', `${error.message} The displayed trace still uses its previous input.`); }
}
function updateTraceControls() {
  $('trace-prev').disabled = state.traceBusy || state.frame === 0;
  $('trace-next').disabled = state.traceBusy || state.frame === state.frames.length - 1;
  $('trace-reset').disabled = state.frame === 0 && !state.traceBusy && !state.traceTimer;
}
function renderTrace() {
  const frame = state.frames[state.frame];
  if (!frame) return;
  $('stack-display').innerHTML = frame.stack.map(token => `<span class="token">${escape(token)}</span>`).join('') || '<span class="muted">Finished</span>';
  $('input-display').innerHTML = frame.consumed.filter(token => token !== '$').map(token => `<span class="token consumed">${escape(token)}</span>`).join('') + frame.remaining.map((token, index) => `<span class="token${index ? '' : ' current'}">${escape(token)}</span>`).join('') + (!frame.remaining.length ? '<span class="muted">End of input</span>' : '');
  setText('trace-progress', `Step ${state.frame} / ${state.frames.length - 1}`);
  const labels = { start: 'Ready', expand: 'Expand', match: 'Match', accept: 'Accepted', conflict: 'Conflict', error: 'Input error', limit: 'Step limit' };
  setText('trace-status', labels[frame.kind]);
  $('trace-status').className = `status-pill${['conflict', 'error', 'limit'].includes(frame.kind) ? ' bad' : ''}`;
  setText('trace-message', frame.message);
  updateTraceControls();
  $('trace-history').innerHTML = `<table><thead><tr><th>Step</th><th>Stack, top first</th><th>Remaining input</th><th>Action</th></tr></thead><tbody>${state.frames.map((item, index) => `<tr class="${state.frame === index ? 'current-row' : ''}"><td>${index}</td><td>${escape(item.stack.join(' ') || 'finished')}</td><td>${escape(item.remaining.join(' ') || 'finished')}</td><td>${escape(item.kind === 'expand' ? formatProduction(item.entry.production) : item.kind)}</td></tr>`).join('')}</tbody></table>`;
  if (frame.cell) selectDecision(frame.cell.lhs, frame.cell.token);
}
async function advanceTrace(direction) {
  if (state.traceBusy) return;
  const index = Math.max(0, Math.min(state.frames.length - 1, state.frame + direction));
  if (index === state.frame) return;
  const next = state.frames[index];
  const before = captureAll($('stack-display'), '.token');
  const version = state.traceVersion;
  const controller = new AbortController();
  state.traceMotion = controller;
  state.traceBusy = true;
  updateTraceControls();
  if (direction > 0 && next.kind === 'match') {
    await fly(capture($('input-display').querySelector('.current')), before[0].rect, { signal: controller.signal, arc: false });
    if (version !== state.traceVersion || controller.signal.aborted) return;
  }
  state.frame = index;
  renderTrace();
  if (direction > 0 && ['expand', 'match'].includes(next.kind)) {
    await changeStack(before, [...$('stack-display').querySelectorAll('.token')], next.kind === 'expand' ? next.entry.production.rhs.length : 0, controller.signal);
  }
  if (version !== state.traceVersion || controller.signal.aborted) return;
  state.traceBusy = false;
  state.traceMotion = null;
  updateTraceControls();
  if (state.frame === state.frames.length - 1) stopTrace();
}
function playTrace() {
  if (state.traceTimer) { stopTrace(); return; }
  if (state.frame === state.frames.length - 1) { state.frame = 0; renderTrace(); }
  setText('trace-play', 'Pause');
  state.traceTimer = setInterval(() => advanceTrace(1), Number($('trace-speed').value));
}

function stopRepair() {
  clearInterval(state.repairTimer);
  state.repairTimer = null;
  setText('repair-play', 'Animate');
}
function renderRepair(move = false) {
  const before = move ? captureAll($('repair-figure'), '.grammar-symbol') : [];
  state.repairMotion?.abort();
  const controller = new AbortController();
  state.repairMotion = controller;
  const repair = repairs[state.repair];
  const frame = repair.frames[state.repairFrame];
  $('repair-tabs').innerHTML = repairs.map((item, index) => `<button data-repair="${index}" aria-pressed="${index === state.repair}">${index === 0 ? 'Left factoring' : index === 1 ? 'Left recursion' : 'Why those are not enough'}</button>`).join('');
  const symbols = frame.grammar.split(/(\s+|→|\||\(|\)|\*|\{|\}|,|=|;)/);
  $('repair-figure').innerHTML = `<pre class="repair-code">${symbols.map(token => !token.trim() ? escape(token) : `<span class="grammar-symbol">${frame.highlights.includes(token) ? `<mark>${escape(token)}</mark>` : escape(token)}</span>`).join('')}</pre>`;
  if (move) rearrangeSymbols(before, [...$('repair-figure').querySelectorAll('.grammar-symbol')], controller.signal);
  setText('repair-caption', frame.caption);
  setText('repair-heading', repair.title);
  setText('repair-general', repair.general);
  setText('repair-limit', repair.limit);
  $('repair-scrubber').value = state.repairFrame;
  setText('repair-position', `${state.repairFrame + 1} / ${repair.frames.length}`);
  $('repair-prev').disabled = state.repairFrame === 0;
  $('repair-next').disabled = state.repairFrame === repair.frames.length - 1;
  $('repair-verdicts').innerHTML = [repair.before, repair.after].filter(Boolean).map((id, index) => {
    const result = analyze(examples.find(example => example.id === id).source);
    return `<div class="verdict${result.ll1 ? '' : ' bad'}"><span>${index ? 'After' : 'Before'}</span><strong>${result.ll1 ? 'LL(1)' : 'Not LL(1)'}</strong><span>${result.conflicts.length} conflicting cells</span></div>`;
  }).join('');
  $('repair-load-buttons').innerHTML = `<button class="outline-button jump-to-lab" data-example="${repair.before}">Inspect ${repair.after ? 'before' : 'the counterexample'}</button>${repair.after ? `<button class="primary-button jump-to-lab" data-example="${repair.after}">Inspect after</button>` : ''}`;
}
function advanceRepair(direction) {
  state.repairFrame = Math.max(0, Math.min(repairs[state.repair].frames.length - 1, state.repairFrame + direction));
  renderRepair(true);
  if (state.repairFrame === repairs[state.repair].frames.length - 1) stopRepair();
}
function playRepair() {
  if (state.repairTimer) { stopRepair(); return; }
  if (state.repairFrame === repairs[state.repair].frames.length - 1) state.repairFrame = 0;
  renderRepair(true);
  setText('repair-play', 'Pause');
  state.repairTimer = setInterval(() => advanceRepair(1), 1700);
}

function renderAmbiguityTrees() {
  const id = () => ({ label: 'E', children: [{ label: 'id' }] });
  const sum = (left, right) => ({ label: 'E', children: [left, { label: '+' }, right] });
  const treeSvg = (root, label) => {
    let leaf = 0;
    const nodes = [];
    const edges = [];
    const layout = (node, depth) => {
      const childPositions = (node.children ?? []).map(child => layout(child, depth + 1));
      const x = childPositions.length ? childPositions.reduce((total, child) => total + child.x, 0) / childPositions.length : 40 + leaf++ * 74;
      const y = childPositions.length ? 24 + depth * 57 : 207;
      for (const child of childPositions) edges.push(`<line class="tree-edge" x1="${x}" y1="${y + 12}" x2="${child.x}" y2="${child.y - 12}"/>`);
      nodes.push(`<rect class="${childPositions.length ? 'tree-branch' : 'tree-terminal'}" x="${x - 16}" y="${y - 13}" width="32" height="26" rx="5"/><text x="${x}" y="${y + 5}" text-anchor="middle">${node.label}</text>`);
      return { x, y };
    };
    layout(root, 0);
    return `<figure><svg viewBox="0 0 380 232" role="img" aria-label="Parse tree for ${escape(label)}. Leaves in order are id, plus, id, plus, id.">${edges.join('')}${nodes.join('')}</svg><figcaption>${escape(label)}</figcaption></figure>`;
  };
  $('ambiguity-trees').innerHTML = treeSvg(sum(sum(id(), id()), id()), '(id + id) + id') + treeSvg(sum(id(), sum(id(), id())), 'id + (id + id)');
}

const questions = [
  { grammar: 'S → a b | a c', question: 'Which statement is true?', options: ['It is LL(1).', 'It is unambiguous, but not LL(1).', 'It is ambiguous.'], correct: 1, explanation: 'ab and ac each have one parse tree. Both alternatives start with a, so M[S, a] contains two productions.' },
  { grammar: 'S → A a\nA → a | ε', question: 'Why does M[A, a] have two entries?', options: ['Both alternatives start with terminal a.', 'Both alternatives derive ε.', 'FIRST(a) overlaps FOLLOW(A).'], correct: 2, explanation: 'A → a consumes a. A → ε leaves the same a for the terminal after A. Rule 3 fails; rule 1 and rule 2 pass.' },
  { grammar: 'Remove left recursion.\nApply left factoring.', question: 'Can you now declare the result LL(1)?', options: ['Yes, those two repairs guarantee LL(1).', 'No. Recompute the sets and check the table.', 'Only if ε appears nowhere.'], correct: 1, explanation: 'The repairs address specific obstacles. Other FIRST/FIRST or FIRST/FOLLOW conflicts can remain. Every cell still needs at most one production.' },
];
function renderPractice() {
  $('practice-cards').innerHTML = questions.map((question, index) => `<article class="practice-card"><p class="eyebrow">Question ${index + 1}</p><code>${escape(question.grammar).replace(/\n/g, '<br>')}</code><h3>${escape(question.question)}</h3><div class="practice-options">${question.options.map((option, choice) => `<button data-question="${index}" data-answer="${choice}">${escape(option)}</button>`).join('')}</div><p class="practice-feedback" id="feedback-${index}" role="status" aria-live="polite"></p></article>`).join('');
}

$('example-select').innerHTML = `<option value="custom" disabled>Your grammar</option>${examples.map(example => `<option value="${example.id}">${escape(example.name)}</option>`).join('')}`;
$('example-select').addEventListener('change', event => chooseExample(event.target.value));
$('nonterminal-select').addEventListener('change', event => selectDecision(event.target.value, state.token));
$('pair-select').addEventListener('change', event => { state.pairIndex = Number(event.target.value); renderWorkbench(); });
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.example) chooseExample(button.dataset.example, button.classList.contains('jump-to-lab') || button.classList.contains('counterexample-card'));
  if (button.dataset.token !== undefined) selectDecision(state.lhs, button.dataset.token, false);
  if (button.dataset.cellLhs) selectDecision(button.dataset.cellLhs, button.dataset.cellToken);
  if (button.dataset.repair !== undefined) { stopRepair(); state.repair = Number(button.dataset.repair); state.repairFrame = 0; renderRepair(); }
  if (button.dataset.question !== undefined) {
    const index = Number(button.dataset.question);
    const answer = Number(button.dataset.answer);
    const question = questions[index];
    button.closest('.practice-options').querySelectorAll('button').forEach(option => { option.classList.remove('correct', 'wrong'); option.setAttribute('aria-pressed', String(option === button)); });
    button.classList.add(answer === question.correct ? 'correct' : 'wrong');
    setText(`feedback-${index}`, `${answer === question.correct ? 'Correct.' : 'Try again.'} ${question.explanation}`);
  }
});
$('analyze-button').addEventListener('click', () => {
  try {
    const analysis = analyze($('grammar-input').value);
    cancelTrace();
    state.analysis = analysis;
    state.example = null;
    state.walk = -1;
    $('example-select').value = 'custom';
    const conflict = analysis.conflicts[0];
    state.lhs = conflict?.lhs ?? analysis.start;
    state.token = conflict?.token ?? analysis.terminals[0] ?? '$';
    state.pairIndex = 0;
    setText('editor-error', '');
    renderGrammar();
    selectDecision(state.lhs, state.token);
    resetBuild();
    try { readInput($('input-tokens').value, analysis); } catch { $('input-tokens').value = ''; }
    loadTrace();
  } catch (error) { setText('editor-error', `${error.message} The visual lab still shows the previous valid grammar.`); }
});
$('walk-button').addEventListener('click', () => {
  state.walk = (state.walk + 1) % 4;
  renderWalk();
  $('decision-content').classList.remove('flash');
  if (state.walk === 3) { renderDecision(); $('decision-content').classList.add('flash'); }
  if (window.innerWidth < 950) ['rules-view', 'sets-view', 'table-view', 'decision-view'].map($)[state.walk].scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
});
$('trace-button').addEventListener('click', loadTrace);
$('input-tokens').addEventListener('keydown', event => { if (event.key === 'Enter') loadTrace(); });
$('trace-next').addEventListener('click', () => { stopTrace(); advanceTrace(1); });
$('trace-prev').addEventListener('click', () => { stopTrace(); advanceTrace(-1); });
$('trace-reset').addEventListener('click', () => { cancelTrace(); state.frame = 0; renderTrace(); });
$('trace-play').addEventListener('click', playTrace);
$('trace-speed').addEventListener('change', () => { if (state.traceTimer) { stopTrace(); playTrace(); } });
$('repair-prev').addEventListener('click', () => { stopRepair(); advanceRepair(-1); });
$('repair-next').addEventListener('click', () => { stopRepair(); advanceRepair(1); });
$('repair-play').addEventListener('click', playRepair);
$('repair-scrubber').addEventListener('input', event => { stopRepair(); state.repairFrame = Number(event.target.value); renderRepair(true); });
$('build-next').addEventListener('click', () => { stopBuild(); placeEntry(); });
$('build-prev').addEventListener('click', () => { cancelBuild(); state.buildIndex--; renderBuild(); setText('build-message', 'Removed the last entry.'); });
$('build-reset').addEventListener('click', resetBuild);
$('build-play').addEventListener('click', playBuild);
$('table-construction').addEventListener('toggle', () => { if (!$('table-construction').open) { cancelBuild(); updateBuildControls(); } });
$('theme-toggle').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  setText('theme-toggle', dark ? 'Light theme' : 'Dark theme');
  $('theme-toggle').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
  try { localStorage.setItem('ll1-theme', dark ? 'dark' : 'light'); } catch { /* The theme still works when browser storage is unavailable. */ }
});
try {
  if (localStorage.getItem('ll1-theme') === 'dark') $('theme-toggle').click();
} catch { /* Use the default theme when browser storage is unavailable. */ }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelTrace(); cancelBuild(); stopRepair(); state.repairMotion?.abort(); updateTraceControls(); updateBuildControls(); }
});
chooseExample(new URLSearchParams(location.search).get('example') ?? 'clean');
if (!state.analysis) chooseExample('clean');
renderRepair();
renderAmbiguityTrees();
renderPractice();
