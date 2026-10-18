import { deliverTelegramNotification, nextTelegramNotificationAt, type NotificationEnv } from "../integrations/telegram/notification-queue.ts";
import { durableObjectHealth } from "../maintenance/do-health.ts";
import { isVerifiedInternalRequest } from "../verified-identity.js";

interface State {
  storage: { setAlarm(time: number): Promise<void>; deleteAlarm(): Promise<void> };
}

export class TelegramNotifications {
  state: State;
  env: NotificationEnv;
  tail: Promise<unknown> = Promise.resolve();
  constructor(state: State, env: NotificationEnv) { this.state = state; this.env = env; }

  serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task);
    this.tail = next.catch(() => {});
    return next;
  }

  async schedule() {
    const next = await nextTelegramNotificationAt(this.env);
    if (next === null) await this.state.storage.deleteAlarm();
    else await this.state.storage.setAlarm(Math.max(Date.now() + 1000, next));
  }

  async fetch(request: Request) {
    const health = durableObjectHealth(request, "TelegramNotifications");
    if (health) return health;
    if (!isVerifiedInternalRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return this.serial(async () => { await this.schedule(); return Response.json({ ok: true }); });
  }

  async alarm() {
    return this.serial(async () => {
      // 提前持久化救援闹钟，网络请求或 Worker 中断不会让队列失去调度。
      await this.state.storage.setAlarm(Date.now() + 60_000);
      await deliverTelegramNotification(this.env);
      await this.schedule();
    });
  }
}
