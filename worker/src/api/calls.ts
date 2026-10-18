import { forwardVerifiedRequest } from '../do-bridge.js';
import { authorizeVoiceCall } from '../calls/access.ts';
import { turnConfigured } from '../calls/turn.ts';
import { CALL_STUN } from '../../../shared/voice-call.ts';

export function registerCallRoutes(app) {
  app.get('/api/calls/:roomId/config', async c => {
    await authorizeVoiceCall(c.env.DB, Number(c.req.param('roomId')), c.get('session').userId);
    return c.json({ iceServers: CALL_STUN, turnAvailable: turnConfigured(c.env) });
  });
  for (const [method, path] of [['post', 'action'], ['get', 'ice']]) {
    app[method](`/api/calls/:roomId/${path}`, async c => {
      const roomId = Number(c.req.param('roomId'));
      await authorizeVoiceCall(c.env.DB, roomId, c.get('session').userId);
      return forwardVerifiedRequest({
        stub: c.env.VOICE_CALL.get(c.env.VOICE_CALL.idFromName(`dm:${roomId}`)),
        request: c.req.raw, pathname: `/${path}`, searchParams: { roomId }, principal: c.get('session')
      });
    });
  }
}
