"use client";

interface ReferralProgressBarProps {
  current: number;
  target: number;
  rewardDescription: string;
}

export function ReferralProgressBar({ current, target, rewardDescription }: ReferralProgressBarProps) {
  const clamped = Math.min(current, target);
  const percent = target > 0 ? Math.round((clamped / target) * 100) : 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-on-surface-subtle">
          {clamped} из {target} — {rewardDescription}
        </span>
        <span className="text-on-surface-muted text-xs">{percent}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-hover overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, backgroundColor: "#7c3aed" }}
        />
      </div>
    </div>
  );
}
