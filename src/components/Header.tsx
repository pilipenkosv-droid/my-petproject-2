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
  NavigationMenuTrigger,
  NavigationMenuContent,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  Menu,
  GraduationCap,
  BookOpen,
  Award,
  FileText,
  File,
  PenTool,
  ClipboardList,
  AlignLeft,
  ListTree,
  Layers,
  Wand2,
  SpellCheck,
  BookMarked,
  Bot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

interface HeaderProps {
  showBack?: boolean;
  backHref?: string;
}

type AccessType = "trial" | "one_time" | "subscription" | "admin" | "none";

interface NavLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface NavGroup {
  heading: string;
  links: NavLink[];
}

const workGroups: NavGroup[] = [
  {
    heading: "Выпускные",
    links: [
      { href: "/diplom", label: "Дипломная работа", description: "Оформление по ГОСТ", icon: GraduationCap },
      { href: "/vkr", label: "ВКР", description: "Выпускная квалификационная", icon: BookOpen },
      { href: "/magisterskaya", label: "Магистерская", description: "Диссертация магистра", icon: Award },
    ],
  },
  {
    heading: "Учебные",
    links: [
      { href: "/kursovaya", label: "Курсовая работа", description: "Оформление курсовой", icon: FileText },
      { href: "/referat", label: "Реферат", description: "Реферат по стандартам", icon: File },
      { href: "/esse", label: "Эссе", description: "Эссе и сочинения", icon: PenTool },
      { href: "/otchet-po-praktike", label: "Отчёт по практике", description: "Отчёт и дневник", icon: ClipboardList },
    ],
  },
];

const toolGroups: NavGroup[] = [
  {
    heading: "Оформление",
    links: [
      { href: "/create", label: "Форматирование", description: "Автоформат по ГОСТу", icon: AlignLeft },
      { href: "/outline", label: "Генератор плана", description: "Структура и содержание", icon: ListTree },
    ],
  },
  {
    heading: "Текст",
    links: [
      { href: "/summarize", label: "Краткое содержание", description: "Суммаризация текста", icon: Layers },
      { href: "/rewrite", label: "Уникальность", description: "Рерайт для антиплагиата", icon: Wand2 },
      { href: "/grammar", label: "Грамматика", description: "Орфография и пунктуация", icon: SpellCheck },
      { href: "/sources", label: "Литература", description: "Поиск научных источников", icon: BookMarked },
    ],
  },
  {
    heading: "Новинка",
    links: [
      { href: "/bot", label: "AI-напарник", description: "Telegram-бот для студентов", icon: Bot },
    ],
  },
];

// Flat arrays for mobile menu
const workLinks = workGroups.flatMap((g) => g.links);
const toolLinks = toolGroups.flatMap((g) => g.links);

export function Header({ showBack = false, backHref = "/" }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();
  const [accessType, setAccessType] = useState<AccessType | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
  const isPro = accessType === "subscription" || accessType === "admin";

  if (!mounted) {
    return (
      <>
        <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 shadow-sm h-[44px]" />
        </header>
        <div className="h-20" aria-hidden="true" />
      </>
    );
  }

  return (
    <>
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 shadow-sm">
        {/* Left: Back + Logo */}
        <div className="flex items-center gap-4">
          {showBack && (
            <Link
              href={backHref}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-surface-border text-on-surface-muted hover:text-foreground hover:bg-surface-hover transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <Link href="/" className="group flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Logo variant="favicon" size={28} withText />
          </Link>
        </div>

        {/* Center: Navigation (desktop) */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Работы</NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid gap-x-6 gap-y-1 p-4 md:grid-cols-2 md:w-[480px]">
                  {workGroups.map((group) => (
                    <div key={group.heading}>
                      <h5 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.heading}
                      </h5>
                      <ul className="space-y-0.5">
                        {group.links.map((link) => (
                          <li key={link.href}>
                            <NavigationMenuLink asChild>
                              <Link
                                href={link.href}
                                className="group/item flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-surface-hover"
                              >
                                <link.icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover/item:text-foreground transition-colors" />
                                <div>
                                  <div className="font-medium text-foreground leading-tight">{link.label}</div>
                                  <p className="text-xs text-muted-foreground leading-tight">{link.description}</p>
                                </div>
                              </Link>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Инструменты</NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid gap-x-6 gap-y-1 p-4 md:grid-cols-2 md:w-[480px]">
                  {toolGroups.map((group) => (
                    <div key={group.heading}>
                      <h5 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.heading}
                      </h5>
                      <ul className="space-y-0.5">
                        {group.links.map((link) => (
                          <li key={link.href}>
                            <NavigationMenuLink asChild>
                              <Link
                                href={link.href}
                                className={`group/item flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors ${link.href === "/bot" ? "bg-purple-500/10 hover:bg-purple-500/20" : "hover:bg-surface-hover"}`}
                              >
                                <link.icon className={`h-4 w-4 shrink-0 transition-colors ${link.href === "/bot" ? "text-purple-400 group-hover/item:text-purple-300" : "text-muted-foreground group-hover/item:text-foreground"}`} />
                                <div>
                                  <div className="font-medium text-foreground leading-tight">{link.label}</div>
                                  <p className="text-xs text-muted-foreground leading-tight">{link.description}</p>
                                </div>
                              </Link>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </NavigationMenuContent>
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
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden md:flex items-center rounded-full p-1 cursor-pointer hover:bg-surface-hover transition-colors">
                  {isPro ? (
                    <div className="p-[2px] rounded-full bg-gradient-to-br from-purple-500 to-indigo-500">
                      <Avatar className="h-8 w-8 ring-[2px] ring-background">
                        {avatarUrl && <AvatarImage src={avatarUrl} alt={user.email || ""} />}
                        <AvatarFallback className="text-primary-foreground text-xs bg-primary">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  ) : (
                    <Avatar className="h-8 w-8">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt={user.email || ""} />}
                      <AvatarFallback className="text-primary-foreground text-xs bg-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate max-w-[160px]">{user.email}</p>
                    {isPro && (
                      <span className="pro-badge flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
                        <Crown className="h-2.5 w-2.5" />
                        PRO
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
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
                <Button size="sm" className="bg-foreground text-background rounded-full hover:bg-foreground/90">
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

            <SheetContent side="right" className="bg-background w-[300px] sm:max-w-[350px] flex flex-col border-l-surface-border">
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
                      {isPro ? (
                        <div className="p-[2px] rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 shrink-0">
                          <Avatar className="h-9 w-9 ring-[2px] ring-background">
                            {avatarUrl && <AvatarImage src={avatarUrl} alt={user.email || ""} />}
                            <AvatarFallback className="text-primary-foreground text-xs bg-primary">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      ) : (
                        <Avatar className="h-9 w-9 shrink-0">
                          {avatarUrl && <AvatarImage src={avatarUrl} alt={user.email || ""} />}
                          <AvatarFallback className="text-primary-foreground text-xs bg-primary">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      )}
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
    <div className="h-20" aria-hidden="true" />
    </>
  );
}
