import { ActivityTimeline } from '../ui/activity-timeline';

export class AgentRelayClient {
  private ws: WebSocket | null = null;
  private timeline: ActivityTimeline;
  private retryTimer: any = null;

  constructor(timeline: ActivityTimeline) {
    this.timeline = timeline;
  }

  public start() {
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket('ws://127.0.0.1:5174');

      this.ws.onopen = () => {
        console.log('[AgentRelayClient] Connected to local WebMCP Agent Relay');
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'execute_tool') {
            await this.handleToolExecution(msg.id, msg.tool, msg.params);
          }
        } catch (err) {
          console.error('[AgentRelayClient] Error parsing relay message:', err);
        }
      };

      this.ws.onclose = () => {
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        if (this.ws) this.ws.close();
      };
    } catch (_e) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, 3000);
  }

  private async handleToolExecution(id: string, toolName: string, params: any) {
    let result: any = null;

    try {
      if ((document as any).modelContext) {
        const tools = await (document as any).modelContext.getTools();
        const targetTool = tools.find((t: any) => t.name === toolName);

        if (targetTool) {
          const res = await (document as any).modelContext.executeTool(
            targetTool,
            JSON.stringify(params || {})
          );
          result = typeof res === 'string' ? JSON.parse(res) : res;
        } else {
          result = { ok: false, error: 'TOOL_NOT_FOUND', message: `Tool ${toolName} not registered` };
        }
      } else {
        // Fallback when WebMCP is not available
        this.timeline.log({
          actor: 'agent',
          action: toolName,
          summary: `Agent executing ${toolName} (relay fallback)...`,
          revision: (window as any).unityBridge?.getRevision() ?? 0,
          ok: true,
        });
        const cmdName = toolName.replace(/^circuit_/, '');
        result = await (window as any).unityBridge?.send(cmdName, params || {});
        this.timeline.log({
          actor: 'agent',
          action: `${toolName}_DONE`,
          summary: result?.summary || (result?.ok ? 'Tool executed successfully' : (result?.error || 'Failed')),
          revision: result?.circuit_revision ?? (window as any).unityBridge?.getRevision() ?? 0,
          ok: result?.ok ?? false,
        });
      }
    } catch (err: any) {
      result = { ok: false, error: 'EXECUTION_FAILED', message: err?.message || String(err) };
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'tool_result',
        id,
        result
      }));
    }
  }
}
