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
