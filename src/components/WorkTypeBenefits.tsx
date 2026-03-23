import { type LucideIcon } from "lucide-react";

export interface WorkTypeBenefit {
  icon: LucideIcon;
  title: string;
  stat: string;
  detail: string;
}

interface WorkTypeBenefitsProps {
  benefits: WorkTypeBenefit[];
}

export function WorkTypeBenefits({ benefits }: WorkTypeBenefitsProps) {
  return (
    <section className="mb-12">
      <div className="grid sm:grid-cols-3 gap-4">
        {benefits.map((benefit, index) => {
          const Icon = benefit.icon;
          return (
            <div
              key={index}
              className="bg-surface border border-surface-border p-5 text-center"
            >
              <Icon className="w-8 h-8 text-primary mx-auto mb-3" />
              <p className="text-2xl font-bold text-foreground mb-1">
                {benefit.stat}
              </p>
              <h3 className="font-medium text-foreground mb-1">
                {benefit.title}
              </h3>
              <p className="text-on-surface-subtle text-sm">{benefit.detail}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
