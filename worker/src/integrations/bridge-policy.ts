// 只允許本站原創跨橋，不能按“排除當前橋來源”判斷，否則兩個橋之間會擴散。
export function isLocalBridgeMessage(message: { source?: string; sender?: { kind?: string } }) {
  return message.source === "edgechat" && message.sender?.kind === "local";
}
