---
name: build-linear-pipeline
description: Build or extend a flow from a plan — usually a straight input → process… → output chain — adding the blocks in dependency order, wiring each stage to the one(s) that consume it, and laying them out left-to-right. Also handles a branch or merge (a flow is a DAG).
---

Assemble the flow as a directed acyclic graph (DAG) — most often a single linear chain where each stage feeds the next, but a stage may fan out to several consumers, or take inputs from several sources, when the plan calls for it.

1. Read what is already on the canvas and the catalog for the block types you need; reuse an existing node instead of duplicating one.
2. Add the stages in dependency order (sources first, sinks last), giving each its non-default config as you create it rather than adding then reconfiguring.
3. Lay the flow out left-to-right: place each node to the right of the stage(s) that feed it, on an even vertical band, evenly spaced, so it reads in dependency order; put parallel branches on their own rows.
4. Wire each stage to the one(s) that consume it, following the plan's dependencies — a source output to the intended target input. Look a block's ports up once (catalog_search returns them with the schema) and reuse them across every node of that type — don't re-inspect ports you already have. An output may fan out to several inputs, but each input takes exactly one edge. Never leave a required input dangling, and never create a cycle (the graph stays acyclic).
5. Report the flow you built (its nodes and edges) and anything you could not.
