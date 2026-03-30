"use client";

interface ReferralProgressBarProps {
  current: number;
  target: number;
  rewardMonths: number;
}

export function ReferralProgressBar({ current, target, rewardMonths }: ReferralProgressBarProps) {
  const clamped = Math.min(current, target);
  const percent = target > 0 ? Math.round((clamped / target) * 100) : 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-on-surface-subtle">
          {clamped} из {target} друзей — до {rewardMonths}{" "}
          {rewardMonths === 1 ? "мес." : rewardMonths < 5 ? "мес." : "мес."} Pro бесплатно
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
