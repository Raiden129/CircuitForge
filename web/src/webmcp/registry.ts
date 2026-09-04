export interface WebMCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: any, context: { signal: AbortSignal }) => Promise<any>;
  readOnlyHint?: boolean;
}

export type ToolExecutionListener = (
  event: 'start' | 'end',
  data: {
    toolName: string;
    input: any;
    result?: any;
    error?: any;
  }
) => void;

export class ToolRegistry {
  private registeredTools = new Map<string, { def: WebMCPToolDefinition; controller: AbortController }>();
  private supported = false;
  private listeners: ToolExecutionListener[] = [];

  constructor() {
    this.supported = typeof (document as any).modelContext !== 'undefined';
  }

  public isSupported(): boolean {
    return this.supported;
  }

  public onExecution(listener: ToolExecutionListener) {
    this.listeners.push(listener);
  }

  private notify(event: 'start' | 'end', data: { toolName: string; input: any; result?: any; error?: any }) {
    for (const l of this.listeners) {
      try {
        l(event, data);
      } catch (err) {
        console.error('[ToolRegistry] Listener error:', err);
      }
    }
  }

  public async register(toolDef: WebMCPToolDefinition): Promise<boolean> {
    if (!this.supported) {
      console.warn(`WebMCP not available in this browser. Skipping registration of: ${toolDef.name}`);
      return false;
    }

    if (this.registeredTools.has(toolDef.name)) {
      await this.deregister(toolDef.name);
    }

    const controller = new AbortController();

    try {
      const modelContext = (document as any).modelContext;
      await modelContext.registerTool(
        {
          name: toolDef.name,
          description: toolDef.description,
          inputSchema: toolDef.inputSchema,
          execute: async (input: any, ctx: { signal?: AbortSignal }) => {
            let parsedInput = input;
            if (typeof input === 'string') {
              try {
                parsedInput = JSON.parse(input || '{}');
              } catch {
                parsedInput = input;
              }
            }
            parsedInput = parsedInput ?? {};

            this.notify('start', { toolName: toolDef.name, input: parsedInput });
            try {
              const res = await toolDef.execute(parsedInput, { signal: ctx?.signal || controller.signal });
              this.notify('end', { toolName: toolDef.name, input: parsedInput, result: res });
              return res;
            } catch (err) {
              this.notify('end', { toolName: toolDef.name, input: parsedInput, error: err });
              throw err;
            }
          },
        },
        { signal: controller.signal }
      );

      this.registeredTools.set(toolDef.name, { def: toolDef, controller });
      console.log(`[WebMCP] Registered tool: ${toolDef.name}`);
      return true;
    } catch (err) {
      console.error(`[WebMCP] Failed to register tool ${toolDef.name}:`, err);
      return false;
    }
  }

  public async deregister(name: string): Promise<boolean> {
    const entry = this.registeredTools.get(name);
    if (!entry) return false;

    entry.controller.abort();
    this.registeredTools.delete(name);
    console.log(`[WebMCP] Deregistered tool: ${name}`);
    return true;
  }

  public getActiveTools(): string[] {
    return Array.from(this.registeredTools.keys());
  }
}

export const toolRegistry = new ToolRegistry();
