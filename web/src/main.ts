import { toolRegistry } from './webmcp/registry';
import {
  circuitGetSnapshotTool,
  circuitGetCapabilitiesTool,
  circuitListCatalogTool,
  circuitSetInputTool,
  circuitStepTool,
  circuitPauseTool,
  circuitRunTool,
  circuitAddComponentTool,
  circuitConnectTool,
  circuitDisconnectTool,
  circuitInspectComponentTool,
  circuitAnalyzeTool,
  circuitUndoTool,
  circuitRedoTool,
  circuitDeleteComponentTool,
  circuitClearWorkspaceTool,
  circuitVerifyTruthTableTool,
  circuitPackageChipTool,
} from './webmcp/tools';
import { unityBridge } from './bridge/unity-bridge';
import { ActivityTimeline } from './ui/activity-timeline';
import { AgentRelayClient } from './bridge/agent-client';

const timeline = new ActivityTimeline('activity-list');
(window as any).unityBridge = unityBridge;

async function init() {
  const relayClient = new AgentRelayClient(timeline);
  relayClient.start();
  const badge = document.getElementById('webmcp-badge');
  const badgeText = document.getElementById('webmcp-status-text');
  const toolsTags = document.getElementById('active-tools-tags');
  const revBadge = document.getElementById('revision-badge');
  const testBtn = document.getElementById('test-snapshot-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');

  // Synchronize revision badge across all mutations (manual, bridge, and agent)
  unityBridge.onRevision((rev) => {
    if (revBadge) revBadge.textContent = `Rev: ${rev}`;
  });

  // Log all native WebMCP tool executions to the Activity Timeline
  toolRegistry.onExecution((event, data) => {
    if (event === 'start') {
      const paramStr = data.input && Object.keys(data.input).length > 0
        ? ` (${JSON.stringify(data.input).slice(0, 60)})`
        : '';
      timeline.log({
        actor: 'agent',
        action: data.toolName,
        summary: `Agent invoking ${data.toolName}${paramStr}`,
        revision: unityBridge.getRevision(),
        ok: true,
      });
    } else if (event === 'end') {
      const summary = data.result?.summary
        || (data.result?.ok ? `${data.toolName} succeeded` : (data.error?.message || data.result?.error || 'Failed'));
      timeline.log({
        actor: 'agent',
        action: `${data.toolName}_DONE`,
        summary,
        revision: data.result?.circuit_revision ?? unityBridge.getRevision(),
        ok: data.error ? false : (data.result?.ok ?? true),
      });
    }
  });

  // 1. Detect WebMCP
  const hasWebMCP = toolRegistry.isSupported();
  if (hasWebMCP) {
    badge?.classList.remove('inactive');
    badge?.classList.add('active');
    if (badgeText) badgeText.textContent = 'WebMCP Active';

    // Register inspection & simulation tools
    await toolRegistry.register(circuitGetCapabilitiesTool);
    await toolRegistry.register(circuitListCatalogTool);
    await toolRegistry.register(circuitGetSnapshotTool);
    await toolRegistry.register(circuitInspectComponentTool);
    await toolRegistry.register(circuitAnalyzeTool);
    await toolRegistry.register(circuitAddComponentTool);
    await toolRegistry.register(circuitConnectTool);
    await toolRegistry.register(circuitDisconnectTool);
    await toolRegistry.register(circuitDeleteComponentTool);
    await toolRegistry.register(circuitClearWorkspaceTool);
    await toolRegistry.register(circuitSetInputTool);
    await toolRegistry.register(circuitStepTool);
    await toolRegistry.register(circuitPauseTool);
    await toolRegistry.register(circuitRunTool);
    await toolRegistry.register(circuitUndoTool);
    await toolRegistry.register(circuitRedoTool);
    await toolRegistry.register(circuitVerifyTruthTableTool);
    await toolRegistry.register(circuitPackageChipTool);

    timeline.log({
      actor: 'human',
      action: 'INIT',
      summary: 'WebMCP feature detected and initialized',
      revision: 0,
      ok: true,
    });
  } else {
    badge?.classList.remove('active');
    badge?.classList.add('inactive');
    if (badgeText) badgeText.textContent = 'WebMCP Unavailable';
    timeline.log({
      actor: 'human',
      action: 'WARN',
      summary: 'WebMCP API not detected in this browser. Running in manual mode.',
      revision: 0,
      ok: false,
    });
  }

  // Update tools tags in UI
  if (toolsTags) {
    const active = toolRegistry.getActiveTools();
    if (active.length > 0) {
      toolsTags.innerHTML = active.map((t) => `<span class="tool-tag">${t}</span>`).join('');
    } else {
      toolsTags.innerHTML = `<span style="font-size: 11px; color: #8b949e;">No active tools registered</span>`;
    }
  }

  // 2. Load Unity WebGL if available
  const canvas = document.querySelector<HTMLCanvasElement>('#unity-canvas');
  const buildUrl = '/unity/Build';
  const baseName = 'unity';
  const loaderUrl = `${buildUrl}/unity.loader.js`;

  try {
    const loaderCheck = await fetch(loaderUrl, { method: 'HEAD' });

    if (loaderCheck.ok && canvas) {
      if (loadingText) loadingText.textContent = 'Loading Unity WebGL Engine...';

      const script = document.createElement('script');
      script.src = loaderUrl;
      script.onload = () => {
        const createUnityInstance = (window as any).createUnityInstance;
        if (!createUnityInstance) {
          if (loadingOverlay) loadingOverlay.style.display = 'none';
          return;
        }

        const config = {
          dataUrl: `${buildUrl}/${baseName}.data`,
          frameworkUrl: `${buildUrl}/${baseName}.framework.js`,
          codeUrl: `${buildUrl}/${baseName}.wasm`,
          streamingAssetsUrl: 'StreamingAssets',
          companyName: 'SebastianLague',
          productName: 'Digital-Logic-Sim',
          productVersion: '2.1.6',
        };

        createUnityInstance(canvas, config, (progress: number) => {
          if (loadingText) {
            loadingText.textContent = `Loading Unity WebGL... ${Math.round(progress * 100)}%`;
          }
        })
          .then((instance: any) => {
            window.unityInstance = instance;
            unityBridge.setReady(true);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            timeline.log({
              actor: 'human',
              action: 'UNITY_READY',
              summary: 'Unity 6 WebGL simulator canvas mounted successfully',
              revision: 0,
              ok: true,
            });
          })
          .catch((err: any) => {
            console.error('Unity instance instantiation failed:', err);
            if (loadingText) loadingText.textContent = `Failed to load Unity: ${String(err)}`;
          });
      };
      document.body.appendChild(script);
    } else {
      if (loadingText) {
        loadingText.innerHTML = `
          Unity WebGL build awaiting generation.<br/>
          <span style="font-size: 12px; color: #8b949e;">WebMCP bridge and tool registry are active and ready.</span>
        `;
      }
    }
  } catch (_e) {
    if (loadingText) {
      loadingText.innerHTML = `
        Unity WebGL build awaiting generation.<br/>
        <span style="font-size: 12px; color: #8b949e;">WebMCP bridge and tool registry are active and ready.</span>
      `;
    }
  }

  // 3. Test Snapshot Button
  testBtn?.addEventListener('click', async () => {
    timeline.log({
      actor: 'human',
      action: 'circuit_get_snapshot',
      summary: 'Invoking circuit_get_snapshot via bridge...',
      revision: unityBridge.getRevision(),
      ok: true,
    });

    try {
      const res = await circuitGetSnapshotTool.execute({ detail: 'summary' }, { signal: new AbortController().signal });
      if (revBadge) revBadge.textContent = `Rev: ${res.circuit_revision ?? unityBridge.getRevision()}`;
      timeline.log({
        actor: 'agent',
        action: 'SNAPSHOT_RESULT',
        summary: res.summary || JSON.stringify(res.data),
        revision: res.circuit_revision ?? unityBridge.getRevision(),
        ok: res.ok,
      });
    } catch (err) {
      timeline.log({
        actor: 'agent',
        action: 'SNAPSHOT_ERROR',
        summary: String(err),
        revision: unityBridge.getRevision(),
        ok: false,
      });
    }
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
