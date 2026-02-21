import Link from "next/link";
import { Header } from "@/components/Header";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen relative">
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <Header />

      <div className="relative z-10 mx-auto max-w-md px-6 py-24 text-center">
        <Mascot
          src="/mascot/thinking.png"
          alt="Диплодок думает, куда делась страница"
          width={438}
          height={405}
          className="mx-auto mb-6 w-28 sm:w-36 md:w-44"
        />

        <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
        <p className="text-lg text-on-surface-muted mb-8">
          Страница не найдена — возможно, она переехала или была удалена
        </p>

        <Link href="/">
          <Button variant="outline" size="lg">
            <ArrowLeft className="w-4 h-4 mr-2" />
            На главную
          </Button>
        </Link>
      </div>
    </main>
  );
}
