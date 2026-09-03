import { z } from 'zod';

export const PinRef = z.object({
  component_id: z.string().min(1),
  pin_id: z.string().min(1),
});

export const BridgeRequest = z.object({
  request_id: z.string().uuid(),
  command: z.string(),
  expected_revision: z.number().int().nonnegative().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const BridgeResponse = z.object({
  request_id: z.string().uuid(),
  ok: z.boolean(),
  circuit_revision: z.number().int().nonnegative(),
  summary: z.string().max(1200),
  data: z.record(z.string(), z.unknown()).default({}),
  warnings: z.array(z.string()).default([]),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }).nullable().optional(),
  recovery: z.string().nullable().optional(),
  next_actions: z.array(z.string()).default([]),
});

export type PinRefType = z.infer<typeof PinRef>;
export type BridgeRequestType = z.infer<typeof BridgeRequest>;
export type BridgeResponseType = z.infer<typeof BridgeResponse>;
