"use client";

import React, { useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { Database, ShieldAlert, Mail, Lock, User, Sparkles } from "lucide-react";
import { isEmulatorActive } from "@/lib/firebase/client";

export default function LoginPage() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, loading, error: authError } = useAuthContext();
  
  // Abas e Formulário
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const error = localError || authError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim() || !password.trim()) {
      setLocalError("Preencha todos os campos obrigatórios.");
      return;
    }

    if (!email.endsWith("@uefs.br") && email !== "admin@ngd.com" && !isEmulatorActive) {
      setLocalError("Apenas e-mails institucionais @uefs.br são permitidos.");
      return;
    }

    if (password.length < 6) {
      setLocalError("A senha deve conter pelo menos 6 caracteres.");
      return;
    }

    if (isRegister) {
      if (!fullName.trim()) {
        setLocalError("Digite seu nome completo para se cadastrar.");
        return;
      }
      await registerWithEmail(email, password, fullName);
    } else {
      await loginWithEmail(email, password);
    }
  };

  const handleGoogleLogin = async () => {
    setLocalError(null);
    await loginWithGoogle();
  };

  const isEmulator = isEmulatorActive;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 to-zinc-950 flex items-start justify-center p-6 py-10">
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-8 backdrop-blur-xl shadow-2xl">
        {/* Glow Effects */}
        <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

        {/* Content */}
        <div className="relative flex flex-col items-center">
          {/* Logo Icon */}
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/80 text-emerald-400 shadow-md">
            <Database className="h-7 w-7" />
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-white text-center">
            Sistema Acauã
          </h1>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 text-center">
            Núcleo de Gestão de Dados • UEFS
          </p>

          {/* Selector Tabs */}
          <div className="mt-6 flex w-full rounded-lg bg-zinc-950/60 p-1 border border-zinc-850">
            <button
              onClick={() => {
                setIsRegister(false);
                setLocalError(null);
              }}
              className={`flex-1 rounded-md py-2 text-xs font-semibold transition-all cursor-pointer ${
                !isRegister 
                  ? "bg-zinc-800 text-white shadow" 
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => {
                setIsRegister(true);
                setLocalError(null);
              }}
              className={`flex-1 rounded-md py-2 text-xs font-semibold transition-all cursor-pointer ${
                isRegister 
                  ? "bg-zinc-800 text-white shadow" 
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Cadastrar
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 w-full space-y-4">
            {isRegister && (
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: João Silva"
                    required
                    className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-zinc-800 bg-zinc-950/40 text-white placeholder-zinc-650 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                E-mail Institucional
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu-usuario@uefs.br"
                  required
                  className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-zinc-800 bg-zinc-950/40 text-white placeholder-zinc-650 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-zinc-800 bg-zinc-950/40 text-white placeholder-zinc-650 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-red-900/30 bg-red-950/20 p-3.5 text-left text-xs text-red-400">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-450 hover:to-teal-550 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-white" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>{isRegister ? "Criar Minha Conta" : "Entrar no Sistema"}</span>
                </>
              )}
            </button>
          </form>

          {/* Google Login — sempre visível; em produção usa OAuth real, em emulador usa mock local */}
          <div className="w-full">
            <div className="my-6 flex items-center justify-between">
              <hr className="w-full border-zinc-800" />
              <span className="px-3 text-[10px] uppercase font-bold text-zinc-600 tracking-wider shrink-0">
                Ou
              </span>
              <hr className="w-full border-zinc-800" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/30 px-5 py-2.5 text-xs font-semibold text-zinc-300 transition-all hover:bg-zinc-950/60 hover:text-white active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>
                {isEmulator 
                  ? "Entrar com Google (Emulador local)" 
                  : "Entrar com conta Google institucional"}
              </span>
            </button>
          </div>

          <span className="mt-8 text-[9px] tracking-wide text-zinc-650 text-center leading-relaxed max-w-[280px]">
            {isEmulator 
              ? "Modo emulador ativo. Restrição do domínio @uefs.br suspensa para testes locais."
              : "Acesso e cadastro restritos a e-mails institucionais @uefs.br."
            }
          </span>
        </div>
      </div>
    </div>
  );
}
