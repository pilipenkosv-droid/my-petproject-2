import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getJobsByUser } from "@/lib/storage/job-store";
import { getUserAccess } from "@/lib/payment/access";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle, XCircle, Clock, ArrowRight, Crown, Zap, CreditCard, ChevronDown, FileCheck, FileText, Sparkles } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { VerifyPaymentsButton } from "@/components/VerifyPaymentsButton";

export default async function ProfilePage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [jobs, access] = await Promise.all([
    getJobsByUser(user.id),
    getUserAccess(user.id),
  ]);

  const completedJobs = jobs.filter((j) => j.status === "completed");
  const totalJobs = jobs.length;

  // Вычисление оставшегося времени хранения (24 часа)
  const getTimeRemaining = (createdAt: Date): string => {
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) return "Истекло";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}ч ${minutes}мин`;
    return `${minutes}мин`;
  };

  return (
    <main className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />

      <Header showBack backHref="/create" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
        {/* User info */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-bold">
              <span className="gradient-text">Профиль</span>
            </h2>
            {(access.accessType === "subscription" || access.accessType === "admin") && (
              <span className="pro-badge flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold">
                <Crown className="h-3.5 w-3.5" />
                PRO
              </span>
            )}
          </div>
          <p className="text-on-surface-subtle">{user.email}</p>
        </div>

        {/* Access info card */}
        <Card className={`mb-8 ${access.accessType === "subscription" || access.accessType === "admin" ? "border-violet-500/30 bg-violet-500/5" : ""}`}>
          <CardContent className="pt-6">
            {access.accessType === "admin" ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                    <Crown className="h-5 w-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">Pro — безлимитный доступ</p>
                    <p className="text-sm text-on-surface-muted">
                      Неограниченное количество обработок
                    </p>
                  </div>
                </div>
                <span className="text-sm text-violet-400 font-medium">Активна</span>
              </div>
            ) : access.accessType === "subscription" ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                    <Crown className="h-5 w-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">Подписка Pro</p>
                    <p className="text-sm text-on-surface-muted">
                      Осталось: {access.remainingUses} из 10 обработок · до{" "}
                      {access.subscriptionActiveUntil
                        ? new Date(access.subscriptionActiveUntil).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "—"}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-violet-400 font-medium">Активна</span>
              </div>
            ) : access.accessType === "one_time" ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center">
                    <Zap className="h-5 w-5 text-on-surface-muted" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">Разовые обработки</p>
                    <p className="text-sm text-on-surface-muted">
                      Осталось: {access.remainingUses}{" "}
                      {access.remainingUses === 1 ? "обработка" : access.remainingUses >= 2 && access.remainingUses <= 4 ? "обработки" : "обработок"}
                    </p>
                  </div>
                </div>
                <Link href="/pricing">
                  <Button variant="outline" size="sm">
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Купить ещё
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center">
                    <Zap className="h-5 w-5 text-on-surface-muted" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">Нет активного тарифа</p>
                    <p className="text-sm text-on-surface-muted">Выберите подходящий план</p>
                  </div>
                </div>
                <Link href="/pricing">
                  <Button variant="glow" size="sm">
                    Выбрать тариф
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verify pending payments */}
        {access.accessType !== "subscription" && access.accessType !== "admin" && (
          <div className="mb-8 -mt-4">
            <VerifyPaymentsButton />
          </div>
        )}

        {/* Quick action button */}
        <div className="mb-8 flex justify-end">
          <Link href="/create">
            <Button variant="glow">
              <Sparkles className="h-4 w-4 mr-2" />
              Обработать документ
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-foreground">{totalJobs}</div>
              <p className="text-sm text-on-surface-subtle">Всего обработок</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-400">{completedJobs.length}</div>
              <p className="text-sm text-on-surface-subtle">Успешных</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-on-surface-muted">
                {totalJobs - completedJobs.length}
              </div>
              <p className="text-sm text-on-surface-subtle">В процессе / ошибки</p>
            </CardContent>
          </Card>
        </div>

        {/* Job history */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              История обработок
            </CardTitle>
            <CardDescription>
              Ваши обработанные документы
            </CardDescription>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <div className="text-center py-12">
                <Mascot
                  src="/mascot/sleeping.png"
                  alt="Диплодок спит на бумагах"
                  width={474}
                  height={311}
                  className="mx-auto mb-4 w-32 sm:w-56 md:w-auto"
                />
                <p className="text-on-surface-muted mb-4">
                  У вас пока нет обработанных документов
                </p>
                <Link href="/create">
                  <Button>
                    Обработать документ
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg bg-surface border border-surface-border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Status icon */}
                      {job.status === "completed" ? (
                        <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                      ) : job.status === "failed" ? (
                        <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                      ) : (
                        <Clock className="h-5 w-5 text-yellow-400 shrink-0" />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate max-w-[200px] sm:max-w-none">
                          {job.sourceOriginalName || "Документ"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.createdAt.toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {job.status === "completed" && (
                          <p className="text-xs text-amber-400/70 flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            Осталось: {getTimeRemaining(job.createdAt)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
                      {job.status === "completed" && (
                        <>
                          {(job.formattedDocumentId || job.markedOriginalId) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Download className="h-3 w-3 mr-1" />
                                  Скачать
                                  <ChevronDown className="h-3 w-3 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {job.formattedDocumentId && (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/api/download/${job.formattedDocumentId}`} className="flex items-center">
                                      <FileCheck className="h-4 w-4 mr-2 text-green-400" />
                                      Исправленный документ
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                {job.markedOriginalId && (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/api/download/${job.markedOriginalId}`} className="flex items-center">
                                      <FileText className="h-4 w-4 mr-2 text-amber-400" />
                                      С пометками (ошибки)
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <Link href={`/result/${job.id}`}>
                            <Button variant="ghost" size="sm">
                              Подробнее
                            </Button>
                          </Link>
                        </>
                      )}
                      {job.status === "awaiting_confirmation" && (
                        <Link href={`/confirm-rules/${job.id}`}>
                          <Button variant="outline" size="sm">
                            Продолжить
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
