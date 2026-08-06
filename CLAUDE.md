## graphify

Knowledge graph at graphify-out/: god nodes, community structure, cross-file relationships.

Rules:
- Codebase questions: first run `graphify query "<question>"` when graphify-out/graph.json exists. `graphify path "<A>" "<B>"` for relationships, `graphify explain "<concept>"` for focused concepts. Return scoped subgraph, much smaller than GRAPH_REPORT.md or raw grep.
- If graphify-out/wiki/index.md exists, use for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain not enough.
- After each git commit, run `graphify update .` to keep graph current (AST-only, no API cost).
