---
name: validate-and-repair
description: Verify a flow is well-formed and fix what is off — dangling required inputs, invalid configs, and cycles.
---

Read the graph back and make it well-formed before you finish.

- Every required input port must be connected; wire any dangling one to a sensible upstream output.
- Every config value must be allowed by its block's schema; fix or report any that is not.
- The graph must stay acyclic; if a connection would close a loop, do not make it.
- Fix what the objective lets you fix; for anything you cannot resolve, report it precisely rather than guessing.
