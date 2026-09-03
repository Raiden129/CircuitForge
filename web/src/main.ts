import { toolRegistry } from './webmcp/registry';
import { circuitGetSnapshotTool, circuitGetCapabilitiesTool } from './webmcp/tools';
import { unityBridge } from './bridge/unity-bridge';
import { ActivityTimeline } from './ui/activity-timeline';

const timeline = new ActivityTimeline('activity-list');

async function init() {
  const badge = document.getElementById('webmcp-badge');
  const badgeText = document.getElementById('webmcp-status-text');
  const toolsTags = document.getElementById('active-tools-tags');
  const revBadge = document.getElementById('revision-badge');
  const testBtn = document.getElementById('test-snapshot-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');

  // 1. Detect WebMCP
  const hasWebMCP = toolRegistry.isSupported();
  if (hasWebMCP) {
    badge?.classList.remove('inactive');
    badge?.classList.add('active');
    if (badgeText) badgeText.textContent = 'WebMCP Active';

    // Register initial tools
    await toolRegistry.register(circuitGetCapabilitiesTool);
    await toolRegistry.register(circuitGetSnapshotTool);

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
          dataUrl: `${buildUrl}/unity.data`,
          frameworkUrl: `${buildUrl}/unity.framework.js`,
          codeUrl: `${buildUrl}/unity.wasm`,
          streamingAssetsUrl: 'StreamingAssets',
          companyName: 'SebastianLague',
          productName: 'Digital Logic Sim',
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

window.addEventListener('DOMContentLoaded', init);
