# LL(1) visual lab design

## Usage

Choose a grammar, select a nonterminal and a lookahead token, and compare the four views. A table cell selects the same decision everywhere. Walk the four views in order for a guided explanation. Then step the parser, scrub a grammar repair, inspect the implication counterexamples, or answer a practice question.

```js
const analysis = analyze('S -> A a\nA -> a | ε');
const selection = { lhs: 'A', token: 'a', pairIndex: 0 };
renderWorkbench(analysis, selection);
const frames = parseTrace(analysis, readInput('a', analysis));
```

## Shape

`grammar.mjs` owns token syntax, the reduced-grammar input gate, fixed-point FIRST/FOLLOW, SELECT routes, paired condition witnesses, table occupancy, left-corner cycles, and immutable parser snapshots. `examples.mjs` owns worked examples and bounded repair stories. `app.mjs` owns interaction and draws from one analysis. Native modules and relative URLs keep the artifact deployable as a static GitHub Pages site.

Epsilon is an empty right-hand side internally and appears in textbook FIRST sets. It never appears in FOLLOW, lookahead, or a table column. Each distinct production enters a cell once, even when both FIRST and FOLLOW select it. The parser stops at a conflict. The editor requires reachable, productive nonterminals before asserting the four-way equivalence; it explains invalid input without silently pruning it.

## Synthesis decision

Both candidates scored 23/25 in the independent judge's review. The judge favored the story's staged teaching. The chosen base is the connected workbench because the user's four requested perspectives benefit from comparing the same decision directly. Its controls and shared witnesses make that comparison executable. Grafts from the story are an explicit guided route, a counterexample gallery, and two authored ambiguity trees. Scroll-driven automatic scene changes were rejected because they can interrupt inspection of a decision and complicate keyboard and mobile behavior.

The resulting layout has a grammar rail, a responsive four-view area, and full-width sections for the parser, animated repairs, relationships, and practice. Every animation has manual steps and a text account. Reduced motion uses discrete states.

## Tradeoffs

- Curated repairs show exact before/after changes. A general conversion algorithm would suggest a guarantee the mathematics does not provide.
- The custom grammar editor analyzes LL(1), not general CFG ambiguity. Authored presets carry specific proofs or witnesses.
- Space-delimited tokens make multicharacter terminals and nonterminals explicit. The editor explains this syntax.

## Validation

Node tests compare computed FIRST, FOLLOW, selected cells, conflict causes, cycle witnesses, and successful/error/conflict traces against literal expected values. Browser checks exercise changing examples, selecting cells, stepping and replaying, editing a grammar, repair frames, questions, and narrow layouts. Publishing is complete only after the public URL loads and its controls work.
