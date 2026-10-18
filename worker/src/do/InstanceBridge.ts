import { deliverBinding, nextDeliveryAt } from "../integrations/instance-bridge/delivery.ts";
import { validId } from "../integrations/instance-bridge/protocol.ts";
import { isVerifiedInternalRequest } from "../verified-identity.js";
import type { BridgeEnv } from "../integrations/instance-bridge/store.ts";
import { durableObjectHealth } from "../maintenance/do-health.ts";

interface BridgeState {
  storage: {
    put(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | undefined>;
    getAlarm(): Promise<number | null>;
    setAlarm(time: number): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
}

export class InstanceBridge {
  state: BridgeState;
  env: BridgeEnv;
  constructor(state: BridgeState, env: BridgeEnv) { this.state = state; this.env = env; }

  async fetch(request: Request) {
    const health = durableObjectHealth(request, "InstanceBridge");
    if (health) return health;
    if (!isVerifiedInternalRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await request.json() as { id: string };
    if (!validId(id)) return Response.json({ error: "Invalid binding" }, { status: 400 });
    await this.state.storage.put("bindingId", id);
    const current = await this.state.storage.getAlarm();
    if (!current || current > Date.now() + 1000) await this.state.storage.setAlarm(Date.now() + 1000);
    return Response.json({ ok: true });
  }

  async alarm() {
    const id = await this.state.storage.get("bindingId");
    if (!id) return;
    // 先持久化救援 alarm，进程在 D1 或网络 await 中退出也不会遗失后续调度。
    await this.state.storage.setAlarm(Date.now() + 60_000);
    await deliverBinding(this.env, id);
    const next = await nextDeliveryAt(this.env, id);
    if (next === null) await this.state.storage.deleteAlarm();
    else await this.state.storage.setAlarm(Math.max(Date.now() + 1000, next));
  }
}
