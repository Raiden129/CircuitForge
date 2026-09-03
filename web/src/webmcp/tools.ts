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
    },
    required: [],
  },
  execute: async (input: { pin_id?: string; name?: string; value?: number }, { signal }) => {
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
