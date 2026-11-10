// Voice calls (supabase/calls.sql). Pure and unit tested.
// Database calls: callsApi.ts. The phone-to-phone audio: useCallConnection.ts.

export type CallKind = 'audio' | 'video';
export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'missed' | 'cancelled' | 'ended';

export type CallRow = {
  id: string;
  caller_id: string | null;
  callee_id: string | null;
  conversation_id: string | null;
  kind: CallKind;
  status: CallStatus;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

export type SignalKind = 'offer' | 'answer' | 'ice';
export type CallSignal = { id: number; call_id: string; sender_id: string; kind: SignalKind; payload: unknown };

// Must match expire_ringing_calls() in calls.sql.
export const RING_TIMEOUT_MS = 45_000;

// Direct connection only (no relay server), so it costs nothing. A few strict
// school or carrier networks block this; those calls end with "Couldn't connect".
export const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

// How long "Connecting…" may take after the call is answered before we give up.
export const CONNECT_TIMEOUT_MS = 20_000;

// How long a dropped connection may try to come back before we hang up.
export const RECONNECT_GRACE_MS = 10_000;

export function isLive(status: CallStatus): boolean {
  return status === 'ringing' || status === 'accepted';
}

// What the call screen is doing right now.
export type CallPhase = 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallRole = 'caller' | 'callee';
export type EndReason = 'declined' | 'missed' | 'cancelled' | 'ended' | 'failed' | 'busy' | 'error';

export function endReasonFor(status: CallStatus, role: CallRole): EndReason {
  if (status === 'declined') return 'declined';
  if (status === 'missed') return 'missed';
  // The caller gave up before an answer: for the person being called, that's a missed call.
  if (status === 'cancelled') return role === 'callee' ? 'missed' : 'cancelled';
  return 'ended';
}

const END_LABELS: Record<EndReason, string> = {
  declined: 'Call declined',
  missed: 'No answer',
  cancelled: 'Call cancelled',
  ended: 'Call ended',
  failed: "Couldn't connect. Try again on Wi-Fi.",
  busy: 'Busy right now',
  error: 'Something went wrong',
};

export function callStatusLabel(
  phase: CallPhase,
  role: CallRole,
  opts: { endReason?: EndReason | null; seconds?: number } = {}
): string {
  if (phase === 'ended') {
    // The caller waited and nobody picked up; the person called missed it.
    if (opts.endReason === 'missed' && role === 'callee') return 'Missed call';
    return END_LABELS[opts.endReason ?? 'ended'];
  }
  if (phase === 'connected') return formatCallDuration(opts.seconds ?? 0);
  if (phase === 'connecting') return 'Connecting…';
  return role === 'caller' ? 'Calling…' : 'Incoming voice call';
}

// 0:05, 12:03, 1:02:03
export function formatCallDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// A row the other phone sent. Anything that doesn't look right is ignored
// instead of being handed to WebRTC.
export function readSignal(row: unknown): CallSignal | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'number' || typeof r.call_id !== 'string' || typeof r.sender_id !== 'string') return null;
  const p = r.payload as Record<string, unknown> | null;
  if (!p || typeof p !== 'object') return null;
  if (r.kind === 'offer' || r.kind === 'answer') {
    if (p.type !== r.kind || typeof p.sdp !== 'string') return null;
  } else if (r.kind === 'ice') {
    if (typeof p.candidate !== 'string') return null;
  } else {
    return null;
  }
  return { id: r.id, call_id: r.call_id, sender_id: r.sender_id, kind: r.kind, payload: p };
}

// Signals can come both from the live feed and from the catch-up fetch.
// Keeps each one once, in the order it was sent.
export function mergeSignals(seen: Set<number>, incoming: CallSignal[]): CallSignal[] {
  const fresh = incoming.filter((s) => !seen.has(s.id)).sort((a, b) => a.id - b.id);
  for (const s of fresh) seen.add(s.id);
  return fresh;
}
