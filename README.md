# ⚡ CircuitForge — Agent-Native Digital Logic Studio

> **Build circuits by hand. Let agents build, test, and teach alongside you.**  
> Built for **The WebMCP Challenge**.

---

## What is CircuitForge?

CircuitForge is an interactive, browser-based digital logic studio where humans and AI agents share the exact same editable, simulated circuit.

- **For Learners & Builders**: A full visual circuit laboratory to place logic gates, route wires, toggle inputs, configure clocks, view waveforms, and inspect live signals.
- **For AI Agents via WebMCP**: A first-class, typed semantic control plane exposed directly in the browser via `document.modelContext`. The agent inspects components and pin states, connects logic gates, diagnoses broken signal paths, and verifies truth tables—**never scraping pixels or guessing coordinates**.

---

## Why WebMCP Makes This Possible

Before WebMCP, AI assistants trying to interact with visual canvas applications relied on brittle computer vision: screenshotting the canvas, asking multimodal models to guess coordinates, and simulating mouse clicks. This fails completely on dense schematics with micro-pins and high-frequency simulation.

**CircuitForge uses WebMCP to establish a typed contract over the live simulation model:**
1. **Shared Single-Document Canvas**: The agent executes inside the same browser tab, session, and DOM context.
2. **Deterministic Mutation & Revision Tracking**: Every agent action (`circuit_add_component`, `circuit_connect`, `circuit_set_input`) executes against the authoritative simulation model and returns the new circuit revision.
3. **Structured Verification & Explanation**: The agent runs test matrices across input pins and reports verified signal outputs, diagnosing floating wires or logic bugs with exact pin identifiers.
4. **Human Transparency**: Every agent operation appears in real time on the canvas and in the visible activity timeline. The human retains full manual control and undo/redo capabilities.

---

## Architecture

```text
Browser Agent (ChatGPT / Chrome WebMCP)
  │
  ▼ [calls WebMCP tool via document.modelContext]
TypeScript Host Shell (Vite + Zod runtime schemas)
  │
  ▼ [dispatches validated JSON command via unityInstance.SendMessage]
C# CircuitForgeBridge (Unity WebGL / IL2CPP / WebAssembly)
  │
  ├── Main-thread fixed-step simulation driver
  ├── Live circuit graph model (DevChipInstance & SimChip)
  └── Authoritative state mutation & truth-table verifier
  │
  ▼ [resolves via .jslib -> window.CircuitForgeBridge.resolve]
Structured WebMCP Result returned to Agent & logged to Activity Timeline
```

---

## WebMCP Tools

- **`circuit_get_snapshot`**: Returns the complete active circuit graph (components, pins, wires, current signal values, and revision).
- **`circuit_get_capabilities`**: Reports active WebMCP tool bundles, editability, and simulation mode.
- *(Additional bundles: Edit, Simulation, and Learning)*

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js**: v18+ (tested on Node v24)
- **Browser**: Chrome 149+ with WebMCP enabled (`--enable-blink-features=WebMCP,WebMCPTesting --enable-features=WebMCP,WebMCPTesting`) or ChatGPT in-app browser.

### Running the Web Host
```bash
cd web
npm install
npm run dev
```

Visit `http://localhost:5173`.

---

## Attribution & License

CircuitForge is built on the foundation of [Digital Logic Sim](https://github.com/SebLague/Digital-Logic-Sim) by Sebastian Lague, licensed under the MIT License. See [UPSTREAM.md](UPSTREAM.md) for full attribution details and challenge-period extensions.
