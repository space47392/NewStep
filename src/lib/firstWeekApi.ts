import { supabase } from './supabase';
import type { FirstWeekStatus, ManualStep } from './firstWeek';

export async function fetchFirstWeekStatus(): Promise<FirstWeekStatus> {
  const { data, error } = await supabase.rpc('first_week_status');
  if (error) throw error;
  return data as FirstWeekStatus;
}

export async function setFirstWeekStep(step: ManualStep, done = true): Promise<void> {
  const { error } = await supabase.rpc('set_first_week_step', { p_step: step, p_done: done });
  if (error) throw error;
}
