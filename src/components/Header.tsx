"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  LogIn,
  User,
  LogOut,
  Crown,
  UserPlus,
  ChevronDown,
  Sparkles,
  Menu,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

interface HeaderProps {
  showBack?: boolean;
  backHref?: string;
}

type AccessType = "trial" | "one_time" | "subscription" | "none";

const workLinks = [
  { href: "/diplom", label: "Дипломная работа" },
  { href: "/vkr", label: "ВКР" },
  { href: "/magisterskaya", label: "Магистерская диссертация" },
  { href: "/kursovaya", label: "Курсовая работа" },
  { href: "/referat", label: "Реферат" },
  { href: "/esse", label: "Эссе" },
  { href: "/otchet-po-praktike", label: "Отчёт по практике" },
];

const toolLinks = [
  { href: "/create", label: "Форматирование по ГОСТу" },
  { href: "/outline", label: "Генератор плана" },
];

export function Header({ showBack = false, backHref = "/" }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();
  const [accessType, setAccessType] = useState<AccessType | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sheet on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) {
      setAccessType(null);
      return;
    }

    fetch("/api/user/access")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.accessType) setAccessType(data.accessType);
      })
      .catch(() => {});
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "??";

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const isPro = accessType === "subscription";

  return (
    <header className="relative z-10 border-b border-surface-border bg-surface backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        {/* Left: Back + Logo */}
        <div className="flex items-center gap-4">
          {showBack && (
            <Link
              href={backHref}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface border border-surface-border text-on-surface-muted hover:text-foreground hover:bg-surface-hover transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <Link href="/" className="group flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Logo variant="favicon" size={28} withText />
            <sup className="ml-0.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gradient-to-r from-violet-600 to-indigo-600 text-white/90 leading-none">
              beta
            </sup>
          </Link>
        </div>

        {/* Center: Navigation (desktop) */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`${navigationMenuTriggerStyle()} flex items-center gap-1`}>
                    Работы
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {workLinks.map((link) => (
                    <DropdownMenuItem key={link.href} asChild>
                      <Link href={link.href}>{link.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`${navigationMenuTriggerStyle()} flex items-center gap-1`}>
                    Инструменты
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {toolLinks.map((link) => (
                    <DropdownMenuItem key={link.href} asChild>
                      <Link href={link.href}>{link.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                <Link href="/pricing">Тарифы</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                <Link href="/blog">Блог</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                <Link href="/faq">FAQ</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Right: Theme Toggle + Auth UI + Mobile Menu */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-surface-hover animate-pulse" />
          ) : user ? (
            <>
              {/* "Начать" button for authenticated users */}
              <Link href="/create">
                <Button variant="glow" size="sm">
                  <Sparkles className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Начать</span>
                </Button>
              </Link>
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden md:flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-hover transition-colors">
                  {isPro && (
                    <span className="pro-badge flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold">
                      <Crown className="h-3 w-3" />
                      PRO
                    </span>
                  )}
                  <Avatar className={`h-8 w-8 ${isPro ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-transparent" : ""}`}>
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={user.email || ""} />}
                    <AvatarFallback className={`text-primary-foreground text-xs ${isPro ? "bg-gradient-to-br from-violet-600 to-indigo-600" : "bg-violet-600"}`}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-on-surface-muted hidden sm:block max-w-[150px] truncate">
                    {user.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  Профиль
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Link href="/login?mode=signup">
                <Button variant="ghost" size="sm" className="text-on-surface-muted hover:text-foreground">
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">Регистрация</span>
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="sm">
                  <LogIn className="mr-1.5 h-4 w-4" />
                  Войти
                </Button>
              </Link>
            </div>
          )}

          {/* Mobile: hamburger menu button */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 rounded-lg"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть меню"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <SheetContent side="right" className="bg-surface w-[300px] sm:max-w-[350px] flex flex-col">
              <SheetHeader className="border-b border-surface-border pb-4">
                <SheetTitle className="text-foreground">Меню</SheetTitle>
              </SheetHeader>

              {/* Navigation links */}
              <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
                {/* Работы section */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Работы
                  </p>
                  <div className="space-y-1">
                    {workLinks.map((link) => (
                      <SheetClose key={link.href} asChild>
                        <Link
                          href={link.href}
                          className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-hover transition-colors"
                        >
                          {link.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </div>
                </div>

                {/* Инструменты section */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Инструменты
                  </p>
                  <div className="space-y-1">
                    {toolLinks.map((link) => (
                      <SheetClose key={link.href} asChild>
                        <Link
                          href={link.href}
                          className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-hover transition-colors"
                        >
                          {link.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </div>
                </div>

                {/* Direct links */}
                <div className="space-y-1 border-t border-surface-border pt-4">
                  <SheetClose asChild>
                    <Link
                      href="/pricing"
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
                    >
                      Тарифы
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/blog"
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
                    >
                      Блог
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/faq"
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
                    >
                      FAQ
                    </Link>
                  </SheetClose>
                </div>
              </nav>

              {/* Footer: Theme toggle + Auth */}
              <SheetFooter className="border-t border-surface-border pt-4">
                <div className="flex items-center justify-between w-full mb-3">
                  <span className="text-sm text-muted-foreground">Тема</span>
                  <ThemeToggle />
                </div>

                {isLoading ? (
                  <div className="w-full h-10 rounded-lg bg-surface-hover animate-pulse" />
                ) : user ? (
                  <div className="space-y-3 w-full">
                    {/* User info */}
                    <div className="flex items-center gap-3 px-1">
                      <Avatar className={`h-9 w-9 ${isPro ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-transparent" : ""}`}>
                        {avatarUrl && <AvatarImage src={avatarUrl} alt={user.email || ""} />}
                        <AvatarFallback className={`text-primary-foreground text-xs ${isPro ? "bg-gradient-to-br from-violet-600 to-indigo-600" : "bg-violet-600"}`}>
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isPro && (
                            <span className="pro-badge flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold">
                              <Crown className="h-3 w-3" />
                              PRO
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <SheetClose asChild>
                        <Link href="/profile" className="flex-1">
                          <Button variant="outline" size="sm" className="w-full">
                            <User className="mr-1.5 h-4 w-4" />
                            Профиль
                          </Button>
                        </Link>
                      </SheetClose>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={handleSignOut}
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 w-full">
                    <SheetClose asChild>
                      <Link href="/login?mode=signup" className="flex-1">
                        <Button variant="ghost" size="sm" className="w-full text-on-surface-muted hover:text-foreground">
                          <UserPlus className="mr-1.5 h-4 w-4" />
                          Регистрация
                        </Button>
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/login" className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <LogIn className="mr-1.5 h-4 w-4" />
                          Войти
                        </Button>
                      </Link>
                    </SheetClose>
                  </div>
                )}
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
