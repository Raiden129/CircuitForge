<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-name.svg">
    <source media="(prefers-color-scheme: light)" srcset="web/public/Logo-Name.svg">
    <img alt="CircuitForge" src="web/public/logo-name.svg" width="450">
  </picture>
</p>

# CircuitForge — Agent-Native Digital Logic Studio

> **Build circuits by hand. Let agents build, test, and teach alongside you.**  
> Built for **The WebMCP Challenge**.

---

## What is CircuitForge?

CircuitForge is an interactive, browser-based digital logic studio where human engineers and autonomous AI agents share the exact same editable, simulated circuit in real time.

Built on an authoritative, fixed-step WebGL simulation engine, CircuitForge transforms visual circuit design from an opaque, pixel-rendered canvas into a first-class, typed semantic environment. Agents and humans operate as co-designers on a single shared document canvas.

### Solving Complex Digital Circuit and Logic Problems
CircuitForge is not merely a static schematic viewer or basic gate sandbox. It provides autonomous AI agents with the tools required to solve high-order digital logic problems, synthesize hierarchical computer architectures, and conduct automated formal verification:

- **Complex Combinational Logic Design**: Agents can design, wire, and optimize multi-bit arithmetic and routing logic, including full adders, ripple-carry adders, subtractors, 4-to-1 multiplexers (MUX), 1-to-4 demultiplexers (DEMUX), priority encoders, and multi-function Arithmetic Logic Units (ALUs).
- **Sequential Circuits & Memory Architectures**: Agents can assemble and stabilize clocked sequential systems, including D flip-flops, JK flip-flops, T flip-flops, edge-triggered shift registers, synchronous binary counters, finite state machines (FSMs), and addressable memory cells.
- **Hierarchical Modular Synthesis**: Using the `circuit_package_chip` engine, agents synthesize raw gate networks into self-contained, named custom Integrated Circuits (ICs) with custom pinouts, colors, and auto-calculated package dimensions. Once packaged, custom chips immediately become reusable components in the agent's component catalog, enabling agents to build complex architectures layer-by-layer (for example, packaging a 1-bit full adder to assemble an 8-bit ripple-carry adder, and packaging that to assemble a CPU datapath).
- **Automated Defect Localization & Repair**: When a circuit behaves unexpectedly, agents run deep topological diagnostics: tracing active electrical signals upstream to driving sources or downstream to sinks, identifying floating high-impedance inputs, detecting disconnected pins, and surgically severing or rewiring faulty signal paths.
- **Formal Truth Table Verification**: Rather than relying on guesswork, agents exhaustively test circuits across all $2^N$ input combinations against formal boolean truth tables, receiving structured vector-by-vector pass/fail feedback directly from the simulation engine.

---

## Why WebMCP Makes This Possible

Modern web applications increasingly render complex graphical interfaces inside WebGL, WebGPU, or HTML5 `<canvas>` elements. While this enables high-performance 60 FPS graphics, it introduces an insurmountable barrier for conventional AI assistants.

### The Failure Modes of Prior Approaches
1. **The Vision + Coordinate Guessing Trap**: Prior AI assistants interact with graphical canvases through computer vision: taking screenshots, asking multimodal models to predict pixel coordinates, and synthesizing simulated mouse clicks. In digital logic design, this approach fails catastrophically:
   - Logic pins are mere pixels wide; a single pixel offset misroutes a connection or shorts a bus.
   - Wires overlap in multi-color layers, making visual wire tracing ambiguous.
   - Clocked sequential circuits alternate states at high frequencies that static screenshots cannot capture.
2. **The Opaque Canvas Problem**: In WebGL and WebAssembly, logic gates and wires are rendered directly into the frame buffer using GPU shaders. There are no DOM elements, no semantic HTML nodes, and no accessible accessibility tree for logic gates. Standard browser automation tools (Puppeteer, Playwright) see only an empty `<canvas id="unity-canvas">`.

### The WebMCP Solution: A Typed Semantic Control Plane
WebMCP (`document.modelContext`) fundamentally changes this paradigm by exposing a native, bidirectional, schema-enforced control plane directly inside the browser session:

1. **Shared Single-Document Canvas**: The agent executes inside the same browser tab, session, and DOM context as the human. When an agent places a gate or routes a wire, it appears instantly on the human's screen.
2. **Authoritative Simulation Single-Source-of-Truth**: The agent interacts directly with the authoritative C# simulation graph running in WebAssembly memory. There is no intermediate translation layer or pixel approximation.
3. **Deterministic Mutation & Revision Tracking**: Every agent action (`circuit_add_component`, `circuit_connect`, `circuit_set_input`, `circuit_package_chip`) executes transactionally against the circuit graph and returns an incremented circuit revision counter (`rev: N`). This guarantees causal ordering and lets agents detect concurrent human edits.
4. **Exhaustive Simulation Verification**: Instead of asking an agent to "look at the LED and guess if it turned on", the agent calls `circuit_verify_truth_table`. The simulation engine programmatically locks input vectors, runs simulation propagation ticks, reads output pins, and returns structured diagnostics identifying exact failing rows.
5. **Spatial Telemetry & Viewport Synchronization**: `circuit_get_snapshot` provides real-time viewport telemetry, including camera center, visible coordinate bounding boxes, and zoom level. Using `circuit_set_viewport`, the agent can pan, zoom, or trigger `fit_circuit` to frame the active schematic, ensuring human and agent maintain mutual visual alignment.
6. **Total Human Transparency & Co-Creativity**: Every agent tool call is intercepted by `ToolRegistry` and rendered in the live UI Activity Timeline with execution metadata, parameters, and results. The human retains full manual override, canvas interaction, and undo/redo control at all times.

---

## Architecture & Technical Implementation

CircuitForge bridges web-native agent interfaces with a high-performance C# digital logic simulation core compiled to WebAssembly:

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
│ • Activity Timeline: Real-time UI execution stream for all agent actions   │
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
│ • Orthographic Viewport Controller: Dynamic camera framing & zoom bounds   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Technical Subsystems

1. **Centralized Agent Tool Registry & Activity Timeline**:
   Every tool call—whether originating from native in-browser WebMCP or an external CLI relay—passes through a centralized execution interceptor in `ToolRegistry.executeTool`. This validates parameters with Zod, dispatches the request to the simulation engine, and streams an execution record to the visible UI Activity Timeline, giving users real-time visibility into the agent's thought process.

2. **Hierarchical IC Packaging Engine (`circuit_package_chip`)**:
   Agents can package arbitrary subcircuits into custom chips on the fly. The bridge automatically identifies input switches and output indicators, converts LEDs to output pins (`OUT-1`, `OUT-2`), generates a custom chip definition (`SavedChip`), computes required package geometry using `SubChipInstance.CalculateMinChipSize` so long chip labels never clip or overflow, registers the chip in the catalog, and updates the UI toolbar.

3. **Exhaustive Truth Table Verification Engine (`circuit_verify_truth_table`)**:
   Enables formal verification directly in the simulation engine. The bridge takes an array of input pin names, output pin names, and expected binary vectors. It freezes clock cycles, iteratively forces each binary input state, allows the simulation network to settle, reads output pins, and returns an itemized row-by-row verification report highlighting any unexpected outputs.

4. **Spatial Coordination & Viewport Framing (`circuit_set_viewport`)**:
   Provides agents with spatial awareness. Every snapshot includes the camera's current coordinate center, visible world-space bounding box, zoom level, and aspect ratio. Agents can navigate the canvas using `pan`, adjust `zoom`, or call `fit_circuit` to calculate the collective bounding box of all placed components and smoothly center the camera around them.

---

## WebMCP Tools (19 Tools Across 5 Bundles)

CircuitForge exposes 19 discrete WebMCP tools organized into 5 functional bundles:

### 1. Core & Snapshot
- **`circuit_get_snapshot`**: Returns the complete active circuit graph, including all placed components, pin states, wire connections, viewport bounds, and current revision ID.
- **`circuit_get_capabilities`**: Queries active tool bundles, canvas dimensions, simulation modes, and supported component types.

### 2. Circuit Editing & Construction
- **`circuit_add_component`**: Places logic gates (`AND`, `OR`, `NOT`, `XOR`, `NAND`, `NOR`, `XNOR`), I/O elements (`INPUT`, `OUTPUT`), or custom packaged chips at specified world coordinates.
- **`circuit_delete_component`**: Deletes a component by ID and automatically severs all attached wires.
- **`circuit_move_component`**: Repositions an existing component to new coordinates on the schematic canvas.
- **`circuit_connect`**: Connects an output pin to an input pin with topological validation preventing invalid connections.
- **`circuit_disconnect`**: Removes a specific wire connection between two pins.
- **`circuit_clear`**: Clears the active canvas and resets component counters.
- **`circuit_undo`**: Reverts the most recent circuit edit or wiring transaction.
- **`circuit_redo`**: Re-applies the most recently undone transaction.

### 3. Simulation Control
- **`circuit_set_input`**: Drives a binary state (`0` or `1`) onto a specified input pin.
- **`circuit_pulse_clock`**: Manually pulses the simulation clock by a designated cycle count.
- **`circuit_reset_simulation`**: Resets all signal propagation states across the active schematic to zero.

### 4. Inspection & Diagnostics
- **`circuit_inspect_component`**: Inspects a single component's internal metadata, pin list, coordinates, and signal values.
- **`circuit_trace_signal`**: Performs a bidirectional graph traversal tracing electrical signals upstream to driving sources or downstream to sinks.
- **`circuit_find_floating_inputs`**: Scans the schematic for unconnected, high-impedance input pins that cause logic instability.
- **`circuit_verify_truth_table`**: Programmatically sweeps through all $2^N$ input combinations, evaluating outputs against an expected boolean specification.

### 5. Packaging & Viewport Control
- **`circuit_package_chip`**: Synthesizes the active subcircuit into a reusable custom chip with auto-sized footprint, custom color, and pin mapping.
- **`circuit_set_viewport`**: Controls camera pan, zoom factor, or automatically frames all components using `fit_circuit`.

---

## Dual Agent Support: In-Browser & Remote CLI

CircuitForge supports both native browser agents and external CLI agents simultaneously:

### Mode 1: Native In-Browser WebMCP
For browsers with native WebMCP support (such as Chrome 149+ with WebMCP flags enabled or the ChatGPT in-app browser). Tools are registered directly into `document.modelContext` on page load. No external proxies or configurations are required.

### Mode 2: Remote Agent via MCP Relay
For external AI tools, IDE assistants, or CLI agents (such as Claude Code, OpenAI Codex CLI, or custom Python/Node automation scripts).
CircuitForge includes a lightweight local WebSocket relay (`web/relay-server.cjs` on port 5174). External agents connect via standard MCP JSON-RPC protocol over WebSocket or SSE to inspect, build, and verify circuits in the live browser tab.

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js**: v18+ (tested on Node v24)
- **Browser**: Chrome 149+ with WebMCP enabled or ChatGPT browser environment.
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
