import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, firstOf, parseTrace, readInput } from './grammar.mjs';
import { examples } from './examples.mjs';

const sorted = values => [...values].sort();
const productionsAt = (analysis, lhs, token) => analysis.table.get(lhs).get(token).map(entry => [entry.production.lhs, entry.production.rhs]);

test('the nullable/FOLLOW counterexample has a two-production cell', () => {
  const a = analyze('S -> A a\nA -> a | ε');
  assert.deepEqual(sorted(a.first.get('S')), ['a']);
  assert.deepEqual(sorted(a.first.get('A')), ['a', 'ε']);
  assert.deepEqual(sorted(a.follow.get('A')), ['a']);
  assert.deepEqual(productionsAt(a, 'A', 'a'), [['A', ['a']], ['A', []]]);
  assert.deepEqual(a.pairs[0].rules, [true, true, false]);
  assert.equal(a.ll1, false);
  assert.deepEqual(a.cycles, []);
  const frames = parseTrace(a, ['a']);
  assert.equal(frames.at(-1).kind, 'conflict');
  assert.deepEqual(frames.at(-1).stack, ['A', 'a', '$']);
  assert.deepEqual(frames.at(-1).consumed, []);
});

test('the three causes fail their respective numbered rule', () => {
  const first = analyze('S -> a b | a c');
  assert.deepEqual(first.pairs[0].rules, [false, true, true]);
  assert.deepEqual(sorted(first.pairs[0].firstOverlap), ['a']);
  const empty = analyze('S -> A | B\nA -> ε\nB -> ε');
  assert.deepEqual(empty.pairs[0].rules, [true, false, true]);
  assert.deepEqual(productionsAt(empty, 'S', '$'), [['S', ['A']], ['S', ['B']]]);
});

test('a nullable indirect RHS is selected through FOLLOW', () => {
  const a = analyze('S -> A c\nA -> B | a\nB -> ε');
  assert.equal(a.ll1, true);
  assert.deepEqual(sorted(a.first.get('A')), ['a', 'ε']);
  assert.deepEqual(sorted(a.follow.get('B')), ['c']);
  assert.deepEqual(productionsAt(a, 'A', 'c'), [['A', ['B']]]);
  assert.deepEqual(a.table.get('A').get('c')[0].reasons.get('c'), ['FOLLOW']);
  assert.equal(parseTrace(a, ['c']).at(-1).kind, 'accept');
});

test('factoring resolves ab/ac and preserves acceptance of both strings', () => {
  const a = analyze('S -> a X\nX -> b | c');
  assert.equal(a.ll1, true);
  assert.deepEqual(productionsAt(a, 'S', 'a'), [['S', ['a', 'X']]]);
  assert.equal(parseTrace(a, ['a', 'b']).at(-1).kind, 'accept');
  assert.equal(parseTrace(a, ['a', 'c']).at(-1).kind, 'accept');
  assert.equal(parseTrace(a, ['a', 'a']).at(-1).kind, 'error');
});

test('immediate, indirect, and nullable-prefix left recursion are detected', () => {
  const direct = analyze('E -> E + T | T\nT -> id');
  assert.deepEqual(direct.cycles, [['E', 'E']]);
  assert.deepEqual(productionsAt(direct, 'E', 'id'), [['E', ['E', '+', 'T']], ['E', ['T']]]);
  const indirect = analyze('S -> A\nA -> S a | b');
  assert.deepEqual(indirect.cycles, [['S', 'A', 'S'], ['A', 'S', 'A']]);
  const hidden = analyze('A -> B A a | b\nB -> ε');
  assert.deepEqual(hidden.cycles, [['A', 'A']]);
  assert.equal(hidden.ll1, false);
});

test('right recursion consumes tokens and can be LL(1)', () => {
  const a = analyze('E -> T R\nR -> + T R | ε\nT -> id');
  assert.equal(a.ll1, true);
  assert.deepEqual(a.cycles, []);
  const frames = parseTrace(a, ['id', '+', 'id']);
  assert.equal(frames.at(-1).kind, 'accept');
  assert.deepEqual(frames.filter(frame => frame.kind === 'match').map(frame => frame.matched), ['id', '+', 'id']);
});

test('FIRST handles a sequence of nullable prefixes', () => {
  const a = analyze('S -> A B c\nA -> a | ε\nB -> b | ε');
  assert.deepEqual(sorted(firstOf(['A', 'B', 'c'], a.first)), ['a', 'b', 'c']);
  assert.deepEqual(sorted(a.follow.get('A')), ['b', 'c']);
  assert.deepEqual(sorted(a.follow.get('B')), ['c']);
  assert.deepEqual(sorted(firstOf([], a.first)), ['ε']);
});

test('a production reaching a cell through two routes is inserted once', () => {
  const a = analyze('S -> A a\nA -> B\nB -> a | ε');
  assert.deepEqual(productionsAt(a, 'A', 'a'), [['A', ['B']]]);
  assert.deepEqual(a.table.get('A').get('a')[0].reasons.get('a'), ['FIRST', 'FOLLOW']);
  assert.deepEqual(a.conflicts.map(conflict => [conflict.lhs, conflict.token]), [['B', 'a']]);
});

test('course exam sets, table, and accepted trace match literal expectations', () => {
  const a = analyze('S -> 1 A B | ε\nA -> 1 A C | 0 C\nB -> 0 S\nC -> 1');
  assert.equal(a.ll1, true);
  assert.deepEqual(Object.fromEntries([...a.first].map(([key, set]) => [key, sorted(set)])), {
    S: ['1', 'ε'], A: ['0', '1'], B: ['0'], C: ['1'],
  });
  assert.deepEqual(Object.fromEntries([...a.follow].map(([key, set]) => [key, sorted(set)])), {
    S: ['$'], A: ['0', '1'], B: ['$'], C: ['0', '1'],
  });
  assert.deepEqual(productionsAt(a, 'S', '$'), [['S', []]]);
  const trace = parseTrace(a, ['1', '0', '1', '0']);
  assert.equal(trace.at(-1).kind, 'accept');
  assert.deepEqual(trace.filter(frame => frame.kind === 'expand').map(frame => frame.entry.production.rhs), [
    ['1', 'A', 'B'], ['0', 'C'], ['1'], ['0', 'S'], [],
  ]);
});

test('input errors remain distinct from grammar conflicts', () => {
  const a = analyze('S -> a A | b\nA -> c');
  assert.equal(a.ll1, true);
  const missing = parseTrace(a, ['a', 'b']);
  assert.equal(missing.at(-1).kind, 'error');
  assert.deepEqual(missing.at(-1).cell, { lhs: 'A', token: 'b' });
  const mismatch = parseTrace(analyze('S -> a b'), ['a']);
  assert.equal(mismatch.at(-1).kind, 'error');
  assert.match(mismatch.at(-1).message, /expects b/);
});

test('all curated examples agree across pair checks, SELECT, and table cells', () => {
  const actual = {};
  for (const example of examples) {
    const a = analyze(example.source);
    actual[example.id] = a.ll1;
    assert.equal(a.pairs.every(pair => pair.rules.every(Boolean)), a.ll1, example.id);
    assert.equal(a.pairs.every(pair => pair.selectOverlap.size === 0), a.ll1, example.id);
    assert.equal(a.table.values().every(row => row.values().every(choices => choices.length <= 1)), a.ll1, example.id);
    for (const follow of a.follow.values()) assert.equal(follow.has('ε'), false);
    for (const row of a.table.values()) assert.equal(row.has('ε'), false);
  }
  assert.deepEqual(actual, {
    clean: true, 'first-first': false, 'double-empty': false, 'first-follow': false,
    'nullable-chain': true, factored: true, 'left-recursion': false,
    'recursion-removed': true, 'indirect-recursion': false, 'hidden-prefix': false,
    ambiguous: false, exam: true, practice: true,
  });
});

test('productive and reachable rules are required before a verdict', () => {
  assert.throws(() => analyze('S -> S'), /cannot derive a finite terminal string/);
  assert.throws(() => analyze('S -> a\nA -> ε | B\nB -> ε'), /cannot be reached from S/);
  const empty = analyze('S -> ε');
  assert.equal(empty.ll1, true);
  assert.equal(parseTrace(empty, []).at(-1).kind, 'accept');
});

test('grammar syntax and token boundaries have clear diagnostics', () => {
  assert.throws(() => analyze('S -> aA\nA -> b'), /cannot be reached/);
  assert.throws(() => analyze('S -> a A'), /A has no production/);
  assert.throws(() => analyze('S -> ε a'), /whole alternative/);
  assert.throws(() => analyze('S -> $'), /end marker/);
  assert.throws(() => analyze('S -> a | a'), /repeats/);
  assert.throws(() => analyze('S -> a |'), /write ε/);
  assert.equal(analyze('S ::= epsilon').ll1, true);
  const a = analyze('S -> id + id');
  assert.deepEqual(readInput('id + id $', a), ['id', '+', 'id']);
  assert.throws(() => readInput('id $ id', a), /only at the end/);
  assert.throws(() => readInput('id+id', a), /Unknown input token/);
});
