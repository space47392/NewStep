// Voice calls, app-wide: placing a call, ringing for an incoming one from
// any screen, and the call screen on top of everything.
//
// Flow: start_call → the other phone rings (realtime + push) → answer_call →
// both phones open a CallConnection and swap signals → audio flows directly
// between them. Either side hangs up with end_call.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Vibration } from 'react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { askPermission } from '../components/askPermission';
import CallScreen from '../components/call/CallScreen';
import { CallConnection, callsSupported, type ConnectionState } from '../lib/callConnection';
import { endReasonFor, isLive, mergeSignals, RING_TIMEOUT_MS, type CallPhase, type CallRole, type CallRow, type CallSignal, type EndReason } from '../lib/calls';
import {
  answerCall,
  endCall,
  endMyStaleCalls,
  fetchCall,
  fetchCallSignals,
  fetchMyRingingCall,
  startCall,
  subscribeToCall,
  subscribeToIncomingCalls,
} from '../lib/callsApi';
import { fetchProfileById } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { errorMessage, isNetworkError } from '../lib/errors';
import type { ChatProfile } from '../types';

export type ActiveCall = {
  id: string;
  role: CallRole;
  other: ChatProfile;
  phase: CallPhase;
  endReason: EndReason | null;
  connectedAt: number | null;
  reconnecting: boolean;
  muted: boolean;
};

type CallContextType = {
  // False in Expo Go (no native WebRTC): the call button stays hidden.
  supported: boolean;
  active: ActiveCall | null;
  placeCall: (other: ChatProfile) => Promise<void>;
};

const CallContext = createContext<CallContextType>({ supported: false, active: null, placeCall: async () => {} });

export const useCalls = () => useContext(CallContext);

// How long "Call ended" stays up before the screen closes.
const ENDED_LINGER_MS = 1800;
const RING_PATTERN = [0, 900, 1100];

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const userId = user?.id ?? null;
  const supported = useMemo(() => callsSupported(), []);

  const [active, setActive] = useState<ActiveCall | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const connRef = useRef<CallConnection | null>(null);
  const unwatchRef = useRef<(() => void) | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const seenRef = useRef(new Set<number>());

  const update = useCallback((patch: Partial<ActiveCall> | null) => {
    const next = patch === null ? null : activeRef.current ? { ...activeRef.current, ...patch } : null;
    activeRef.current = next;
    setActive(next);
  }, []);

  const later = (ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  };

  const cleanup = useCallback(() => {
    Vibration.cancel();
    connRef.current?.close();
    connRef.current = null;
    unwatchRef.current?.();
    unwatchRef.current = null;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    seenRef.current = new Set();
  }, []);

  // Safe to call more than once: our own hang-up also comes back as a status change.
  const finish = useCallback(
    (reason: EndReason) => {
      const call = activeRef.current;
      if (!call || call.phase === 'ended') return;
      cleanup();
      update({ phase: 'ended', endReason: reason, reconnecting: false });
      const id = call.id;
      timersRef.current.push(
        setTimeout(() => {
          if (activeRef.current?.id === id) update(null);
        }, ENDED_LINGER_MS)
      );
    },
    [cleanup, update]
  );

  const onConnection = useCallback(
    (state: ConnectionState) => {
      const call = activeRef.current;
      if (!call || call.phase === 'ended') return;
      if (state === 'connected') update({ phase: 'connected', reconnecting: false, connectedAt: call.connectedAt ?? Date.now() });
      else if (state === 'reconnecting') update({ reconnecting: true });
      else if (state === 'failed') {
        endCall(call.id).catch(() => {});
        finish('failed');
      }
    },
    [finish, update]
  );

  const feed = useCallback((signals: CallSignal[]) => {
    for (const s of mergeSignals(seenRef.current, signals)) connRef.current?.handleSignal(s);
  }, []);

  const onStatus = useCallback(
    (row: CallRow) => {
      const call = activeRef.current;
      if (!call || call.id !== row.id || call.phase === 'ended') return;
      if (!isLive(row.status)) {
        finish(endReasonFor(row.status, call.role));
      } else if (row.status === 'accepted' && call.role === 'caller' && call.phase === 'ringing') {
        update({ phase: 'connecting' });
        connRef.current?.start();
      }
    },
    [finish, update]
  );

  // Status changes and signals for one call, plus a catch-up for anything
  // that happened before the live feed was ready.
  const watch = useCallback(
    (callId: string) => {
      unwatchRef.current = subscribeToCall(callId, {
        onStatus,
        onSignal: (s) => feed([s]),
        onReady: () => {
          fetchCall(callId).then((row) => row && onStatus(row)).catch(() => {});
          fetchCallSignals(callId).then(feed).catch(() => {});
        },
      });
    },
    [feed, onStatus]
  );

  const placeCall = useCallback(
    async (other: ChatProfile) => {
      if (!supported || !userId) return;
      if (activeRef.current) {
        showToast("You're already on a call.");
        return;
      }
      if (!(await askPermission(requestRecordingPermissionsAsync, 'microphone', 'to make a voice call'))) return;

      const placeholder: ActiveCall = { id: '', role: 'caller', other, phase: 'ringing', endReason: null, connectedAt: null, reconnecting: false, muted: false };
      activeRef.current = placeholder;
      setActive(placeholder);
      try {
        const id = await startCall(other.id);
        // Hung up while the call was still being created.
        if (activeRef.current !== placeholder) {
          endCall(id).catch(() => {});
          return;
        }
        const conn = new CallConnection(id, 'caller', onConnection);
        connRef.current = conn;
        update({ id });
        // False: hung up while the microphone was opening (already cleaned up).
        if (!(await conn.openMicrophone())) return;
        watch(id);
        later(RING_TIMEOUT_MS, () => {
          if (activeRef.current?.id === id && activeRef.current.phase === 'ringing') {
            endCall(id).catch(() => {});
            finish('missed');
          }
        });
      } catch (e) {
        const id = activeRef.current?.id;
        if (id) endCall(id).catch(() => {});
        cleanup();
        update(null);
        showToast(errorMessage(e, "Couldn't start the call."));
      }
    },
    [cleanup, finish, onConnection, showToast, supported, update, userId, watch]
  );

  // Someone is calling me.
  const ring = useCallback(
    async (row: CallRow) => {
      // No age check here: the phone's clock may be off. The server already
      // expired old rings, and answer_call refuses one that's over.
      if (!row.caller_id || row.status !== 'ringing' || activeRef.current) return;
      let other: ChatProfile = { id: row.caller_id, full_name: null, avatar_url: null };
      try {
        const p = await fetchProfileById(row.caller_id);
        other = { id: p.id, full_name: p.full_name ?? null, avatar_url: p.avatar_url ?? null };
      } catch {
        // Still ring; the name shows as "Someone".
      }
      if (activeRef.current) return;
      const call: ActiveCall = { id: row.id, role: 'callee', other, phase: 'ringing', endReason: null, connectedAt: null, reconnecting: false, muted: false };
      activeRef.current = call;
      setActive(call);
      connRef.current = new CallConnection(row.id, 'callee', onConnection);
      watch(row.id);
      Vibration.vibrate(RING_PATTERN, true);
      // Timed from when it reached us; the caller's own timer usually ends it first.
      later(RING_TIMEOUT_MS, () => {
        if (activeRef.current?.id === row.id && activeRef.current.phase === 'ringing') finish('missed');
      });
    },
    [finish, onConnection, watch]
  );

  const accept = useCallback(async () => {
    const call = activeRef.current;
    const conn = connRef.current;
    if (!call || !conn || call.role !== 'callee' || call.phase !== 'ringing') return;
    Vibration.cancel();
    if (!(await askPermission(requestRecordingPermissionsAsync, 'microphone', 'to answer the call'))) return;
    // The caller may have given up while the permission prompt was open.
    if (connRef.current !== conn || activeRef.current?.phase !== 'ringing') return;
    update({ phase: 'connecting' });
    try {
      if (!(await conn.openMicrophone())) return;
      // Ready before saying yes, so the caller's offer always has somewhere to land.
      conn.start();
      await answerCall(call.id, true);
    } catch (e) {
      endCall(call.id).catch(() => {});
      if (isNetworkError(e)) {
        finish('error');
        showToast(errorMessage(e));
      } else {
        // Usually "This call has ended": it stopped ringing just before the tap.
        finish('missed');
      }
    }
  }, [finish, showToast, update]);

  const decline = useCallback(() => {
    const call = activeRef.current;
    if (!call) return;
    answerCall(call.id, false).catch(() => {});
    cleanup();
    update(null);
  }, [cleanup, update]);

  const hangUp = useCallback(() => {
    const call = activeRef.current;
    if (!call || call.phase === 'ended') return;
    if (call.id) endCall(call.id).catch(() => {});
    finish(call.phase === 'ringing' ? 'cancelled' : 'ended');
  }, [finish]);

  const toggleMute = useCallback(() => {
    const call = activeRef.current;
    if (!call) return;
    connRef.current?.setMuted(!call.muted);
    update({ muted: !call.muted });
  }, [update]);

  // Listen for incoming calls while signed in, and catch one that started
  // ringing while the app was closed (opened from the push).
  useEffect(() => {
    if (!supported || !userId) return;
    const check = () => fetchMyRingingCall().then((row) => row && ring(row)).catch(() => {});
    const unsubscribe = subscribeToIncomingCalls(userId, ring);
    // Nothing is on a call yet at this point, so leftovers from a closed app can go.
    if (!activeRef.current) endMyStaleCalls().catch(() => {}).finally(check);
    else check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, [ring, supported, userId]);

  // Signing out mid-call hangs up.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      const call = activeRef.current;
      if (call?.id) endCall(call.id).catch(() => {});
      cleanup();
      update(null);
    });
    return () => data.subscription.unsubscribe();
  }, [cleanup, update]);

  useEffect(() => cleanup, [cleanup]);

  const value = useMemo(() => ({ supported, active, placeCall }), [active, placeCall, supported]);

  return (
    <CallContext.Provider value={value}>
      {children}
      {active ? <CallScreen call={active} onAccept={accept} onDecline={decline} onHangUp={hangUp} onToggleMute={toggleMute} /> : null}
    </CallContext.Provider>
  );
}
