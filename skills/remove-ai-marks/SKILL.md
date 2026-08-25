---
name: remove-ai-marks
description: Strip telltale signs of AI-generated text from a file or pasted passage — em-dashes used as separators, curly quotes, "not just X, it's Y" cadence, filler transitions ("furthermore", "moreover", "in conclusion"), overused verbs ("delve", "leverage", "tapestry"), stray emojis, and trailing hedges. Use when the user asks to de-AI, humanize, or clean the "AI voice" out of prose.
---

# Remove AI Marks

Rewrite text so it stops reading as AI-generated, without changing what it says.

## When to invoke

The user asks to:
- "Remove AI marks / AI tells / AI slop"
- "De-AI / humanize / dehallucinate the tone" of a passage
- "Make this sound less like ChatGPT / Claude"
- Clean AI residue from a doc, PR description, blog draft, email

Applies to prose the user hands over (a file path, a pasted block, or the output of an earlier turn). Do NOT apply to source code, code comments authored by humans, or verbatim quotes the user asked to preserve.

## What to strip

Work through the passage once and fix each of these:

**Punctuation**
- Em-dash (`—`) used as a sentence-splitter → replace with a period, comma, or parenthetical, whichever preserves the sentence rhythm. Keep em-dashes only when the surrounding text is clearly the user's own style.
- Curly quotes (`" " ' '`) → straight quotes (`"` `'`).
- Ellipsis character (`…`) → `...` or a period, depending on whether the pause is real.

**Cadence / structure**
- "It's not just X — it's Y" and "not only … but also …" contrastive scaffolds → collapse to the actual claim.
- "In today's fast-paced world", "In the ever-evolving landscape of", "In conclusion", "In summary" openers → delete or replace with the concrete subject.
- Tri-colons ("It's fast, reliable, and scalable.") when the three items are filler → keep the ones that carry information, drop the rest.
- Rhetorical questions the writer immediately answers ("But what does this mean? It means…") → state the answer directly.

**Vocabulary**
Replace or delete when the word is doing no work:
`delve`, `leverage`, `utilize` (→ use), `tapestry`, `landscape` (metaphorical), `realm`, `journey`, `robust`, `seamless`, `holistic`, `synergy`, `paradigm`, `underscore` (as verb), `foster`, `navigate` (metaphorical), `unlock`, `harness`, `elevate`, `empower`, `crucial`, `pivotal`, `paramount`, `myriad`, `plethora`, `bespoke` (unless literal).

**Filler transitions**
`Furthermore`, `Moreover`, `Additionally`, `Consequently`, `Nevertheless`, `Ultimately`, `Notably`, `Importantly`, `It's worth noting that`, `It goes without saying that`. Prefer a period and a new sentence, or nothing.

**Hedges and disclaimers**
`It's important to note that`, `As an AI`, `While I don't have real-time access`, `I hope this helps!`, `Feel free to…`, `Please let me know if…` → cut unless the passage is a reply that actually needs sign-off.

**Emoji and decoration**
Remove emoji unless the user's own prior writing uses them. Remove decorative bullets (✨, 🚀, ✅ used as list markers).

**Structure**
- Bulleted lists where a sentence would do → convert to prose.
- H2/H3 headers on short passages that don't need navigation → remove.
- Bolding of key phrases every paragraph → remove; keep bolding only where a reader scanning would genuinely benefit.

## What NOT to change

- Facts, numbers, names, quotes.
- The user's own voice when a mark is authentic — some writers really do use em-dashes. Look at the surrounding style; when in doubt, ask.
- Code, code blocks, filenames, commands, URLs.
- Anything inside a block the user marked "keep as-is".

## Method

1. Read the whole passage first. Note its actual argument in one sentence — that survives the edit.
2. Pass through paragraph by paragraph, applying the strip list above.
3. Read the result out loud (mentally). If a sentence still sounds like an executive summary of itself, tighten it.
4. Show the user the cleaned version. If the passage was long, also offer a short diff of what changed and why, so they can push back on choices you made.

## Edge cases

- **Very short passages** (< 3 sentences): the cadence tells rarely apply; focus on vocabulary and punctuation.
- **Technical docs**: keep precise terms even if they appear on the strip list ("robust" is meaningful in stats; "leverage" is meaningful in finance).
- **The user's own AI-assisted draft**: they may want tone preserved and only the tells removed. Ask before doing a full rewrite.
- **Ambiguous em-dash**: if removing it changes the meaning (a real parenthetical), keep it.

Deliver the rewritten text, not a lecture about AI writing.
