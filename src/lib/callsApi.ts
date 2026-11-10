// Database side of voice calls (supabase/calls.sql). Pure logic: calls.ts.
import { supabase } from './supabase';
import { readSignal, type CallKind, type CallRow, type CallSignal, type SignalKind } from './calls';

const CALL_COLUMNS = 'id, caller_id, callee_id, conversation_id, kind, status, created_at, answered_at, ended_at';

// null = you can call; otherwise a short reason to show.
export async function fetchCallBlocker(otherUserId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('call_blocker', { p_other: otherUserId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function startCall(calleeId: string, kind: CallKind = 'audio'): Promise<string> {
  const { data, error } = await supabase.rpc('start_call', { p_callee: calleeId, p_kind: kind });
  if (error) throw error;
  return data as string;
}

export async function answerCall(callId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('answer_call', { p_call: callId, p_accept: accept });
  if (error) throw error;
}

export async function endCall(callId: string): Promise<void> {
  const { error } = await supabase.rpc('end_call', { p_call: callId });
  if (error) throw error;
}

// On launch: close anything left open by an app that was shut mid-call.
export async function endMyStaleCalls(): Promise<void> {
  const { error } = await supabase.rpc('end_my_stale_calls');
  if (error) throw error;
}

export async function sendCallSignal(callId: string, kind: SignalKind, payload: object): Promise<void> {
  const { error } = await supabase.rpc('send_call_signal', { p_call: callId, p_kind: kind, p_payload: payload });
  if (error) throw error;
}

export async function fetchCall(callId: string): Promise<CallRow | null> {
  const { data, error } = await supabase.from('calls').select(CALL_COLUMNS).eq('id', callId).maybeSingle();
  if (error) throw error;
  return data as CallRow | null;
}

// The other side's signals so far. RLS already leaves out your own.
export async function fetchCallSignals(callId: string): Promise<CallSignal[]> {
  const { data, error } = await supabase.from('call_signals').select('id, call_id, sender_id, kind, payload').eq('call_id', callId).order('id');
  if (error) throw error;
  return (data ?? []).map(readSignal).filter((s): s is CallSignal => !!s);
}

// A call that's ringing for me right now, e.g. after opening the app from the push.
// The server decides what still counts as ringing (its clock, not the phone's).
export async function fetchMyRingingCall(): Promise<CallRow | null> {
  const { data, error } = await supabase.rpc('my_ringing_call');
  if (error) throw error;
  return ((data as CallRow[] | null) ?? [])[0] ?? null;
}

const uniqueTopic = (name: string) => `${name}:${Math.random().toString(36).slice(2)}`;

// New calls ringing for this user.
export function subscribeToIncomingCalls(userId: string, onRing: (call: CallRow) => void): () => void {
  const channel = supabase
    .channel(uniqueTopic(`calls-in:${userId}`))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${userId}` }, (payload) =>
      onRing(payload.new as CallRow)
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// One call: its status changes and the other side's signals.
// onReady fires once both feeds are live, so a catch-up fetch after it can't miss anything.
export function subscribeToCall(
  callId: string,
  handlers: { onStatus: (call: CallRow) => void; onSignal: (signal: CallSignal) => void; onReady?: () => void }
): () => void {
  const channel = supabase
    .channel(uniqueTopic(`call:${callId}`))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` }, (payload) =>
      handlers.onStatus(payload.new as CallRow)
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `call_id=eq.${callId}` }, (payload) => {
      const signal = readSignal(payload.new);
      if (signal) handlers.onSignal(signal);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') handlers.onReady?.();
    });
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchCallsOff(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('notification_prefs').select('calls_off').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return !!(data as { calls_off?: boolean } | null)?.calls_off;
}

export async function setCallsOff(off: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_calls_off', { p_off: off });
  if (error) throw error;
}
