import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export interface WorkTypeWorkflowStep {
  toolName: string;
  href: string;
  icon: LucideIcon;
  action: string;
}

interface WorkTypeWorkflowProps {
  steps: WorkTypeWorkflowStep[];
}

export function WorkTypeWorkflow({ steps }: WorkTypeWorkflowProps) {
  return (
    <section className="mb-12">
      <div className="flex items-center gap-3 mb-6">
        <ArrowRight className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">
          С чего начать
        </h2>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <Link
              key={step.href}
              href={step.href}
              className="flex items-center gap-4 bg-surface border border-surface-border p-4 transition-all duration-200 hover:border-purple-500/50 hover:bg-purple-500/5 group"
            >
              <span className="text-2xl font-bold text-muted-foreground/25 shrink-0 w-8 text-center tabular-nums transition-colors group-hover:text-purple-500/40">
                {index + 1}
              </span>

              <div className="w-10 h-10 bg-foreground flex items-center justify-center shrink-0 transition-colors duration-200 group-hover:bg-purple-600">
                <StepIcon className="w-5 h-5 text-background" />
              </div>

              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground text-sm transition-colors group-hover:text-purple-500">
                  {step.toolName}
                </span>
                <p className="text-xs text-on-surface-muted mt-0.5">
                  {step.action}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
