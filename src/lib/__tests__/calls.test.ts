import { readFileSync } from 'fs';
import { join } from 'path';
import { callStatusLabel, endReasonFor, formatCallDuration, isLive, mergeSignals, readSignal, RING_TIMEOUT_MS, type CallSignal } from '../calls';

const sql = readFileSync(join(__dirname, '../../../supabase/calls.sql'), 'utf8');

describe('ringing', () => {
  it('gives up at the same moment as the database', () => {
    const seconds = Number(sql.match(/status = 'ringing' and created_at < now\(\) - interval '(\d+) seconds'/)![1]);
    expect(RING_TIMEOUT_MS).toBe(seconds * 1000);
  });

  it('treats ringing and accepted as live', () => {
    expect(isLive('ringing')).toBe(true);
    expect(isLive('accepted')).toBe(true);
    for (const s of ['declined', 'missed', 'cancelled', 'ended'] as const) expect(isLive(s)).toBe(false);
  });
});

describe('endReasonFor', () => {
  it('shows a caller giving up as a missed call to the person called', () => {
    expect(endReasonFor('cancelled', 'callee')).toBe('missed');
    expect(endReasonFor('cancelled', 'caller')).toBe('cancelled');
  });

  it('passes the rest straight through', () => {
    expect(endReasonFor('declined', 'caller')).toBe('declined');
    expect(endReasonFor('missed', 'caller')).toBe('missed');
    expect(endReasonFor('ended', 'callee')).toBe('ended');
  });
});

describe('callStatusLabel', () => {
  it('says who is waiting for whom', () => {
    expect(callStatusLabel('ringing', 'caller')).toBe('Calling…');
    expect(callStatusLabel('ringing', 'callee')).toBe('Incoming voice call');
    expect(callStatusLabel('connecting', 'caller')).toBe('Connecting…');
  });

  it('shows the timer while talking and why it ended after', () => {
    expect(callStatusLabel('connected', 'caller', { seconds: 65 })).toBe('1:05');
    expect(callStatusLabel('ended', 'caller', { endReason: 'declined' })).toBe('Call declined');
    expect(callStatusLabel('ended', 'caller')).toBe('Call ended');
    expect(callStatusLabel('ended', 'caller', { endReason: 'missed' })).toBe('No answer');
    expect(callStatusLabel('ended', 'callee', { endReason: 'missed' })).toBe('Missed call');
  });
});

describe('formatCallDuration', () => {
  it('reads like a phone timer', () => {
    expect(formatCallDuration(0)).toBe('0:00');
    expect(formatCallDuration(5.9)).toBe('0:05');
    expect(formatCallDuration(723)).toBe('12:03');
    expect(formatCallDuration(3723)).toBe('1:02:03');
    expect(formatCallDuration(-4)).toBe('0:00');
  });
});

describe('readSignal', () => {
  const base = { id: 1, call_id: 'c', sender_id: 's' };

  it('accepts well-formed offers, answers and candidates', () => {
    expect(readSignal({ ...base, kind: 'offer', payload: { type: 'offer', sdp: 'v=0' } })?.kind).toBe('offer');
    expect(readSignal({ ...base, kind: 'answer', payload: { type: 'answer', sdp: 'v=0' } })?.kind).toBe('answer');
    expect(readSignal({ ...base, kind: 'ice', payload: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } })?.kind).toBe('ice');
  });

  it('ignores anything else', () => {
    expect(readSignal(null)).toBeNull();
    expect(readSignal({ ...base, kind: 'offer', payload: { type: 'answer', sdp: 'v=0' } })).toBeNull();
    expect(readSignal({ ...base, kind: 'offer', payload: { type: 'offer' } })).toBeNull();
    expect(readSignal({ ...base, kind: 'ice', payload: {} })).toBeNull();
    expect(readSignal({ ...base, kind: 'hello', payload: {} })).toBeNull();
    expect(readSignal({ ...base, id: '1', kind: 'ice', payload: { candidate: 'x' } })).toBeNull();
  });

  it('knows the same kinds as the database', () => {
    const kinds = sql.match(/kind text not null check \(kind in \(([^)]*)\)\)/)![1].split(',').map((k) => k.trim().replace(/'/g, ''));
    expect(kinds).toEqual(['offer', 'answer', 'ice']);
  });
});

describe('mergeSignals', () => {
  const sig = (id: number): CallSignal => ({ id, call_id: 'c', sender_id: 's', kind: 'ice', payload: { candidate: String(id) } });

  it('keeps each signal once, in the order sent', () => {
    const seen = new Set<number>();
    expect(mergeSignals(seen, [sig(2)]).map((s) => s.id)).toEqual([2]);
    // The catch-up fetch returns everything so far, including what the live feed already gave.
    expect(mergeSignals(seen, [sig(3), sig(1), sig(2)]).map((s) => s.id)).toEqual([1, 3]);
    expect(mergeSignals(seen, [sig(3)])).toEqual([]);
  });
});
