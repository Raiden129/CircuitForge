import { unityBridge } from '../bridge/unity-bridge';
import type { WebMCPToolDefinition } from './registry';

export const circuitGetSnapshotTool: WebMCPToolDefinition = {
  name: 'circuit_get_snapshot',
  description: 'Retrieve the active circuit state: components, pin IDs, logic signals, simulation status, and revision.',
  readOnlyHint: true,
  inputSchema: {
    type: 'object',
    properties: {
      detail: {
        type: 'string',
        enum: ['summary', 'full'],
        description: 'Detail level of snapshot: summary (compact) or full (all pins and wire paths).',
        default: 'summary',
      },
    },
  },
  execute: async (input: { detail?: 'summary' | 'full' } = {}, { signal }) => {
    return unityBridge.send('get_snapshot', input, signal);
  },
};

export const circuitGetCapabilitiesTool: WebMCPToolDefinition = {
  name: 'circuit_get_capabilities',
  description: 'Inspect currently active WebMCP bundles, simulation mode, and current circuit revision.',
  readOnlyHint: true,
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, { signal }) => {
    return unityBridge.send('get_capabilities', {}, signal);
  },
};

export const circuitListCatalogTool: WebMCPToolDefinition = {
  name: 'circuit_list_catalog',
  description: 'List all available built-in logic components, custom chips, and pin layouts.',
  readOnlyHint: true,
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, { signal }) => {
    return unityBridge.send('list_catalog', {}, signal);
  },
};

export const circuitSetInputTool: WebMCPToolDefinition = {
  name: 'circuit_set_input',
  description: 'Set logic value (0 or 1) on an input pin by pin_id or name in the active circuit.',
  inputSchema: {
    type: 'object',
    properties: {
      pin_id: {
        type: 'string',
        description: 'Target input pin ID or name.',
      },
      name: {
        type: 'string',
        description: 'Alternative: Target input pin name.',
      },
      value: {
        type: 'number',
        description: 'Logic value to set (0 or 1).',
      },
      expected_revision: {
        type: 'number',
        description: 'Expected circuit revision before mutation.',
      },
    },
    required: [],
  },
  execute: async (input: { pin_id?: string; name?: string; value?: number; expected_revision?: number }, { signal }) => {
    return unityBridge.send('set_input', input, signal);
  },
};

export const circuitStepTool: WebMCPToolDefinition = {
  name: 'circuit_step',
  description: 'Advance the digital logic simulation by an exact number of clock/tick steps.',
  inputSchema: {
    type: 'object',
    properties: {
      steps: {
        type: 'number',
        description: 'Number of simulation ticks to execute (1-100, default 1).',
        default: 1,
      },
    },
  },
  execute: async (input: { steps?: number } = {}, { signal }) => {
    return unityBridge.send('step', input, signal);
  },
};

export const circuitPauseTool: WebMCPToolDefinition = {
  name: 'circuit_pause',
  description: 'Pause continuous simulation.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, { signal }) => {
    return unityBridge.send('pause', {}, signal);
  },
};

export const circuitRunTool: WebMCPToolDefinition = {
  name: 'circuit_run',
  description: 'Resume continuous simulation.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, { signal }) => {
    return unityBridge.send('run', {}, signal);
  },
};

export const circuitAddComponentTool: WebMCPToolDefinition = {
  name: 'circuit_add_component',
  description: 'Programmatically place a logic gate, IC, or IO pin on the active circuit board.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Component type to place (e.g. "AND", "OR", "NAND", "NOT", "XOR", "LED", "IN-1", "OUT-1").',
      },
      x: {
        type: 'number',
        description: 'Optional canvas X coordinate. Auto-layout is applied if omitted.',
      },
      y: {
        type: 'number',
        description: 'Optional canvas Y coordinate. Auto-layout is applied if omitted.',
      },
      label: {
        type: 'string',
        description: 'Optional human-readable label or name for this instance.',
      },
      component_id: {
        type: 'number',
        description: 'Optional specific component ID to assign.',
      },
      expected_revision: {
        type: 'number',
        description: 'Expected circuit revision before mutation.',
      },
    },
    required: ['type'],
  },
  execute: async (input: { type: string; x?: number; y?: number; label?: string; component_id?: number; expected_revision?: number }, { signal }) => {
    return unityBridge.send('add_component', input, signal);
  },
};

export const circuitConnectTool: WebMCPToolDefinition = {
  name: 'circuit_connect',
  description: 'Connect two pins with a wire, with automatic direction and bit-width validation.',
  inputSchema: {
    type: 'object',
    properties: {
      source_pin: {
        description: 'Source pin identifier (e.g. "ownerId:pinId", "NAND:OUT", or DevPin ID/name).',
      },
      target_pin: {
        description: 'Target pin identifier (e.g. "ownerId:pinId", "LED:IN", or DevPin ID/name).',
      },
      expected_revision: {
        type: 'number',
        description: 'Expected circuit revision before mutation.',
      },
    },
    required: ['source_pin', 'target_pin'],
  },
  execute: async (input: { source_pin: any; target_pin: any; expected_revision?: number }, { signal }) => {
    return unityBridge.send('connect', input, signal);
  },
};

export const circuitDisconnectTool: WebMCPToolDefinition = {
  name: 'circuit_disconnect',
  description: 'Remove a wire connection by wire_id or by connected pin pair.',
  inputSchema: {
    type: 'object',
    properties: {
      wire_id: {
        type: 'number',
        description: 'ID of the wire to remove.',
      },
      source_pin: {
        description: 'Alternative: Source pin of the connection to remove.',
      },
      target_pin: {
        description: 'Alternative: Target pin of the connection to remove.',
      },
      expected_revision: {
        type: 'number',
        description: 'Expected circuit revision before mutation.',
      },
    },
  },
  execute: async (input: { wire_id?: number; source_pin?: any; target_pin?: any; expected_revision?: number }, { signal }) => {
    return unityBridge.send('disconnect', input, signal);
  },
};

export const circuitInspectComponentTool: WebMCPToolDefinition = {
  name: 'circuit_inspect_component',
  description: 'Inspect detailed properties of a specific component: type, label, position, all pin signals, and connected wires.',
  readOnlyHint: true,
  inputSchema: {
    type: 'object',
    properties: {
      component_id: {
        description: 'Component ID or name/label to inspect.',
      },
    },
    required: ['component_id'],
  },
  execute: async (input: { component_id: any }, { signal }) => {
    return unityBridge.send('inspect_component', input, signal);
  },
};

export const circuitAnalyzeTool: WebMCPToolDefinition = {
  name: 'circuit_analyze',
  description: 'Perform static and graph analysis: detect floating inputs, unconnected outputs, and structural health.',
  readOnlyHint: true,
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['all', 'floating', 'connectivity'],
        description: 'Analysis scope to perform.',
        default: 'all',
      },
    },
  },
  execute: async (input: { scope?: string } = {}, { signal }) => {
    return unityBridge.send('analyze', input, signal);
  },
};

export const circuitUndoTool: WebMCPToolDefinition = {
  name: 'circuit_undo',
  description: 'Undo the last circuit mutation action.',
  inputSchema: {
    type: 'object',
    properties: {
      expected_revision: {
        type: 'number',
        description: 'Expected circuit revision before undo.',
      },
    },
  },
  execute: async (input: { expected_revision?: number } = {}, { signal }) => {
    return unityBridge.send('undo', input, signal);
  },
};

export const circuitRedoTool: WebMCPToolDefinition = {
  name: 'circuit_redo',
  description: 'Redo the previously undone circuit action.',
  inputSchema: {
    type: 'object',
    properties: {
      expected_revision: {
        type: 'number',
        description: 'Expected circuit revision before redo.',
      },
    },
  },
  execute: async (input: { expected_revision?: number } = {}, { signal }) => {
    return unityBridge.send('redo', input, signal);
  },
};
