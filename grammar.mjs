export const EPSILON = 'ε';
export const END = '$';

const nonterminalName = /^[A-Z][A-Za-z0-9_']*$/;
const epsilonNames = new Set(['ε', 'epsilon', 'eps']);
const unionInto = (target, values) => {
  let changed = false;
  for (const value of values) {
    if (!target.has(value)) { target.add(value); changed = true; }
  }
  return changed;
};
const intersect = (a, b) => new Set([...a].filter(value => b.has(value)));
const terminalsOnly = values => new Set([...values].filter(value => value !== EPSILON));

export function parseGrammar(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Write at least one production.');
  if (source.length > 6000) throw new Error('Use a grammar under 6,000 characters.');
  const productions = [];
  const nonterminals = [];
  const seen = new Set();
  for (const [lineIndex, original] of source.split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Za-z0-9_']*)\s*(?:->|→|::=)\s*(.+)$/);
    if (!match) throw new Error(`Line ${lineIndex + 1}: use A -> a B | ε, with spaces between symbols.`);
    const [, lhs, alternatives] = match;
    if (!nonterminals.includes(lhs)) nonterminals.push(lhs);
    for (const alternative of alternatives.split('|')) {
      const text = alternative.trim();
      if (!text) throw new Error(`Line ${lineIndex + 1}: write ε for an empty alternative.`);
      const tokens = text.split(/\s+/);
      if (tokens.includes(END)) throw new Error('$ is the end marker. Do not put it in a production.');
      if (tokens.some(token => epsilonNames.has(token)) && (tokens.length !== 1 || !epsilonNames.has(tokens[0]))) {
        throw new Error(`Line ${lineIndex + 1}: ε must be the whole alternative.`);
      }
      const rhs = epsilonNames.has(text) ? [] : tokens;
      if (rhs.some(token => /[<>|→]/.test(token) || token === '->' || token === '::=')) {
        throw new Error(`Line ${lineIndex + 1}: a symbol contains a reserved production character.`);
      }
      const key = JSON.stringify([lhs, rhs]);
      if (seen.has(key)) throw new Error(`Line ${lineIndex + 1}: ${lhs} repeats the same alternative. Remove the duplicate.`);
      seen.add(key);
      productions.push({ id: `p${productions.length + 1}`, lhs, rhs, line: lineIndex + 1 });
    }
  }
  if (!productions.length) throw new Error('Write at least one production.');
  if (productions.length > 100 || nonterminals.length > 30) throw new Error('Use at most 100 alternatives and 30 nonterminals.');
  const terminals = [];
  for (const production of productions) {
    for (const token of production.rhs) {
      if (nonterminalName.test(token) && !nonterminals.includes(token)) {
        throw new Error(`${token} has no production. Capitalized names are nonterminals; separate adjacent symbols with spaces.`);
      }
      if (!nonterminals.includes(token) && !terminals.includes(token)) terminals.push(token);
    }
  }
  if (terminals.length > 40) throw new Error('Use at most 40 terminal types.');
  return { source, start: nonterminals[0], nonterminals, terminals, productions };
}

export function firstOf(sequence, first) {
  const result = new Set();
  for (const symbol of sequence) {
    const values = first.get(symbol) ?? new Set([symbol]);
    unionInto(result, terminalsOnly(values));
    if (!values.has(EPSILON)) return result;
  }
  result.add(EPSILON);
  return result;
}

function requireReducedGrammar(grammar) {
  const productive = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const { lhs, rhs } of grammar.productions) {
      if (rhs.every(symbol => !grammar.nonterminals.includes(symbol) || productive.has(symbol))) {
        changed = unionInto(productive, [lhs]) || changed;
      }
    }
  }
  const unproductive = grammar.nonterminals.filter(symbol => !productive.has(symbol));
  if (unproductive.length) throw new Error(`No LL(1) verdict yet: ${unproductive.join(', ')} cannot derive a finite terminal string. Add a terminating alternative or remove these rules.`);
  const reachable = new Set([grammar.start]);
  changed = true;
  while (changed) {
    changed = false;
    for (const { lhs, rhs } of grammar.productions) {
      if (reachable.has(lhs)) changed = unionInto(reachable, rhs.filter(symbol => grammar.nonterminals.includes(symbol))) || changed;
    }
  }
  const unreachable = grammar.nonterminals.filter(symbol => !reachable.has(symbol));
  if (unreachable.length) throw new Error(`No LL(1) verdict yet: ${unreachable.join(', ')} cannot be reached from ${grammar.start}. Remove unused rules or connect them to the start symbol.`);
}

function leftRecursionCycles(grammar, first) {
  const edges = new Map(grammar.nonterminals.map(symbol => [symbol, new Set()]));
  for (const { lhs, rhs } of grammar.productions) {
    for (const symbol of rhs) {
      if (!edges.has(symbol)) break;
      edges.get(lhs).add(symbol);
      if (!first.get(symbol).has(EPSILON)) break;
    }
  }
  const cycles = [];
  for (const start of grammar.nonterminals) {
    const visited = new Set();
    const search = (current, path) => {
      visited.add(current);
      for (const next of edges.get(current)) {
        if (next === start) return [...path, start];
        if (!visited.has(next)) {
          const found = search(next, [...path, next]);
          if (found) return found;
        }
      }
      return null;
    };
    const cycle = search(start, [start]);
    if (cycle) cycles.push(cycle);
  }
  return cycles;
}

export function analyze(source) {
  const grammar = parseGrammar(source);
  requireReducedGrammar(grammar);
  const first = new Map(grammar.nonterminals.map(symbol => [symbol, new Set()]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const { lhs, rhs } of grammar.productions) changed = unionInto(first.get(lhs), firstOf(rhs, first)) || changed;
  }
  const follow = new Map(grammar.nonterminals.map(symbol => [symbol, new Set()]));
  follow.get(grammar.start).add(END);
  changed = true;
  while (changed) {
    changed = false;
    for (const { lhs, rhs } of grammar.productions) {
      for (let i = 0; i < rhs.length; i++) {
        if (!follow.has(rhs[i])) continue;
        const suffixFirst = firstOf(rhs.slice(i + 1), first);
        changed = unionInto(follow.get(rhs[i]), terminalsOnly(suffixFirst)) || changed;
        if (suffixFirst.has(EPSILON)) changed = unionInto(follow.get(rhs[i]), follow.get(lhs)) || changed;
      }
    }
  }
  const entries = grammar.productions.map(production => {
    const rhsFirst = firstOf(production.rhs, first);
    const nullable = rhsFirst.has(EPSILON);
    const select = terminalsOnly(rhsFirst);
    if (nullable) unionInto(select, follow.get(production.lhs));
    const reasons = new Map([...select].map(token => [token, [
      ...(rhsFirst.has(token) ? ['FIRST'] : []),
      ...(nullable && follow.get(production.lhs).has(token) ? ['FOLLOW'] : []),
    ]]));
    return { production, first: rhsFirst, nullable, select, reasons };
  });
  const table = new Map(grammar.nonterminals.map(symbol => [symbol, new Map([...grammar.terminals, END].map(token => [token, []]))]));
  for (const entry of entries) {
    for (const token of entry.select) table.get(entry.production.lhs).get(token).push(entry);
  }
  const conflicts = [];
  for (const [lhs, row] of table) {
    for (const [token, choices] of row) {
      if (choices.length > 1) conflicts.push({ lhs, token, choices });
    }
  }
  const pairs = [];
  for (const lhs of grammar.nonterminals) {
    const choices = entries.filter(entry => entry.production.lhs === lhs);
    for (let i = 0; i < choices.length; i++) {
      for (let j = i + 1; j < choices.length; j++) {
        const left = choices[i];
        const right = choices[j];
        const firstOverlap = intersect(terminalsOnly(left.first), terminalsOnly(right.first));
        const bothNullable = left.nullable && right.nullable;
        const followOverlap = new Set();
        if (right.nullable) unionInto(followOverlap, intersect(terminalsOnly(left.first), follow.get(lhs)));
        if (left.nullable) unionInto(followOverlap, intersect(terminalsOnly(right.first), follow.get(lhs)));
        pairs.push({ lhs, left, right, firstOverlap, bothNullable, followOverlap,
          selectOverlap: intersect(left.select, right.select),
          rules: [firstOverlap.size === 0, !bothNullable, followOverlap.size === 0] });
      }
    }
  }
  return { ...grammar, first, follow, entries, table, pairs, conflicts, ll1: conflicts.length === 0, cycles: leftRecursionCycles(grammar, first) };
}

export function readInput(text, analysis) {
  const tokens = text.trim() ? text.trim().split(/\s+/) : [];
  if (tokens.at(-1) === END) tokens.pop();
  if (tokens.includes(END)) throw new Error('$ may appear only at the end of the input. It is added automatically.');
  if (tokens.length > 120) throw new Error('Use at most 120 input tokens.');
  const unknown = tokens.find(token => !analysis.terminals.includes(token));
  if (unknown) throw new Error(`Unknown input token ${unknown}. Use the terminals in this grammar and spaces between tokens.`);
  return tokens;
}

export function parseTrace(analysis, input) {
  let stack = [analysis.start, END];
  const tokens = [...input, END];
  let position = 0;
  const frames = [];
  const record = (kind, message, details = {}) => frames.push({ kind, message, stack: [...stack], remaining: tokens.slice(position), consumed: tokens.slice(0, position), ...details });
  record('start', `Start with ${analysis.start} on top of the stack. Read the input from left to right.`);
  for (let step = 0; step < 500; step++) {
    const top = stack[0];
    const lookahead = tokens[position];
    if (top === END && lookahead === END) {
      stack = [];
      position++;
      record('accept', 'Accept. Every input token is matched and the stack is finished.');
      return frames;
    }
    if (!analysis.nonterminals.includes(top)) {
      if (top !== lookahead) {
        record('error', `Reject. The stack expects ${top}, but the next token is ${lookahead}.`);
        return frames;
      }
      stack = stack.slice(1);
      position++;
      record('match', `Match ${lookahead}. Consume one token and remove it from the stack.`, { matched: lookahead });
      continue;
    }
    const choices = analysis.table.get(top).get(lookahead) ?? [];
    const cell = { lhs: top, token: lookahead };
    if (!choices.length) {
      record('error', `Reject. M[${top}, ${lookahead}] is empty. This is an input error, not a choice conflict.`, { cell });
      return frames;
    }
    if (choices.length > 1) {
      record('conflict', `Stop. M[${top}, ${lookahead}] contains ${choices.length} productions. One lookahead token cannot choose.`, { cell, choices });
      return frames;
    }
    const entry = choices[0];
    stack = [...entry.production.rhs, ...stack.slice(1)];
    record('expand', `Choose ${formatProduction(entry.production)}. ${entry.nullable && !entry.production.rhs.length ? 'Pop the nonterminal without consuming input.' : 'Replace the nonterminal by its right-hand side. The input has not moved.'}`, { cell, entry });
  }
  record('limit', 'Stopped after 500 operations. Shorten the example input to inspect the trace.');
  return frames;
}

export const formatRhs = rhs => rhs.length ? rhs.join(' ') : EPSILON;
export const formatProduction = production => `${production.lhs} → ${formatRhs(production.rhs)}`;
export const formatSet = values => values.size ? `{ ${[...values].join(', ')} }` : '∅';
