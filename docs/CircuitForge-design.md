# CircuitForge — Agent-Native Digital Logic Studio

**Design and implementation specification**  
**Status:** build-ready v1  
**Target:** The WebMCP Challenge  
**Primary source base:** Sebastian Lague's *Digital Logic Sim* (MIT licensed; retain its copyright and license notice)

## 1. Product definition

CircuitForge is a browser-based digital logic studio where a person and an AI agent share one editable, running circuit. It is fully useful as a conventional visual simulator: learners can place components, wire pins, toggle inputs, run clocks, inspect signals, save work, and build their own circuits with mouse and keyboard controls.

WebMCP adds a first-class second interface. An agent can inspect the actual circuit state, make validated edits, simulate, test, diagnose, and explain its decisions through structured tools. It never infers state from pixels or pretends it changed the canvas: every action is a command against the simulator model and every result includes the new circuit revision and observable feedback.

**One-sentence pitch:** CircuitForge lets humans build digital circuits visually while agents build, test, and teach through the same precise control surface.

### 1.1 The user problem

Digital-logic learners often get stuck between a symbolic exercise and a working circuit. A simulator can show outputs, but it does not explain a failed connection, construct a test matrix, or collaborate on an idea. Generic chat assistants can explain a half-adder, but cannot reliably inspect and change the learner's real circuit.

CircuitForge closes that gap. The learner remains in control of the visual workspace; the agent has enough structured access to be a useful lab partner rather than a spectator or a UI macro.

### 1.2 What makes it a WebMCP project

- The WebMCP interface is a complete, typed control plane over a live circuit model: discovery, construction, editing, simulation, verification, and teaching.
- Tools are registered only when their capability is available and are deregistered when it is not. The browser's `toolchange` lifecycle tells the agent that its available surface changed.
- Tool calls return compact, factual state from the simulator—component IDs, pins, values, validation errors, revision numbers, and suggested safe next actions.
- The human UI and agent tools call the same command layer. A user can draw a wire, then an agent can inspect or extend it; an agent can add a gate, then the user can drag, rewire, or delete it.

### 1.3 Primary users and jobs

| User | Job to be done | Example success moment |
| --- | --- | --- |
| Beginner learner | Turn a truth table into a circuit and understand each signal path. | “Build a 2-bit adder with me; stop after each stage and explain it.” |
| CS / electronics student | Debug an incorrect or incomplete design. | “Why is carry never high? Run the four input cases and show the broken connection.” |
| Curious builder | Experiment freely with gates, clocks, buses, and custom chips. | “Make a register, then let me change the design manually.” |
| Judge | Validate that the product is a useful app and that WebMCP materially improves it. | Build a circuit by hand, then ask the browser agent to inspect, finish, test, and explain it. |

### 1.4 Product principles

1. **The canvas is the source of truth.** Agent output must describe the current model, not an imagined circuit.
2. **The agent is capable but bounded.** It has extensive semantic control, but every mutation is schema-validated, revision-checked, visible in the activity log, and undoable.
3. **Useful without AI.** If WebMCP is unavailable, the simulator, lessons, save/load, and manual test features still work.
4. **Teach through evidence.** Explanations cite a component, pin, signal transition, or test result from the active circuit.
5. **Progressive disclosure.** The active tool set stays relevant to the current workspace/mode, without withholding any supported circuit capability.

## 2. Scope

### 2.1 V1 that must ship

- An editable digital-logic canvas using the existing simulator as its engine and renderer.
- Built-in gates, input/output pins, LEDs/displays, clocks, and saved/custom chips already supported by the source project.
- A browser-safe simulation driver: run, pause, single-step, reset, clock configuration, and signal inspection.
- Local project save/load and JSON import/export.
- A visible WebMCP status panel and agent-activity timeline.
- Full V1 WebMCP tool bundles described in section 5.
- Three polished sample workspaces: a half-adder, a full-adder, and a small sequential circuit such as a register or counter. They are examples and teaching material—not the product's limit.
- A guided “challenge mode” that gives a goal and validates the learner's actual circuit using truth tables.

### 2.2 Explicit non-goals for the challenge build

- Cloud accounts, real-time multi-user networking, and server-side agent orchestration.
- Arbitrary HDL import/export, SPICE/analogue simulation, FPGA synthesis, or a mobile-native build.
- Exposing raw Unity object methods or mouse-coordinate automation as WebMCP tools.
- A tool that accepts arbitrary code or agent-written scripts to execute inside the simulator.

## 3. The judge-ready experience

1. Open CircuitForge in a WebMCP-capable browser. The canvas works immediately, with an empty workspace, component library, simulator controls, and starter projects.
2. Build or open any circuit manually. Toggle inputs and inspect values without invoking an agent.
3. Ask the browser agent: “Inspect this circuit, tell me what it does, and make it into a full adder.”
4. The agent calls read tools, obtains the exact component and pin identifiers, then creates/places components and connections with write tools. Each action appears in the activity timeline and on the canvas.
5. The agent runs a complete test matrix, returns failures or passing output, and explains the result using the real circuit IDs and signals.
6. The judge manually changes a wire or gate. The agent re-inspects the changed revision, finds the issue, repairs it if asked, and validates again.

This demonstrates general-purpose construction and diagnosis, while still telling a clean three-minute story: **human creates → agent understands → both extend → agent verifies → human stays in control**.

## 4. Technical architecture

### 4.1 Stack

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Simulator and canvas | **Unity 6.0**, existing Digital Logic Sim source, C# | Circuit model, rendering, manual interactions, simulation, persistence adapters. |
| Browser build | **Unity WebGL / IL2CPP / WebAssembly** | Runs the simulator in the deployed browser application. |
| Web host and bridge | **TypeScript 5.x**, native ES modules, Vite 7 | Loads Unity, feature-detects WebMCP, registers tools, validates bridge messages, resolves tool promises, hosts the activity panel. |
| Runtime schemas | **Zod** | Single source for JavaScript-side tool inputs, bridge requests, responses, and error envelopes. |
| Tests | Unity Test Framework, Vitest, Playwright | Model/command tests, registry tests, and a real browser WebMCP smoke test. |
| Deployment | Cloudflare Pages | Static HTTPS hosting for the Unity WebGL build and TypeScript shell. |

Use a thin TypeScript host rather than React. The application is overwhelmingly a Unity canvas, so React would add another UI state system without solving the integration problem. Native DOM components keep the host small, fast, and easy to bridge. Vite is a build and local-development tool; it is not a runtime dependency.

### 4.2 Repository layout

```text
CircuitMCP/
├── Digital-Logic-Sim-src/                 # Upstream-derived Unity project
│   ├── Assets/CircuitForge/
│   │   ├── Bridge/                         # WebMCP command bridge and JS callbacks
│   │   ├── Commands/                       # Typed, model-level circuit commands
│   │   ├── Queries/                        # Snapshots, analyses, truth-table checks
│   │   ├── Simulation/                     # WebGL main-thread simulation driver
│   │   ├── Learning/                       # Lessons/challenge validation
│   │   └── Tests/
│   └── WebGLTemplates/CircuitForge/        # Unity loader template hooks
├── web/
│   ├── src/
│   │   ├── main.ts                         # Unity loader + app-shell boot
│   │   ├── webmcp/registry.ts               # Dynamic registration and deregistration
│   │   ├── webmcp/tools.ts                  # Tool schemas and implementations
│   │   ├── bridge/unity-bridge.ts           # Promise/callback request transport
│   │   ├── bridge/contracts.ts              # Zod schemas shared by host code
│   │   └── ui/                              # Status, activity, and fallback UI
│   ├── public/unity/                        # Unity WebGL build output (generated)
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── architecture.md
│   ├── tool-contract.md
│   ├── security.md
│   └── UPSTREAM.md
├── LICENSE                                 # Preserve upstream MIT notice
└── README.md
```

### 4.3 Why WASM is the right reuse path

The existing project is a Unity 6 C# simulator. Exporting it as Unity WebGL preserves its mature circuit model, visual editor, simulation behavior, built-in chips, save format, and input interactions. Rewriting the logic in JavaScript would consume challenge time and add parity bugs exactly where judges need the product to be reliable.

WASM is not the WebMCP layer. The Unity build owns the simulator; the host document owns WebMCP because `document.modelContext` is a browser JavaScript API. The two communicate through a narrow, typed bridge. This cleanly separates browser-agent integration from simulation correctness.

### 4.4 Unity WebGL constraint and required adaptation

The upstream project starts a dedicated C# `Thread` for the simulation loop. That cannot remain the browser implementation: Unity's current WebGL threading support does not make C# multithreading available. The project also currently has WebGL thread support disabled.

Implement `WebGlSimulationDriver`:

1. Extract one simulation iteration from `Project.SimThread()` into a shared `RunOneSimulationTick()` method.
2. On desktop/editor, retain the existing background-thread driver.
3. Under `UNITY_WEBGL && !UNITY_EDITOR`, do **not** call `StartSimulation()` to create a `Thread`.
4. In `Update()`, use an elapsed-time accumulator and invoke `RunOneSimulationTick()` at `targetTicksPerSecond`, with a strict maximum catch-up count per frame.
5. Apply queued commands before the tick and update visible pin/display state immediately after it.
6. Keep `pause`, `step`, and `reset` deterministic. A `step` tool performs exactly the requested number of ticks and returns the resulting revision/signal state.

Do not enable WebGL threading as a shortcut. It increases hosting requirements and still does not make the existing C# loop viable. A main-thread fixed-step driver is simpler, testable, and sufficient for the educational circuits in V1.

### 4.5 Browser ↔ Unity bridge

The Unity build is embedded in the same top-level document, not a cross-origin iframe. This lets the host document register WebMCP tools while Unity owns the canvas.

```text
Browser agent
  │ calls WebMCP tool
  ▼
TypeScript ToolRegistry
  │ validates Zod schema, attaches requestId + expectedRevision
  ▼
UnityBridge.send(command JSON)
  │ Unity instance.SendMessage("CircuitForgeBridge", "Receive", json)
  ▼
C# CircuitCommandDispatcher (Unity main thread)
  │ validates, mutates/queries model, emits snapshot delta
  ▼
window.CircuitForgeBridge.resolve(requestId, response JSON)
  │ resolves original tool Promise
  ▼
Browser agent receives structured result
```

**Bridge rules**

- Every request has a UUID `requestId`, `expectedRevision`, command name, and typed payload.
- Unity owns ordering. A command queue is drained at a safe point at the start of `Update()`.
- Each successful mutation increments `circuitRevision` exactly once.
- The host rejects stale revisions before dispatch when possible; Unity repeats the check authoritatively.
- An aborted WebMCP call is removed from the host pending map if it has not yet been sent. If already applied, the result is recorded in the visible activity history but is not retroactively rolled back.
- A 10-second command timeout returns a structured `TIMEOUT` error and leaves the canvas usable.
- The bridge never evaluates JavaScript or accepts arbitrary C# method names from an agent.

### 4.6 Circuit command layer

Create `CircuitCommandService` as a public C# façade over the existing simulator model. Both the manual UI and WebMCP dispatcher must use it for mutations that they share.

The façade owns semantic operations such as `AddComponent`, `MoveComponent`, `ConnectPins`, `DisconnectWire`, `SetInput`, `ConfigureComponent`, `DeleteComponent`, `ResetWorkspace`, and `RunTicks`. It should create `SubChipInstance` and `WireInstance` objects directly, update `DevChipInstance`, rebuild/patch simulation state through existing `Simulator` APIs, and record an undo entry. It must not synthesize mouse clicks or depend on screen coordinates.

Provide deterministic auto-layout for agent-added items when no position is supplied. Positions are an optional visual preference; component and pin IDs are the identity used by tools.

## 5. WebMCP tool system

### 5.1 Registry lifecycle

`ToolRegistry` owns one `AbortController` per registered tool. It calls `document.modelContext.registerTool()` after Unity has sent its initial capability snapshot. To deregister a tool, it aborts that tool's controller and updates the local registry state. It never assumes a registration resolves in a particular order; it waits for registration promises and serializes registry updates.

Tool bundles change with workspace state:

| Bundle | Registered when | Tools |
| --- | --- | --- |
| `inspect` | Unity canvas is ready | catalog, snapshot, component inspection, signal inspection, analysis |
| `edit` | An editable workspace is open | create, add, move, connect, disconnect, configure, delete, undo/redo, import/export |
| `simulate` | A runnable circuit is loaded | run, pause, step, set input, set clock, get trace, verify truth table |
| `learn` | A lesson/challenge is selected | get objective, create exercise, evaluate, explain signal path |

If the user opens a read-only example, `edit` is removed. If there is no circuit, `simulate` is removed. The agent can always call `circuit.get_capabilities` to receive the current bundles, constraints, and circuit revision. This provides dynamic registration/deregistration without hiding supported features.

### 5.2 Tool conventions

All tool names are action-oriented, under 30 characters, and descriptions are concise. Read tools include `annotations: { readOnlyHint: true }`; mutation tools intentionally omit that hint. Tool responses target a compact summary plus identifiers and state needed for the next call.

Every mutation accepts:

```json
{
  "expected_revision": 17,
  "request_id": "client-generated-uuid",
  "payload": {}
}
```

Every tool returns the same envelope:

```json
{
  "ok": true,
  "circuit_revision": 18,
  "summary": "Connected xor_1.out to sum_led.in.",
  "data": {},
  "warnings": [],
  "next_actions": ["circuit.run", "circuit.verify_truth_table"]
}
```

Failures are data, not prose exceptions:

```json
{
  "ok": false,
  "error": {
    "code": "PIN_WIDTH_MISMATCH",
    "message": "Cannot connect 1-bit xor_1.out to 8-bit display_1.input.",
    "details": { "source_bits": 1, "target_bits": 8 }
  },
  "circuit_revision": 18,
  "recovery": "Use a 1-bit LED or a compatible bus component."
}
```

### 5.3 Tool catalogue

#### Inspection bundle

| Tool | Input | Result |
| --- | --- | --- |
| `circuit.get_capabilities` | none | Active bundles, available tools, editability, revision, simulator status. |
| `circuit.list_catalog` | optional category/search | Built-in and custom component types, pin schemas, defaults, constraints. |
| `circuit.get_snapshot` | detail: `summary` \| `full` | Component graph, connections, IO values, simulation status, revision. |
| `circuit.inspect_component` | `component_id` | Type, label, config, pins, current values, connected wires. |
| `circuit.inspect_signal` | one or more `pin_ref`s | Current logic values, drivers, receivers, width, conflict state. |
| `circuit.analyze` | scope, goal optional | Reachability, floating inputs, unconnected outputs, loops, bit-width issues, and a concise explanation. |

#### Edit bundle

| Tool | Required semantic inputs | Result |
| --- | --- | --- |
| `circuit.create_workspace` | name, optional template | New blank or template workspace with root chip ID. |
| `circuit.add_component` | `type`, `component_id`, optional label/position/config | Creates a component and returns all pin refs. |
| `circuit.move_component` | `component_id`, grid position | Moves the visual component without changing electrical connectivity. |
| `circuit.connect` | source `pin_ref`, target `pin_ref`, optional wire style | Validates direction, width, and topology; adds one wire. |
| `circuit.disconnect` | `wire_id` | Removes one connection and returns affected pins. |
| `circuit.configure_component` | `component_id`, permitted config patch | Changes supported settings such as clock rate, ROM data, labels, or display configuration. |
| `circuit.delete_component` | `component_id` | Deletes component plus dependent wires, with a clear affected list. |
| `circuit.undo` / `circuit.redo` | optional count | Replays command history with new revision feedback. |
| `circuit.export` / `circuit.import` | format / validated project JSON | Produces or loads a portable circuit definition; import is size-limited and schema-validated. |

#### Simulation bundle

| Tool | Required semantic inputs | Result |
| --- | --- | --- |
| `circuit.set_input` | input pin ref, value | Sets a boolean/bus input, confirms displayed and simulated value. |
| `circuit.set_clock` | clock component ID, enabled/rate | Updates clock behavior and acknowledges timing configuration. |
| `circuit.run` | optional tick count / until condition | Runs bounded ticks and reports outputs/performance; never runs indefinitely. |
| `circuit.pause` | none | Pauses continuous simulation. |
| `circuit.step` | positive tick count | Executes an exact number of ticks and returns changed signals. |
| `circuit.get_trace` | pins, bounded sample count | Returns a compact waveform/sample sequence. |
| `circuit.verify_truth_table` | input refs, output refs, expected rows | Runs all requested rows, returns pass/fail results and first mismatch. |

#### Learning bundle

| Tool | Required semantic inputs | Result |
| --- | --- | --- |
| `lesson.get_objective` | none | Goal, permitted components, success criteria, hints already used. |
| `lesson.create_exercise` | difficulty, concept, optional target | Creates a locally stored challenge from a safe template set. |
| `lesson.evaluate` | optional rubric | Tests the active circuit against the selected objective. |
| `lesson.explain_signal_path` | source and target pin refs | Evidence-based path explanation from the current graph and signal state. |

### 5.4 Guardrails and feedback quality

- `component_id`, `wire_id`, and `pin_ref` are stable opaque IDs, never display labels or DOM selectors.
- Pin references use `{ component_id, pin_id }`; every catalog/snapshot response supplies them.
- `connect` rejects invalid directions, incompatible bit widths, duplicate wires, self-links, and unsupported combinational loops. Sequential components remain permitted.
- All mutating commands appear in the in-app activity timeline with actor (`human` or `agent`), timestamp, summary, before/after revision, and undo availability.
- The command service returns change deltas. `get_snapshot(detail: "full")` is available when an agent needs resynchronization.
- No tool uses external web content, user secrets, or untrusted text. If future versions add shared projects or user annotations, corresponding result tools set `untrustedContentHint: true`.

## 6. Human experience and interface

### 6.1 Layout

- **Top bar:** project name, save state, WebMCP availability, undo/redo, share/export.
- **Left library:** searchable components, custom chips, starter projects, and lesson selector.
- **Center canvas:** Unity circuit workspace with pan, zoom, selection, wiring, and live signal visualisation.
- **Right inspector:** selected component/pin details, configuration controls, current signal values, and validation messages.
- **Bottom simulator strip:** run/pause, single-step, tick-rate control, input toggles, waveform/trace view.
- **Agent activity rail:** tool availability, last calls, applied mutations, errors, and “follow along” explanations. This is a transparency surface, not a chat replacement.

### 6.2 Manual-first and agent-assisted workflows

The same outcomes must be reachable manually. For example, a learner can drag XOR and AND gates, wire them, set inputs, and use the truth-table validator without any agent. When an agent is available, it can perform the same actions faster, explain them, and react to changes.

The app does not need an embedded LLM chat box. The browser agent is the conversational interface; CircuitForge supplies observable state, affordances, status, and contextual instructional text. This keeps WebMCP central and makes the product useful in the challenge's supported browsers.

## 7. Implementation detail

### 7.1 JavaScript packages and scripts

Create `web/package.json` with the following dependencies. Pin exact versions only when the project is initialized; do not write an aspirational lockfile by hand.

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

No third-party WebMCP wrapper is required. Use the browser API directly so the implementation follows the current challenge API and can feature-detect it accurately.

### 7.2 TypeScript contracts

```ts
export const PinRef = z.object({
  component_id: z.string().min(1),
  pin_id: z.string().min(1),
});

export const MutationMeta = z.object({
  request_id: z.string().uuid(),
  expected_revision: z.number().int().nonnegative(),
});

export const BridgeRequest = z.object({
  request_id: z.string().uuid(),
  command: z.string(),
  expected_revision: z.number().int().nonnegative().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const BridgeResponse = z.object({
  request_id: z.string().uuid(),
  ok: z.boolean(),
  circuit_revision: z.number().int().nonnegative(),
  summary: z.string().max(1200),
  data: z.record(z.string(), z.unknown()).default({}),
  warnings: z.array(z.string()).default([]),
  error: z.object({
    code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()).optional()
  }).optional(),
});
```

Each `registerTool` implementation follows this shape:

```ts
await document.modelContext.registerTool({
  name: "circuit_connect",
  description: "Connect one output pin to one compatible input pin in the active circuit.",
  inputSchema: ConnectInputSchema,
  execute: async (input, { signal }) => {
    const validated = ConnectInputSchema.parse(input);
    return unityBridge.send("connect", validated, signal);
  },
});
```

If `document.modelContext` is unavailable, render a non-blocking status: “Agent tools are unavailable in this browser; CircuitForge remains fully usable manually.” Do not polyfill, imitate, or expose an HTTP endpoint as a substitute for WebMCP.

### 7.3 C# bridge contracts

Add a dedicated GameObject named `CircuitForgeBridge` in the boot scene.

```csharp
public sealed class CircuitForgeBridge : MonoBehaviour
{
    public void Receive(string requestJson)
    {
        // Parse bounded JSON into BridgeRequest.
        // Queue it; do not mutate Unity state inside the browser callback.
    }

    private void Update()
    {
        // Drain in order. CircuitCommandService executes on Unity's main thread.
        // Serialize BridgeResponse and invoke JS resolver.
    }
}
```

For browser builds, call a `.jslib` function:

```csharp
[DllImport("__Internal")]
private static extern void CircuitForgeResolve(string requestId, string responseJson);
```

The `.jslib` implementation calls `window.CircuitForgeBridge.resolve(requestId, responseJson)`. In editor/desktop builds, use a stub that logs or routes responses to test hooks. Keep JSON payloads bounded; snapshots larger than the tool-output budget are compacted to summary/delta form and retrievable by targeted inspection tools.

### 7.4 State model

The command service maintains:

```text
Workspace
├── revision: integer
├── root_chip
├── components: Map<ComponentId, Component>
├── wires: Map<WireId, Wire>
├── simulation: { mode, tick, tick_rate, paused }
├── history: undo/redo command stacks
├── lesson: optional local objective
└── activity: bounded human/agent audit timeline
```

The Unity `DevChipInstance` and `SimChip` remain the underlying model. `WorkspaceSnapshotBuilder` maps them to serializable records; it must never expose Unity object references. A snapshot contains component/pin IDs, names/types, positions, config safe for display, connections, and signal values. It intentionally excludes arbitrary project filesystem paths.

### 7.5 Agent command semantics

- **Add:** Resolve a catalogue type, assign or reject duplicate component ID, create a `SubChipInstance`, add it to the active `DevChipInstance`, update the simulator, and return pins.
- **Connect:** Resolve pins by stable IDs, validate source/target and width, construct a direct `WireInstance`, add it through the model API, update simulation, and return wire ID.
- **Delete:** Remove the component and dependent wires atomically; return all deleted IDs so the agent can update its plan.
- **Configure:** Permit only a typed allow-list per component type. ROM contents, clock rate, labels, key binding, and display settings each have explicit schema limits.
- **Run and step:** Execute via the main-thread driver, never a blocking while loop. Enforce maximum ticks and output sample counts.
- **Verify:** Apply requested input rows in a deterministic order, record output rows, restore the original input state, and return a pass/fail matrix.

### 7.6 Local persistence

- Keep the simulator's existing project format as the native editable format.
- Add a CircuitForge JSON export with `format_version`, workspace metadata, graph, component configurations, and lesson state.
- Store local projects in browser IndexedDB for WebGL builds, using a thin Unity-to-JavaScript persistence adapter. Offer explicit JSON download/upload as recovery and sharing paths.
- Autosave after a debounced successful mutation; show last-saved state in the top bar.
- Treat imported JSON as untrusted: strict schema validation, maximum file size, maximum component/wire count, no embedded code, and explicit user confirmation before replacing the active workspace.

## 8. Delivery plan

### Milestone 0 — prove the risky path first (2–3 hours)

1. Open the Unity project in Unity 6 and create a WebGL build.
2. Replace the thread startup path with a single main-thread test tick.
3. Serve the build over local HTTPS/compatible development hosting.
4. Confirm the full canvas loads in ChatGPT's in-app browser or Chrome with WebMCP enabled.
5. Register one read tool (`circuit_get_snapshot`) from the page and successfully call it from a browser agent.

**Exit criterion:** a real agent receives circuit state from the running Unity build. If this fails, stop expanding features and fix the bridge/build path.

### Milestone 1 — standalone app quality (4–6 hours)

1. Stabilize WebGL main-thread simulation.
2. Ensure manual place/connect/delete, run/pause/step, signal visibility, and save/load work in the browser.
3. Add the native workspace snapshot builder and activity timeline.
4. Add three starter projects and a manual truth-table validator.

**Exit criterion:** a judge can build and test a basic circuit entirely without an agent.

### Milestone 2 — semantic command API (5–8 hours)

1. Build C# command/query façade and revision handling.
2. Implement add, connect, disconnect, set input, step, snapshot, inspect component, and analyze.
3. Test errors: stale revision, invalid pin direction, incompatible width, duplicate component ID, missing target.
4. Connect all commands to the UI activity/undo system.

**Exit criterion:** scripts/test hooks can build an arbitrary small combinational circuit without pointer simulation.

### Milestone 3 — complete WebMCP integration (4–6 hours)

1. Implement TypeScript `ToolRegistry`, bridge promises, Zod contracts, and fallback UI.
2. Register inspection tools first; then edit/simulation/learning bundles.
3. Implement lifecycle-driven deregistration with `AbortController` and a `toolchange` diagnostic view.
4. Verify one general-purpose workflow: start blank → agent creates circuit → user edits → agent diagnoses → agent verifies.

**Exit criterion:** each agent action visibly changes the same canvas and every returned result matches the live revision.

### Milestone 4 — polish and submit (3–5 hours)

1. Improve empty states, loading/error states, tool-call summaries, and explanation wording.
2. Add README, architecture diagram, `UPSTREAM.md`, visible MIT licence, test instructions, and public deployment.
3. Record the three-minute video: problem, manual app, agent construction, human correction, verification, teaching outcome.
4. Freeze the deployed build, repo, video, and Devpost description before the deadline.

## 9. Quality, security, and verification

### 9.1 Automated tests

| Layer | What to test |
| --- | --- |
| Unity command service | Add/connect/disconnect/delete; model invariants; revision increments; undo/redo; truth-table evaluation; desktop and WebGL driver behavior. |
| Unity snapshot builder | Stable IDs, no Unity object leakage, bounded snapshot output, correct signal values. |
| TypeScript bridge | Request correlation, timeout, abort-before-send, invalid response rejection, stale response handling. |
| Tool registry | Correct registration bundles, deregistration on mode change, no duplicate names, read-only annotations. |
| Playwright browser test | Unity loads, WebMCP API is feature-detected, a registered tool is visible, tool call creates a visible component, response revision matches UI revision. |
| Manual judge rehearsal | Build manually; create a new circuit with an agent; manually introduce an error; have the agent find and repair it; test fallback with WebMCP unavailable. |

### 9.2 Performance limits

- Target a responsive canvas at 60 FPS for starter circuits and a stable fixed simulation rate for teaching circuits.
- Limit WebMCP mutation batches to one semantic operation per call in V1. This keeps error recovery clear and timeline entries understandable.
- Cap `run` and `step` calls, snapshot sizes, trace sample counts, import size, component count, and wire count. Return an actionable `LIMIT_EXCEEDED` response rather than freezing the app.
- Avoid WebGL C# threads, busy waits, and unbounded synchronous loops.
- Build with a public, HTTPS origin. Test the actual production deployment, not only localhost.

### 9.3 Security and trust boundaries

- Agent tool descriptions and output are part of the security boundary. Keep tool descriptions factual and short; do not interpolate user-provided labels into tool definitions.
- The tool set is same-origin by default. Do not add `exposedTo` unless there is a concrete trusted embedding partner.
- Mutation tools only operate on the in-memory/local workspace. They cannot upload files, call external APIs, use credentials, or navigate the browser.
- Validate all inputs in TypeScript and C#. The Unity side is authoritative.
- Clearly label agent-originated edits in the activity timeline. The user retains undo/redo and manual control.
- Use `readOnlyHint` for read tools. For future tools that return imported/shared user content, use `untrustedContentHint`.

## 10. Deployment and submission materials

### 10.1 Cloudflare Pages configuration

1. Build TypeScript host assets with `npm run build`.
2. Build Unity WebGL into `web/public/unity/` or copy the generated output there during the deployment build.
3. Deploy the generated `web/dist/` directory to Cloudflare Pages.
4. Confirm correct `.wasm`, `.data`, `.js`, and compression asset delivery on the final HTTPS URL.
5. Keep the Unity canvas in the top-level app document; do not move it behind a cross-origin iframe.
6. Test final URL in ChatGPT's in-app browser and Chrome with WebMCP enabled.

### 10.2 Public repository checklist

- Public repository with a visible open-source `LICENSE` file.
- `UPSTREAM.md` naming Sebastian Lague's project, commit/source reference, MIT licence, and exactly which CircuitForge changes were added.
- Dated commits separating upstream import, WebGL compatibility work, command façade, WebMCP bridge, UI, tests, and docs.
- README with one-command local web host instructions, Unity version, browser prerequisites, WebMCP test workflow, and manual fallback workflow.
- A `docs/tool-contract.md` generated from the implemented schemas so tool descriptions and source remain aligned.
- Credits in the app's About panel and README. Do not imply the original simulator was written for CircuitForge.

### 10.3 Devpost write-up outline

**Tagline:** Build circuits by hand. Let agents build, test, and teach alongside you.

**Description structure:**

1. The learning/debugging gap CircuitForge solves.
2. How the visual simulator works without AI.
3. How WebMCP tools provide structured circuit discovery, mutation, simulation, verification, and explanation.
4. Why a shared command layer prevents DOM scraping and keeps agent feedback grounded in live state.
5. The WebGL/WASM adaptation and main-thread simulation solution.
6. The starter projects and a demonstration of a user-agent collaboration loop.

**Demo video beats (under three minutes):**

1. Show blank/manual workspace and a hand-built connection.
2. Ask the browser agent to inspect and extend a non-example circuit.
3. Show tool calls and the canvas changing together.
4. Manually break a connection; let the agent analyze and repair it.
5. Run truth-table validation and show a concise explanation tied to real pins/signals.
6. Close with the manual fallback and project links.

## 11. Acceptance criteria

The project is ready to submit only when all statements are true:

- [ ] The live HTTPS URL opens and functions in a supported WebMCP browser.
- [ ] A person can create, wire, simulate, save, load, and validate a circuit without an agent.
- [ ] `document.modelContext.registerTool` is used by the deployed top-level document, with visible feature detection/fallback.
- [ ] At least one complete agent workflow begins from an arbitrary blank or user-edited circuit—not only a bundled example.
- [ ] The agent can read state, add components, connect/disconnect, set inputs, simulate, inspect signals, diagnose, and verify a truth table through typed tools.
- [ ] Tool availability changes correctly through registration/deregistration as workspace capabilities change.
- [ ] Every agent mutation is visible, revisioned, undoable, and correctly reflected in the following snapshot.
- [ ] WebGL uses the main-thread simulation driver and never attempts the upstream C# simulation thread.
- [ ] Invalid requests yield clear structured errors and do not corrupt the workspace.
- [ ] The repo is public, includes the upstream MIT licence/attribution, and documents all challenge-period work.
- [ ] A public YouTube demo under three minutes has audio, shows the app functioning, and explicitly demonstrates WebMCP use.

## 12. Decisions log

| Decision | Rationale |
| --- | --- |
| Reuse Unity source through WebGL/WASM | Preserves a sophisticated simulator and avoids a risky rewrite. |
| TypeScript host, not React | The Unity canvas is the primary UI; a thin host minimizes duplicate state and integration complexity. |
| WebMCP in browser host, not Unity | `document.modelContext` is a JavaScript browser API. Unity is reached through a typed same-document bridge. |
| Main-thread WebGL simulation | Unity WebGL does not make the existing C# thread loop usable; fixed-step main-thread execution is safer. |
| Extensive semantic tool surface | Gives agents real, general-purpose circuit control and makes the WebMCP value visible to judges. |
| Dynamic tool bundles | Keeps tools accurate to app state while preserving full capability when an editable/runnable workspace exists. |
| Samples plus arbitrary workspaces | Samples teach and demo; general editing proves the product is not a single hard-coded exercise. |

## 13. Reference material

- WebMCP specification: <https://webmachinelearning.github.io/webmcp/>
- Chrome WebMCP imperative API: <https://developer.chrome.com/docs/ai/webmcp/imperative-api>
- Chrome WebMCP tool security guidance: <https://developer.chrome.com/docs/ai/webmcp/secure-tools>
- Unity 6 WebGL thread support: <https://docs.unity3d.com/6000.0/ScriptReference/PlayerSettings.WebGL-threadsSupport.html>
- Upstream simulator licence: `Digital-Logic-Sim-src/LICENSE`
