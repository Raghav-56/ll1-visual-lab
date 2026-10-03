# LL(1) visual lab

Compare the same production choice through the three verbal rules, FIRST/FOLLOW disjointness, predictive-table cells, and a parser decision diagram. Edit a grammar, animate a parser trace, inspect factoring and recursion repairs, and use counterexamples to separate LL(1) from unambiguity.

[Open the website](https://raghav-56.github.io/ll1-visual-lab/).

## Run the site

Install Node.js 24 or later, then run:

```sh
node server.mjs
```

Open http://localhost:4176. The website itself has no runtime dependencies, build step, or backend. GitHub Pages serves the repository root from `main`.

## Run the checks

Check the grammar engine against literal expected sets, cells, and traces:

```sh
npm test
```

Run desktop and mobile browser checks:

```sh
npm ci
npx playwright install chromium
npx playwright test
```

On Windows, the browser checks use Google Chrome when it is installed at its standard system path. Otherwise, Playwright uses its installed Chromium. Set `LL1_BROWSER_PATH` to use another executable. Set `LL1_TEST_URL` to the deployed URL, including its trailing slash, to check that site instead of the local server.

Screenshots appear in `artifacts/`. Browser results and dependencies are excluded from Git.

## Enter a grammar

Write one left-hand side per line and separate every symbol with spaces:

```text
S -> A a
A -> a | ε
```

The first left-hand side is the start symbol. Capitalized names are nonterminals and need a production. `ε`, `eps`, and `epsilon` represent an empty alternative. `$` is reserved for the end of input and never belongs in a production. Input tokens also need spaces; the parser adds `$` automatically.

The lab requires every nonterminal to be reachable and productive before returning an LL(1) verdict. It reports unused or nonterminating rules instead of silently pruning them. All competing productions survive in a table cell; the parser stops at conflicts without breaking ties.

## Read the examples

The site includes 13 grammars, three repair stories, a diagram of the implications, two full ambiguity trees, and three practice questions. The course exam grammar is included with input `1 0 1 0`.

`S -> A a; A -> a | ε` is the central counterexample. It is unambiguous, has no left recursion, and is already left factored. Its `A/a` cell still has two productions. The engine tests check this conflict independently of the UI.

General CFG ambiguity is undecidable. The lab proves or exhibits ambiguity for authored examples; it does not decide ambiguity for arbitrary edited grammars. Factoring and recursion removal address specific problems, and their results still need the LL(1) checks.

## Sources

The page links to [Princeton's visualizer](https://www.cs.princeton.edu/courses/archive/spring20/cos320/LL1/), [JSMachines](https://jsmachines.sourceforge.net/machines/ll1.html), [ComVis](https://comvis.pr.ac.rs/ll1-parser.jsp), and [Montana State Webworks](https://www.cs.montana.edu/webworks/webworks-home/projects/compilers/LL-1.html). Its diagrams and code are original.

The theory follows [Lund's LL-parsing lecture](https://fileadmin.cs.lth.se/courses/EDAN65/2025/lectures/L05A.pdf), [Princeton's parsing lecture](https://www.cs.princeton.edu/courses/archive/spring15/cos320/lectures/03-Parsing-2x2.pdf), [Calgary's grammar-transformation notes](https://cspages.ucalgary.ca/~robin/class/411/LL1.3.html), and [Alfred Aho's CFG lecture](https://www.cs.columbia.edu/~aho/cs4115/lectures/14-02-17.htm). The three-condition wording follows the supplied Dragon Book excerpts. FIRST includes ε in this lab; FOLLOW never does.
