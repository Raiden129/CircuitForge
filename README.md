<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-name.svg">
    <source media="(prefers-color-scheme: light)" srcset="web/public/Logo-Name.svg">
    <img alt="CircuitForge" src="web/public/logo-name.svg" width="450">
  </picture>
</p>

# CircuitForge

Build circuits by hand, or let AI agents build, test, and debug alongside you in real time.  
Built for **The WebMCP Challenge**.

---

## What is CircuitForge?

CircuitForge is a browser-based digital logic simulator where human engineers and AI agents share the exact same editable canvas. 

It uses a fixed-step WebGL simulation engine. Instead of treating the canvas as pixels, CircuitForge exposes the circuit as a typed semantic environment. This means agents and humans can work on the exact same document at the same time.

### What can it do?
CircuitForge isn't just a schematic viewer or a basic gate sandbox. It gives AI agents the tools they need to solve real digital logic problems and build hierarchical architectures.

* **Complex Combinational Logic**: Agents can design and wire multi-bit arithmetic logic, like full adders, multiplexers, priority encoders, and ALUs.
* **Sequential Circuits & Memory**: It supports clocked systems like D/JK/T flip-flops, shift registers, synchronous counters, FSMs, and addressable memory.
* **Hierarchical Synthesis**: Using the `circuit_package_chip` tool, agents can group raw gate networks into custom ICs with specific pinouts and colors. Once packaged, these become reusable components. For example, an agent can package a 1-bit adder, use it to build an 8-bit adder, and package that to build a CPU datapath.
* **Automated Debugging**: When a circuit breaks, agents can run topological diagnostics. They can trace signals upstream to sources or downstream to sinks, find floating inputs, and rewire faulty paths.
* **Formal Verification**: Instead of guessing if an LED turned on, agents can use `circuit_verify_truth_table` to exhaustively test all $2^N$ input combinations against a boolean truth table and get exact pass/fail feedback from the engine.

---

## Why WebMCP?

Most modern web apps render complex UIs inside WebGL, WebGPU, or HTML5 `<canvas>`. This looks great, but it completely breaks standard AI assistants.

### The problem with standard canvas automation
1. **Vision and coordinate guessing**: Traditional AI assistants look at screenshots and guess where to click. This doesn't work for digital logic. Pins are a pixel wide, wires overlap, and sequential circuits change states too fast for static screenshots to catch.
2. **The opaque canvas**: WebGL renders directly to the frame buffer. There are no DOM elements or accessibility trees for logic gates. Tools like Puppeteer or Playwright just see an empty `<canvas>` tag.

### How WebMCP fixes this
WebMCP (`document.modelContext`) exposes a native, bidirectional control plane directly in the browser session.

1. **Shared Canvas**: The agent runs in the same browser tab and DOM context as you. When an agent places a gate, it shows up on your screen instantly.
2. **Direct Simulation Access**: The agent talks directly to the C# simulation graph running in WebAssembly. No pixel approximation or intermediate translation layers.
3. **Deterministic Mutations**: Every action (`circuit_add_component`, `circuit_connect`, etc.) runs transactionally against the circuit graph and returns an incremented revision counter (`rev: N`). This keeps things ordered and lets agents detect if you made an edit at the same time.
4. **Programmatic Verification**: The agent calls `circuit_verify_truth_table`. The engine locks the inputs, runs the simulation ticks, reads the outputs, and returns structured diagnostics showing exactly which rows failed.
5. **Spatial Awareness**: `circuit_get_snapshot` gives the agent camera telemetry (center, bounding box, zoom). The agent can use `circuit_set_viewport` to pan, zoom, or frame the active schematic so you both stay on the same page.
6. **Human Transparency**: Every agent tool call is logged in the live UI Activity Timeline. You keep full manual control, canvas interaction, and undo/redo history at all times.

---

## Architecture

CircuitForge bridges web-native agent interfaces with a high-performance C# simulation core compiled to WebAssembly.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             AGENT INTERFACE LAYER                           │
├────────────────────────────────────────┬────────────────────────────────────┤
│ Native In-Browser Agent                │ Remote Agent (CLI / External IDE)  │
│ (ChatGPT Browser, Chrome 149+ WebMCP)  │ (Claude Code, OpenAI Codex, CLI)   │
│ document.modelContext.registerTool()   │ Local WebSocket Relay (Port 5174)  │
└───────────────────────────────────┬────┴────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TYPESCRIPT HOST SHELL (Vite)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ • ToolRegistry: Centralized lifecycle dispatcher & schema validator (Zod)   │
│ • Activity Timeline: Real-time UI execution stream for all agent actions    │
│ • Viewport Bridge: Coordinate transforms (Screen ↔ NDC ↔ Unity World)       │
│ • State Synchronizer: Tracks revision counter, component map, and pin states│
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼ unityInstance.SendMessage("CircuitForgeBridge", "Dispatch", json)
┌─────────────────────────────────────────────────────────────────────────────┐
│                            INTEROP BOUNDARY (JSLIB)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Request ID Correlation: Asynchronous Promise tracking map                 │
│ • WebAssembly Extern: CircuitForgeResolve(requestId, responseJson)          │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               C# SIMULATION & SYNTHESIS ENGINE (Unity WebGL / WASM)         │
├─────────────────────────────────────────────────────────────────────────────┤
│ • CircuitForgeBridge: JSON command parser & state mutation dispatcher       │
│ • Authoritative Circuit Graph: DevChipInstance, Chip, Pin, Wire netlists    │
│ • Fixed-Step Simulation Driver: Signal propagation & clock oscillator       │
│ • Automated IC Synthesizer: circuit_package_chip with CalculateMinChipSize  │
│ • Exhaustive Truth-Table Engine: Evaluates all 2^N vectors across subchips  │
│ • Orthographic Viewport Controller: Dynamic camera framing & zoom bounds    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Subsystems

* **Tool Registry & Activity Timeline**: All tool calls (from native WebMCP or external CLI) go through `ToolRegistry.executeTool`. It validates parameters with Zod, sends the request to the engine, and streams the execution record to the UI Activity Timeline so you can see what the agent is doing.
* **Hierarchical IC Packaging (`circuit_package_chip`)**: Agents can package subcircuits into custom chips on the fly. The bridge finds input switches and output LEDs, converts them to pins, calculates the package geometry (`SubChipInstance.CalculateMinChipSize`), and adds the new chip to the UI toolbar.
* **Truth Table Verification (`circuit_verify_truth_table`)**: The engine takes arrays of input/output pins and expected binary vectors. It freezes the clock, forces each input state, waits for the network to settle, reads the outputs, and returns a row-by-row verification report.
* **Viewport Control (`circuit_set_viewport`)**: Gives agents spatial awareness. Snapshots include the camera center, world-space bounding box, and zoom level. Agents can pan, zoom, or call `fit_circuit` to automatically frame all placed components.

---

## WebMCP Tools

CircuitForge exposes 19 tools across 5 functional bundles:

### 1. Core & Snapshot
* `circuit_get_snapshot`: Returns the full circuit graph, pin states, wire connections, viewport bounds, and current revision ID.
* `circuit_get_capabilities`: Queries active tool bundles, canvas dimensions, simulation modes, and supported components.

### 2. Circuit Editing & Construction
* `circuit_add_component`: Places logic gates, I/O elements, or custom chips at specific world coordinates.
* `circuit_delete_component`: Deletes a component by ID and cuts attached wires.
* `circuit_move_component`: Moves an existing component to new coordinates.
* `circuit_connect`: Connects an output pin to an input pin (with topological validation).
* `circuit_disconnect`: Removes a wire connection between two pins.
* `circuit_clear`: Clears the canvas and resets counters.
* `circuit_undo`: Reverts the last edit or wiring transaction.
* `circuit_redo`: Re-applies the last undone transaction.

### 3. Simulation Control
* `circuit_set_input`: Drives a `0` or `1` onto a specific input pin.
* `circuit_pulse_clock`: Manually pulses the simulation clock by a set number of cycles.
* `circuit_reset_simulation`: Resets all signal propagation states to zero.

### 4. Inspection & Diagnostics
* `circuit_inspect_component`: Returns a component's metadata, pin list, coordinates, and current signal values.
* `circuit_trace_signal`: Traces electrical signals upstream to sources or downstream to sinks.
* `circuit_find_floating_inputs`: Scans for unconnected, high-impedance input pins.
* `circuit_verify_truth_table`: Sweeps through all $2^N$ input combinations and evaluates outputs against an expected boolean spec.

### 5. Packaging & Viewport Control
* `circuit_package_chip`: Synthesizes the active subcircuit into a reusable custom chip.
* `circuit_set_viewport`: Controls camera pan, zoom, or frames all components using `fit_circuit`.

---

## Dual Agent Support

CircuitForge supports both native browser agents and external CLI agents at the same time.

### Mode 1: Native In-Browser WebMCP
For browsers with native WebMCP support (like Chrome 149+ with flags enabled, or the ChatGPT in-app browser). Tools are registered directly into `document.modelContext` on page load. No external proxies needed.

### Mode 2: Remote Agent via MCP Relay
For external tools, IDE assistants, or CLI agents (like Claude Code, OpenAI Codex CLI, or custom scripts). CircuitForge includes a lightweight local WebSocket relay (`web/relay-server.cjs` on port 5174). External agents connect via standard MCP JSON-RPC over WebSocket to interact with the live browser tab.

---

## Quick Start

### Prerequisites
* **Node.js**: v18+ (tested on Node v24)
* **Browser**: Chrome 149+ with WebMCP enabled, or a ChatGPT browser environment.
  ```bash
  google-chrome --enable-blink-features=WebMCP,WebMCPTesting --enable-features=WebMCP,WebMCPTesting
  ```

### Running Locally
```bash
# Clone the repository
git clone https://github.com/Raiden129/CircuitForge.git
cd CircuitForge/web

# Install dependencies
npm install

# Start the Vite development server (Port 5173)
npm run dev

# (Optional) Start the remote agent relay server (Port 5174)
node relay-server.cjs
```

Open `http://localhost:5173` in your browser.

---

## Attribution & License

CircuitForge is built on the foundation of [Digital Logic Sim](https://github.com/SebLague/Digital-Logic-Sim) by Sebastian Lague, licensed under the MIT License. See [UPSTREAM.md](UPSTREAM.md) for full upstream attribution and challenge-period extensions.
