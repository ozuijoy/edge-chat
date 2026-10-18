// 只允许本站原创跨桥，不能按“排除当前桥来源”判断，否则两个桥之间会扩散。
export function isLocalBridgeMessage(message: { source?: string; sender?: { kind?: string } }) {
  return message.source === "edgechat" && message.sender?.kind === "local";
}
