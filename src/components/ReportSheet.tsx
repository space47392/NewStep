import ActionSheet, { ActionSheetAction } from './ActionSheet';
import { submitReport } from '../lib/reports';
import { useToast } from '../contexts/ToastContext';
import { ReportReason, ReportTargetType } from '../types';

// Centralizes the report flow so every screen (post, comment, story, profile,
// message) reuses the exact same reason list and submit logic instead of
// each building its own — reuses the existing ActionSheet component as the
// reason picker, per the Step 7 plan.
const REASONS: { label: string; value: ReportReason }[] = [
  { label: 'Harassment or bullying', value: 'harassment' },
  { label: 'Spam', value: 'spam' },
  { label: 'Inappropriate content', value: 'inappropriate' },
  { label: 'Impersonation', value: 'impersonation' },
  { label: 'Hate or abusive behavior', value: 'hate' },
  { label: 'Other', value: 'other' },
];

type Props = {
  target: { type: ReportTargetType; id: string } | null;
  reporterId: string | undefined;
  onClose: () => void;
};

export default function ReportSheet({ target, reporterId, onClose }: Props) {
  const { showToast } = useToast();

  const handleSelectReason = async (reason: ReportReason) => {
    if (!target || !reporterId) return;
    try {
      await submitReport({ reporterId, targetType: target.type, targetId: target.id, reason });
      showToast('Report submitted — thank you for keeping NewStep safe');
    } catch {
      showToast('Could not submit report');
    }
  };

  const actions: ActionSheetAction[] = REASONS.map((r) => ({
    label: r.label,
    icon: 'flag-outline',
    onPress: () => handleSelectReason(r.value),
  }));

  return <ActionSheet visible={target !== null} onClose={onClose} actions={actions} />;
}
