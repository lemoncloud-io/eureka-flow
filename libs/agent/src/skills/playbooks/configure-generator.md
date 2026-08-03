---
name: configure-generator
description: Configure an AI text generator node correctly — choose a valid model, set provider-appropriate sampling parameters, and keep the system vs. user prompt distinct.
---

Configure a single-output-generator so it is valid and runnable. Confirm exact field names against the block's schema before writing.

- `model` is a select — set only a value the schema lists, and never swap a requested model for a different one. The model implies the provider key needed at run time: a `gpt-*` model needs an OpenAI key; every other (e.g. `gemini-*`) needs a Gemini key. If the requested model is not offered, report that rather than substituting.
- `temperature` / `topK` / `topP` tune sampling (higher temperature = more random). Map a loose ask ("more focused", "more creative") onto the field and value that express it.
- Keep `systemPrompt` (the standing instruction) and `prompt` (the per-run user input) distinct.
- Set only the fields the task asks for; leave the rest untouched.
