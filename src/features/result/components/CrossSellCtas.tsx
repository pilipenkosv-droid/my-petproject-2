import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function CrossSellCtas() {
  return (
    <>
      {/* CTA: Повысить уникальность */}
      <Card className="border-border bg-muted">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Нужно повысить уникальность?
          </p>
          <Link href="/rewrite">
            <Button variant="outline" size="sm">
              Переписать текст для уникальности
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* CTA: Краткое содержание */}
      <Card className="border-border bg-surface">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Нужна аннотация к работе?
          </p>
          <Link href="/summarize">
            <Button variant="outline" size="sm">
              Создать аннотацию с помощью AI
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* CTA: Проверка грамматики */}
      <Card className="border-border bg-surface">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Хотите проверить текст на ошибки?
          </p>
          <Link href="/grammar">
            <Button variant="outline" size="sm">
              Проверить грамматику
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* CTA: Подбор литературы */}
      <Card className="border-border bg-surface">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Нужен список литературы?
          </p>
          <Link href="/sources">
            <Button variant="outline" size="sm">
              Подобрать источники
            </Button>
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
