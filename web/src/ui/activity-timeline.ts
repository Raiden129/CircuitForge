export interface ActivityItem {
  id: string;
  timestamp: string;
  actor: 'human' | 'agent';
  action: string;
  summary: string;
  revision: number;
  ok: boolean;
}

export class ActivityTimeline {
  private container: HTMLElement | null = null;
  private items: ActivityItem[] = [];

  constructor(containerId: string) {
    this.container = document.getElementById(containerId);
  }

  public log(item: Omit<ActivityItem, 'id' | 'timestamp'>) {
    const fullItem: ActivityItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
    };

    this.items.unshift(fullItem);
    if (this.items.length > 50) this.items.pop();
    this.render();
  }

  public render() {
    if (!this.container) return;

    if (this.items.length === 0) {
      this.container.innerHTML = `
        <div style="padding: 12px; color: #888; font-size: 12px; text-align: center;">
          No activity yet. Tools invoked by browser agents or human actions will appear here.
        </div>
      `;
      return;
    }

    this.container.innerHTML = this.items
      .map(
        (it) => `
        <div style="padding: 8px 12px; border-bottom: 1px solid #222; font-family: monospace; font-size: 12px; display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: bold; color: ${it.actor === 'agent' ? '#38bdf8' : '#a3e635'};">
              [${it.actor.toUpperCase()}] ${it.action}
            </span>
            <span style="color: #666; font-size: 10px;">${it.timestamp} • rev ${it.revision}</span>
          </div>
          <div style="color: ${it.ok ? '#cbd5e1' : '#f87171'};">
            ${it.summary}
          </div>
        </div>
      `
      )
      .join('');
  }
}
