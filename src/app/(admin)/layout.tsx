"use client";

import React, { useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { 
  Database, 
  LayoutDashboard, 
  FolderKanban, 
  KanbanSquare, 
  CalendarClock,
  LogOut, 
  Menu, 
  X,
  User as UserIcon,
  Users,
  Shield,
  Sliders,
  HelpCircle
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, logout, hasPermission } = useAuthContext();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Calcula itens de navegação baseados nas permissões do usuário
  const getNavItems = () => {
    const items = [];
    
    // O Dashboard é exibido para admin e analista
    if (profile?.role !== "cliente") {
      items.push({ name: "Dashboard", href: "/", icon: LayoutDashboard });
      items.push({ name: "Ajuda", href: "/help", icon: HelpCircle });
    }

    if (hasPermission("projects", "read")) {
      items.push({ name: "Projetos", href: "/projects", icon: FolderKanban });
    }

    if (hasPermission("activities", "read")) {
      items.push({ name: "Atividades", href: "/activities", icon: KanbanSquare });
    }

    if (hasPermission("routines", "read")) {
      items.push({ name: "Rotinas", href: "/routines", icon: CalendarClock });
    }

    if (hasPermission("users", "read")) {
      items.push({ name: "Usuários", href: "/users", icon: Users });
    }

    if (hasPermission("permissions", "read")) {
      items.push({ name: "Permissões", href: "/permissions", icon: Shield });
    }

    if (hasPermission("registrations", "read")) {
      items.push({ name: "Cadastros", href: "/registrations", icon: Sliders });
    }

    return items;
  };

  const navItems = getNavItems();

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "analista":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "cliente":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans w-full overflow-x-hidden">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-zinc-800/80 bg-zinc-900/40 backdrop-blur-xl transition-all duration-300 w-16 hover:w-56 group z-30 overflow-hidden">
        {/* Header/Logo */}
        <div className="flex h-16 items-center gap-3 px-5 border-b border-zinc-800/80 transition-all duration-300 overflow-hidden">
          <Database className="h-6 w-6 text-emerald-400 shrink-0" />
          <span className="font-bold text-lg tracking-wider text-white opacity-0 group-hover:opacity-100 transition-opacity duration-350 whitespace-nowrap">ACAUÃ</span>
          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-350 whitespace-nowrap">v3.0</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-6 transition-all duration-300">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200 cursor-pointer overflow-hidden ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-400"
                    : "text-zinc-400 hover:bg-zinc-900/60 hover:text-white"
                }`}
              >
                <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-emerald-400" : "text-zinc-400 group-hover:text-white"}`} />
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-350 whitespace-nowrap">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Profile & Logout */}
        <div className="border-t border-zinc-800/80 p-2.5 bg-zinc-950/20 transition-all duration-300 overflow-hidden">
          <div className="flex items-center gap-3 px-1.5 py-2">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="h-9 w-9 rounded-full border border-zinc-800 object-cover shrink-0"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-850 bg-zinc-900 text-zinc-400 shrink-0">
                <UserIcon className="h-4 w-4" />
              </div>
            )}
            <div className="flex-1 min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-350">
              <p className="text-xs font-semibold text-white truncate">{profile?.full_name}</p>
              <p className="text-[10px] text-zinc-500 truncate">{profile?.email}</p>
              <span className={`inline-block mt-1 text-[9px] font-mono px-1.5 py-0.2 rounded border ${getRoleBadgeColor(profile?.role || "analista")}`}>
                {(profile?.role || "analista").toUpperCase()}
              </span>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-850 bg-zinc-900/60 py-2.5 text-xs font-semibold text-zinc-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all duration-200 cursor-pointer overflow-hidden whitespace-nowrap"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-350">Sair da Conta</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-16 w-full min-w-0 overflow-x-hidden">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between px-6 border-b border-zinc-800/80 bg-zinc-950 md:hidden sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-emerald-400" />
            <span className="font-bold tracking-wider text-white">ACAUÃ</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-zinc-400 hover:text-white focus:outline-none cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <aside className="relative flex w-64 flex-col bg-zinc-900 border-r border-zinc-800 p-4 text-zinc-100">
              <div className="flex h-12 items-center gap-2 border-b border-zinc-800 mb-6">
                <Database className="h-5 w-5 text-emerald-400" />
                <span className="font-bold tracking-wider text-white">ACAUÃ</span>
              </div>
              <nav className="flex-grow space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-400"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-zinc-800 pt-4 mt-auto">
                <div className="flex items-center gap-3 px-2 py-2">
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt="Avatar"
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                      <UserIcon className="h-4 w-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{profile?.full_name}</p>
                    <span className={`inline-block mt-0.5 text-[8px] font-mono px-1 rounded border ${getRoleBadgeColor(profile?.role || "analista")}`}>
                      {(profile?.role || "analista").toUpperCase()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => logout()}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-2.5 text-xs font-semibold text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Content Wrapper */}
        <main className="flex-1 p-6 md:p-8 max-w-none w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
