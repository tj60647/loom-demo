# Loom

**Weaving Knowledge Through Shared Practice**

Loom is a tool for emergent sense-making and collaborative synthesis. It provides a space where reading, capturing, and connecting ideas form a living knowledge graph—built entirely by you and your community, without auto-generation.

## What is Loom?

Loom was born from the intersection of ethnographic research, theory, and practice. It is designed to help individuals and cross-disciplinary teams build shared understanding not by enforcing uniformity, but by negotiating differences.

The core workflow is simple:
1. **Read & Capture:** Read texts and distill passages into short "bytes" in your own words.
2. **Throw:** Pick two bytes and connect them.
3. **Name the Relation:** Define the "edge" between these ideas yourself, using your own phrasing or pulling a verb from one of the "tongues" (disciplinary thought styles).

Nothing is auto-generated. The tool only counts your own throws. The structure emerges organically from your coding: from open codes first, to axial reads across texts.

## Features

- **Bite-Sized Capture:** Synthesize complex readings into discrete, manageable nodes ("bytes").
- **Intentional Connections ("Throws"):** The power of Loom lies in the edges. You decide exactly how two concepts relate. 
- **Disciplinary "Tongues":** The verbs we reach for to name a relation (e.g., *constrains*, *refutes*, *betrays*) aren't neutral; each belongs to a specific way of seeing the world. Loom lets you apply different lenses (e.g., "Cause & system" vs. "Stance & value") to the same connections to see how meaning shifts.
- **The Woven Graph:** View your interconnected graph ("Read") and generate an "axial read"—a synthesized narrative spanning multiple texts that you can instantly copy as a draft.

## The Theory Behind the Tool

Loom is built on foundational ideas from design theory, sociology, and ethnographic coding (see the [concept deck](./docs/presentations/coupled_spaces_deck_v12.pdf) for a deeper dive):

- **[Object Worlds (Bucciarelli)](./docs/readings/Bucciarelli-Designing%20Engineers.pdf):** Each discipline inhabits its own world with its own instruments and language. A mechanical engineer might name a connection "is the bottleneck for," while a humanist might say it "betrays" the text. Loom makes these differing worldviews visible and actionable.
- **[Communities of Practice (Wenger)](./docs/readings/Wenger_communities-of-practice.pdf):** Shared vocabularies are learned by participating in a community, not just by being told. Loom enables a class or team to grow its own shared edge-vocabulary over time by doing the work together.
- **[Boundary Objects (Star)](./docs/readings/Star,%202010%20'This%20Is%20Not%20A%20Boundary%20Object'.pdf):** How do people from distinct fields coordinate around one shared object without agreeing on exactly what it means? Loom serves as a cross-tongue boundary object—flexible enough to be locally useful, but robust enough to hold a common identity across groups.

---

## Developer Guide

This is a [Next.js](https://nextjs.org) project bootstrapped with `create-next-app`.

### Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. You can start editing the page by modifying `app/page.tsx` (or `src/app/page.tsx`). The page auto-updates as you edit the file.
