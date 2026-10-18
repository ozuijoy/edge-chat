# WebSocket auth handoff

This project validates WebSocket sessions in the Worker before forwarding the
upgrade request to the `ChannelRoom` Durable Object.

## Normal request flow

1. The client opens `/api/ws/:kind/:id`.
2. `authMiddleware` runs the full session validation in the Worker.
3. The Worker forwards the upgrade request to `ChannelRoom` and overwrites these
   internal headers:
   - `x-cfchat-internal-auth`
   - `x-cfchat-verified-user-id`
   - `x-cfchat-verified-is-admin`
   - `x-cfchat-verified-at`
4. `ChannelRoom` trusts those headers on the Worker-to-DO path and only checks
   room accessibility during the handshake.

## Fallback path

If the internal headers are missing or malformed, `ChannelRoom` falls back to
the legacy token-based `validateSession()` check. This is only a safety net and
debugging fallback. The normal production path should use the Worker-injected
headers.

## Connection lifetime semantics

After the socket is established, the Durable Object revalidates the session and
room membership before accepting each incoming message and before delivering each
broadcast to a connected socket.

That means these changes take effect for active sockets as soon as the next
message is sent to or from the room:

- password reset
- session invalidation
- account disable or delete
- removal from a private room

Sockets that no longer pass session or room checks are closed with a policy
violation status and are removed from the room connection set.
