---
name: build-linear-pipeline
description: Build or extend a straight input → process… → output chain — add the blocks in order, wire each stage to the next, and lay them out left-to-right.
---

Assemble a linear flow — a single chain where each stage feeds the next.

1. Read what is already on the canvas and the catalog for the block types you need; reuse an existing node instead of duplicating one.
2. Add the stages in dependency order (source first, sink last), giving each its non-default config as you create it rather than adding then reconfiguring.
3. Lay the chain out left-to-right: place each new node to the right of its predecessor, on the same vertical band, evenly spaced, so the flow reads in order.
4. Wire adjacent stages — a source output to the next input, one edge per input. Never leave a required input dangling and never create a cycle.
5. Read the graph back; if a required input is unwired or a config is invalid, repair it before finishing.
6. Report the chain you built (its nodes and edges) and anything you could not.
