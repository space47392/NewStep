// The audio link between the two phones (WebRTC), for one call.
//
// The caller sends an "offer" once the call is answered, the person called
// replies with an "answer", and both send "ice" candidates (ways to reach
// them). These go through call_signals (callsApi.ts). The audio itself
// never touches our servers.
import { NativeModules } from 'react-native';
import { CONNECT_TIMEOUT_MS, ICE_SERVERS, RECONNECT_GRACE_MS, type CallRole, type CallSignal } from './calls';
import { sendCallSignal } from './callsApi';

type WebRTC = typeof import('react-native-webrtc');
type PeerConnection = InstanceType<WebRTC['RTCPeerConnection']>;
type Stream = InstanceType<WebRTC['MediaStream']>;
type IceInit = { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };

let webrtc: WebRTC | null | undefined;

// react-native-webrtc is native code: it isn't in Expo Go, and importing it
// there throws. Load it only when the native side is really present.
export function loadWebRTC(): WebRTC | null {
  if (webrtc === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webrtc = NativeModules.WebRTCModule ? (require('react-native-webrtc') as WebRTC) : null;
  }
  return webrtc;
}

export const callsSupported = () => loadWebRTC() !== null;

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export class CallConnection {
  private pc: PeerConnection | null = null;
  private stream: Stream | null = null;
  private pendingIce: IceInit[] = [];
  private queue: Promise<void> = Promise.resolve();
  private dropTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private readonly callId: string,
    private readonly role: CallRole,
    private readonly onState: (state: ConnectionState) => void
  ) {}

  // Signals and setup must run strictly in order (an answer can't be applied
  // before the offer, a candidate before either), so every step is queued.
  private run(step: () => Promise<void>) {
    this.queue = this.queue.then(() => (this.closed ? undefined : step())).catch(() => {
      if (!this.closed) this.onState('failed');
    });
  }

  // Asks for the microphone. Throws if it's refused or busy. False when the
  // call ended while waiting: the microphone is let go again right away.
  async openMicrophone(): Promise<boolean> {
    const rtc = loadWebRTC();
    if (!rtc) throw new Error('Calls need the NewStep app (not Expo Go).');
    if (this.stream) return !this.closed;
    const stream = await rtc.mediaDevices.getUserMedia({ audio: true, video: false });
    if (this.closed) {
      stream.getTracks().forEach((track) => track.stop());
      stream.release();
      return false;
    }
    this.stream = stream;
    return true;
  }

  // Both phones call this once the call is answered.
  start(): void {
    this.run(async () => {
      const rtc = loadWebRTC()!;
      if (!this.stream) await this.openMicrophone();
      const pc = new rtc.RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.pc = pc;
      this.stream!.getTracks().forEach((track) => pc.addTrack(track, this.stream!));

      pc.addEventListener('icecandidate', (event) => {
        const c = event.candidate;
        if (!c || this.closed) return;
        sendCallSignal(this.callId, 'ice', { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null }).catch(() => {});
      });
      pc.addEventListener('connectionstatechange', () => this.onConnectionChange(pc.connectionState));

      this.onState('connecting');
      // No way through (or the other phone vanished): don't spin forever.
      this.connectTimer = setTimeout(() => {
        if (!this.closed && pc.connectionState !== 'connected') this.onState('failed');
      }, CONNECT_TIMEOUT_MS);
      if (this.role === 'caller') {
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        await sendCallSignal(this.callId, 'offer', { type: 'offer', sdp: offer.sdp });
      }
    });
  }

  handleSignal(signal: CallSignal): void {
    this.run(async () => {
      const rtc = loadWebRTC()!;
      const pc = this.pc;
      if (!pc) return;
      const payload = signal.payload as Record<string, unknown>;

      if (signal.kind === 'offer' && this.role === 'callee') {
        await pc.setRemoteDescription(new rtc.RTCSessionDescription({ type: 'offer', sdp: payload.sdp as string }));
        await this.flushIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendCallSignal(this.callId, 'answer', { type: 'answer', sdp: answer.sdp });
      } else if (signal.kind === 'answer' && this.role === 'caller') {
        await pc.setRemoteDescription(new rtc.RTCSessionDescription({ type: 'answer', sdp: payload.sdp as string }));
        await this.flushIce();
      } else if (signal.kind === 'ice') {
        const ice: IceInit = { candidate: payload.candidate as string, sdpMid: payload.sdpMid as string | null, sdpMLineIndex: payload.sdpMLineIndex as number | null };
        // A candidate can arrive before the offer/answer it belongs to.
        if (pc.remoteDescription) await pc.addIceCandidate(new rtc.RTCIceCandidate(ice));
        else this.pendingIce.push(ice);
      }
    });
  }

  setMuted(muted: boolean): void {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.dropTimer) clearTimeout(this.dropTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream?.release();
    this.pc?.close();
    this.pc = null;
    this.stream = null;
  }

  private async flushIce() {
    const rtc = loadWebRTC()!;
    const waiting = this.pendingIce;
    this.pendingIce = [];
    for (const ice of waiting) await this.pc?.addIceCandidate(new rtc.RTCIceCandidate(ice));
  }

  private onConnectionChange(state: PeerConnection['connectionState']) {
    if (this.closed) return;
    if (state === 'connected') {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connectTimer = null;
      if (this.dropTimer) clearTimeout(this.dropTimer);
      this.dropTimer = null;
      this.onState('connected');
    } else if (state === 'disconnected') {
      // Often a short network blip (walking out of Wi-Fi): give it a moment.
      this.onState('reconnecting');
      if (!this.dropTimer) this.dropTimer = setTimeout(() => !this.closed && this.onState('failed'), RECONNECT_GRACE_MS);
    } else if (state === 'failed') {
      this.onState('failed');
    }
  }
}
