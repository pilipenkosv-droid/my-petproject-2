import { Star } from "lucide-react";

export interface WorkTypeTestimonial {
  name: string;
  university: string;
  workType: string;
  rating: number;
  text: string;
  avatar?: string;
}

interface WorkTypeTestimonialsProps {
  testimonials: WorkTypeTestimonial[];
}

export function WorkTypeTestimonials({
  testimonials,
}: WorkTypeTestimonialsProps) {
  if (testimonials.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="text-xl font-semibold text-foreground mb-6">
        Что говорят студенты
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {testimonials.map((t, i) => (
          <div
            key={i}
            className="bg-surface border border-surface-border p-5 flex flex-col"
          >
            <div className="flex gap-0.5 mb-3">
              {Array.from({ length: 5 }).map((_, starIdx) => (
                <Star
                  key={starIdx}
                  className={`w-3.5 h-3.5 ${
                    starIdx < t.rating
                      ? "text-amber-400 fill-amber-400"
                      : "text-muted-foreground"
                  }`}
                />
              ))}
            </div>

            <p className="text-sm text-on-surface-muted leading-relaxed flex-1 mb-4">
              &ldquo;{t.text}&rdquo;
            </p>

            <div className="flex items-center gap-3 pt-3 border-t border-surface-border">
              {t.avatar ? (
                <img
                  src={t.avatar}
                  alt={t.name}
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-foreground flex items-center justify-center text-background text-xs font-bold shrink-0">
                  {t.name.charAt(0)}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.university} · {t.workType}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
