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
import { ArrowLeft, LogIn, User, LogOut, Crown, UserPlus } from "lucide-react";
import { Logo } from "@/components/Logo";

interface HeaderProps {
  showBack?: boolean;
  backHref?: string;
}

type AccessType = "trial" | "one_time" | "subscription" | "none";

export function Header({ showBack = false, backHref = "/" }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();
  const [accessType, setAccessType] = useState<AccessType | null>(null);

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
  const isLanding = pathname === "/";

  return (
    <header className="relative z-10 border-b border-white/10 bg-white/5 backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        {/* Left: Back + Logo */}
        <div className="flex items-center gap-4">
          {showBack && (
            <Link
              href={backHref}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
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

        {/* Center: Navigation */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                <Link href="/">Главная</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            {isLanding ? (
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <a href="#how-it-works">Как это работает</a>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : (
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <Link href="/#how-it-works">Как это работает</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            )}
            <NavigationMenuItem>
              <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                <Link href="/pricing">Тарифы</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Right: Auth UI */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/10 transition-colors">
                  {isPro && (
                    <span className="pro-badge flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold">
                      <Crown className="h-3 w-3" />
                      PRO
                    </span>
                  )}
                  <Avatar className={`h-8 w-8 ${isPro ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-transparent" : ""}`}>
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={user.email || ""} />}
                    <AvatarFallback className={`text-white text-xs ${isPro ? "bg-gradient-to-br from-violet-600 to-indigo-600" : "bg-violet-600"}`}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-white/70 hidden sm:block max-w-[150px] truncate">
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
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login?mode=signup">
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white">
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
        </div>
      </div>
    </header>
  );
}
