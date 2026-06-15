"use client";

import React, { useEffect, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import { doc, getDoc, writeBatch, onSnapshot } from "firebase/firestore";
import { 
  Sliders, 
  Clock, 
  Check, 
  AlertTriangle, 
  ShieldAlert,
  Save,
  ArrowLeft
} from "lucide-react";
import Link from "next/link";

interface SystemSettings {
  expected_hours_month: number;
  updated_at?: string;
  updated_by?: string;
}

export default function ParametersPage() {
  const { profile, user } = useAuthContext();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [expectedHoursInput, setExpectedHoursInput] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Restrição de acesso: Apenas administradores
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }

    // Escuta em tempo real o documento de configurações gerais
    const unsubscribe = onSnapshot(
      doc(db, "settings", "general"),
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data() as SystemSettings;
          setSettings(data);
          setExpectedHoursInput(String(data.expected_hours_month));
        } else {
          // Se não existir, tenta ler do metrics/global para manter a compatibilidade retrospectiva
          try {
            const metricsRef = doc(db, "metrics", "global");
            const metricsSnap = await getDoc(metricsRef);
            const currentExpected = metricsSnap.exists() 
              ? metricsSnap.data().expected_hours_month || 160 
              : 160;

            const initialSettings: SystemSettings = {
              expected_hours_month: currentExpected,
            };
            setSettings(initialSettings);
            setExpectedHoursInput(String(currentExpected));
          } catch (err) {
            console.error("Erro ao recuperar fallback do metrics/global:", err);
            setSettings({ expected_hours_month: 160 });
            setExpectedHoursInput("160");
          }
        }
        setLoading(false);
      },
      (err) => {
        console.error("Erro ao escutar settings/general:", err);
        setStatusMessage({ type: "error", text: "Erro ao carregar as configurações do banco de dados." });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;

    const parsedHours = parseInt(expectedHoursInput, 10);
    if (isNaN(parsedHours) || parsedHours <= 0) {
      setStatusMessage({ type: "error", text: "A quantidade de horas deve ser um número inteiro maior que zero." });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();

      // 1. Salva na nova estrutura de parâmetros em settings/general
      const settingsRef = doc(db, "settings", "general");
      batch.set(settingsRef, {
        expected_hours_month: parsedHours,
        updated_at: timestamp,
        updated_by: user.email || "admin"
      }, { merge: true });

      // 2. Salva de forma sincronizada em metrics/global para retrocompatibilidade no Dashboard
      const metricsRef = doc(db, "metrics", "global");
      batch.set(metricsRef, {
        expected_hours_month: parsedHours,
        last_updated: timestamp
      }, { merge: true });

      await batch.commit();
      
      setStatusMessage({ type: "success", text: "Configurações salvas e aplicadas com sucesso em todo o sistema!" });
    } catch (err) {
      console.error("Erro ao salvar parâmetros no Firestore:", err);
      setStatusMessage({ type: "error", text: "Ocorreu um erro ao tentar salvar as configurações. Verifique sua conexão." });
    } finally {
      setIsSaving(false);
    }
  };

  // 1. Tela de Carregamento
  if (loading) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-emerald-500"></div>
        <p className="mt-4 text-xs font-semibold text-zinc-500 uppercase tracking-widest">
          Carregando Parâmetros do Sistema...
        </p>
      </div>
    );
  }

  // 2. Tela de Acesso Negado (Se não for Admin)
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto text-center px-4 py-8">
        <div className="h-16 w-16 flex items-center justify-center rounded-full bg-red-500/10 text-red-500 border border-red-500/20 mb-6 animate-pulse">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Acesso Restrito</h1>
        <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
          Desculpe, você não possui permissões administrativas para gerenciar ou visualizar os parâmetros globais do sistema.
        </p>
        <Link 
          href="/" 
          className="mt-6 flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-lg text-xs transition duration-300"
          id="back_to_dashboard_btn"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar ao Dashboard
        </Link>
      </div>
    );
  }

  // 3. Renderização Principal (Admin)
  return (
    <div className="space-y-6 max-w-4xl">
      {/* HEADER */}
      <div className="flex flex-col gap-2 border-b border-zinc-800/60 pb-5">
        <div className="flex items-center gap-2">
          <Link 
            href="/" 
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-850 text-zinc-450 hover:text-white transition duration-200"
            title="Voltar ao Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Sliders className="h-7 w-7 text-emerald-500" />
            Parâmetros Gerais do Sistema
          </h1>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed ml-9">
          Configurações estruturais do NGD. As alterações feitas aqui afetam diretamente o cálculo de metas, FTE e ociosidade no dashboard.
        </p>
      </div>

      {/* ALERTAS DE STATUS */}
      {statusMessage && (
        <div 
          className={`flex items-start gap-3 p-4 rounded-xl border ${
            statusMessage.type === "success" 
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
              : "bg-red-500/10 border-red-500/20 text-red-400"
          } transition duration-300`}
          id="status_message"
        >
          {statusMessage.type === "success" ? (
            <Check className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <div className="text-sm">
            <p className="font-bold">{statusMessage.type === "success" ? "Sucesso!" : "Atenção"}</p>
            <p className="mt-1 opacity-90">{statusMessage.text}</p>
          </div>
        </div>
      )}

      {/* CONTEÚDO CONFIG */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* FORMULÁRIO PRINCIPAL */}
        <div className="md:col-span-2 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 backdrop-blur-md">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-2">
              <label 
                htmlFor="expected_hours_input" 
                className="block text-xs font-bold uppercase tracking-wider text-zinc-400"
              >
                Carga Horária Mensal Disponível (Capacidade Esperada)
              </label>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Define o valor padrão de horas disponíveis para trabalho durante o mês. É a base de cálculo de todos os indicadores de capacidade e FTE mensal na ausência de filtros individuais de equipe.
              </p>
              <div className="relative mt-2 max-w-xs rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Clock className="h-4 w-4 text-zinc-550" />
                </div>
                <input
                  type="number"
                  name="expected_hours"
                  id="expected_hours_input"
                  min="1"
                  step="1"
                  value={expectedHoursInput}
                  onChange={(e) => setExpectedHoursInput(e.target.value)}
                  className="block w-full rounded-xl border border-zinc-800 bg-zinc-950/50 py-3 pl-10 pr-12 text-sm text-white placeholder-zinc-650 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
                  placeholder="Ex: 160"
                  required
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <span className="text-xs font-bold text-zinc-500 uppercase">horas</span>
                </div>
              </div>
            </div>

            {settings?.updated_at && (
              <div className="text-[10px] text-zinc-500 border-t border-zinc-805 pt-4">
                Última alteração em: <span className="font-bold text-zinc-400">{new Date(settings.updated_at).toLocaleString("pt-BR")}</span> por <span className="font-bold text-zinc-400">{settings.updated_by || "Administrador"}</span>
              </div>
            )}

            <div className="border-t border-zinc-805 pt-5 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold px-5 py-2.5 rounded-xl text-xs transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                id="save_settings_btn"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Salvando..." : "Salvar Configurações"}
              </button>
            </div>
          </form>
        </div>

        {/* PAINEL INFORMATIVO LATERAL */}
        <div className="bg-zinc-950/20 border border-zinc-850 rounded-2xl p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-emerald-500" />
            Impacto no Sistema
          </h2>
          <div className="space-y-3.5 text-xs text-zinc-400 leading-relaxed">
            <p>
              Ao alterar este parâmetro, as seguintes rotinas serão influenciadas:
            </p>
            <div className="space-y-2.5 pl-2 border-l border-zinc-800">
              <div>
                <span className="font-bold text-white block">FTE Efetivo Mensal</span>
                Representa a conversão da carga horária de projetos pelo referencial mensal configurado.
              </div>
              <div>
                <span className="font-bold text-white block">Taxa de Produtividade Global</span>
                Calcula a aderência do esforço bruto do período com a capacidade total configurada.
              </div>
              <div>
                <span className="font-bold text-white block">Estimativa de Capacidade</span>
                Utiliza este valor como base de comparação quando filtros corporativos globais estão selecionados.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
