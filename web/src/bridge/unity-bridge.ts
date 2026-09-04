import { BridgeRequest, BridgeResponse, type BridgeRequestType, type BridgeResponseType } from './contracts';

declare global {
  interface Window {
    unityInstance?: {
      SendMessage: (gameObject: string, method: string, param: string) => void;
    };
    CircuitForgeBridge?: {
      resolve: (requestId: string, responseJson: string) => void;
    };
  }
}

interface PendingRequest {
  resolve: (response: BridgeResponseType) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class UnityBridge {
  private pending = new Map<string, PendingRequest>();
  private currentRevision = 0;
  private isReady = false;
  private revisionListeners: ((rev: number) => void)[] = [];

  constructor() {
    window.CircuitForgeBridge = {
      resolve: (requestId: string, responseJson: string) => {
        this.handleResolve(requestId, responseJson);
      },
    };
  }

  public onRevision(listener: (rev: number) => void) {
    this.revisionListeners.push(listener);
  }

  public setReady(ready: boolean) {
    this.isReady = ready;
  }

  public getIsReady(): boolean {
    return this.isReady;
  }

  public getRevision(): number {
    return this.currentRevision;
  }

  public async send(
    command: string,
    payload: Record<string, unknown> = {},
    signal?: AbortSignal
  ): Promise<BridgeResponseType> {
    if (signal?.aborted) {
      throw new Error('Tool execution aborted before sending');
    }

    const requestId = crypto.randomUUID();
    const expectedRevision = typeof payload?.expected_revision === 'number'
      ? payload.expected_revision
      : this.currentRevision;

    const rawRequest: BridgeRequestType = {
      request_id: requestId,
      command,
      expected_revision: expectedRevision,
      payload,
    };

    const validatedRequest = BridgeRequest.parse(rawRequest);

    return new Promise<BridgeResponseType>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Bridge command timed out after 10000ms: ${command}`));
      }, 10000);

      const onAbort = () => {
        if (this.pending.has(requestId)) {
          clearTimeout(timer);
          this.pending.delete(requestId);
          reject(new Error('Tool execution was aborted'));
        }
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pending.set(requestId, {
        resolve: (resp) => {
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve(resp);
        },
        reject: (err) => {
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', onAbort);
          reject(err);
        },
        timer,
      });

      if (!window.unityInstance) {
        console.warn('Unity instance not yet attached. Returning mock for command:', command);
        setTimeout(() => {
          this.handleResolve(
            requestId,
            JSON.stringify({
              request_id: requestId,
              ok: true,
              circuit_revision: this.currentRevision,
              summary: `Executed ${command} (test mock)`,
              data: { status: 'mock_ready', command },
              warnings: ['Unity engine canvas not loaded yet; mock response returned'],
            })
          );
        }, 100);
        return;
      }

      try {
        window.unityInstance.SendMessage(
          'CircuitForgeBridge',
          'Receive',
          JSON.stringify(validatedRequest)
        );
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new Error(`Failed to dispatch message to Unity: ${String(err)}`));
      }
    });
  }

  private handleResolve(requestId: string, responseJson: string) {
    const entry = this.pending.get(requestId);
    if (!entry) {
      console.warn('Received resolution for unknown or timed out request:', requestId);
      return;
    }

    try {
      const parsed = JSON.parse(responseJson);
      const validated = BridgeResponse.parse(parsed);

      if (validated.ok && typeof validated.circuit_revision === 'number') {
        this.currentRevision = validated.circuit_revision;
        for (const l of this.revisionListeners) {
          try {
            l(this.currentRevision);
          } catch (err) {
            console.error('[UnityBridge] Error in revision listener:', err);
          }
        }
      }

      this.pending.delete(requestId);
      entry.resolve(validated);
    } catch (err) {
      this.pending.delete(requestId);
      entry.reject(new Error(`Invalid bridge response schema: ${String(err)}`));
    }
  }
}

export const unityBridge = new UnityBridge();
