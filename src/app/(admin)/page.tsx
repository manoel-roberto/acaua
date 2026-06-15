"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { db, auth } from "@/lib/firebase/client";
import { doc, onSnapshot, collection, getDocs, writeBatch, setDoc, query, where } from "firebase/firestore";
import { useAuthContext } from "@/context/AuthContext";
import { GlobalMetrics, Project, Activity, TimeLog, UserProfile } from "@/types";
import { ALL_INDICATORS, Indicator, getIndicatorDocumentation } from "@/constants/indicators";
import { calculateIndicators } from "@/utils/bi";
import { 
  LayoutDashboard, 
  FolderKanban, 
  Users, 
  Activity as ActivityIcon, 
  Plus, 
  Settings, 
  X, 
  Check, 
  AlertCircle, 
  Calendar, 
  Filter, 
  Clock, 
  Percent, 
  TrendingUp, 
  ChevronRight,
  HelpCircle,
  FileText,
  Pencil,
  Target,
  Calculator,
  AlertTriangle
} from "lucide-react";

// Função para calcular dias úteis (Segunda a Sexta) entre duas datas
function calcularDiasUteis(start: Date, end: Date): number {
  let count = 0;
  const curDate = new Date(start.getTime());
  while (curDate <= end) {
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
}

// Lista padrão de widgets selecionados por aba na primeira execução
const DEFAULT_WIDGETS: Record<string, string[]> = {
  visao_geral: ["pfm_carteira_geral", "tor_ociosidade_global", "tor_ociosidade_global_mensal", "tbc_taxa_bloqueio_carteira", "subnotificacao_critica_time_logs_diario"],
  projetos: ["pfm_carteira_geral", "pfm_carteira_por_setor", "iap_desvio_prazo_por_categoria", "tempo_ciclo_medio_por_setor_demandante", "progresso_fisico_vs_esforco_realizado"],
  capacidade: ["fte_efetivo_carteira_mensal", "fte_efetivo_por_setor_mensal", "iac_comprometimento_planejado_equipe", "tor_ociosidade_por_cargo_mensal", "ihe_horas_extraordinarias_total_mensal"],
  rotinas: ["sla_resolucao_atividades_criticas", "sla_resolucao_por_tipo_atividade", "tempo_medio_em_andamento_kanban", "tempo_medio_bloqueada_kanban", "ratio_rotinas_vs_tarefas_espontaneas"]
};

export default function DashboardPage() {
  const { user, profile } = useAuthContext();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [selectedHelpIndicator, setSelectedHelpIndicator] = useState<Indicator | null>(null);
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetrics | null>(null);
  const [staticLoading, setStaticLoading] = useState(true);
  const [dynamicLoading, setDynamicLoading] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Estados de dados operacionais brutos
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Estados do painel de controle
  const [activeTab, setActiveTab] = useState<"visao_geral" | "projetos" | "capacidade" | "rotinas">("visao_geral");
  const [selectedWidgets, setSelectedWidgets] = useState<Record<string, string[]>>(DEFAULT_WIDGETS);
  const [isWidgetModalOpen, setIsWidgetModalOpen] = useState(false);

  // Filtros Globais
  const [periodFilter, setPeriodFilter] = useState<"mes" | "mes_anterior" | "7_dias" | "30_dias" | "90_dias" | "ano" | "personalizado">("mes");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [sectorFilter, setSectorFilter] = useState<string>("todos");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("todos");

  // Metas customizadas de indicadores por usuário
  const [customBenchmarks, setCustomBenchmarks] = useState<Record<string, number>>({});
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);

  // Hook para carregar configuração de widgets do localStorage
  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem(`acaua_dashboard_widgets_${user.uid}`);
    if (stored) {
      try {
        setSelectedWidgets(JSON.parse(stored));
      } catch (e) {
        console.error("Erro ao ler widgets do localStorage:", e);
      }
    }
  }, [user]);

  // Hook para carregar metas customizadas do localStorage
  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem(`acaua_custom_benchmarks_${user.uid}`);
    if (stored) {
      try {
        setCustomBenchmarks(JSON.parse(stored));
      } catch (e) {
        console.error("Erro ao ler metas customizadas do localStorage:", e);
      }
    }
  }, [user]);

  // Inicializar datas personalizadas quando selecionadas
  useEffect(() => {
    if (periodFilter === "personalizado" && (!customStartDate || !customEndDate)) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setCustomStartDate(firstDay.toISOString().split("T")[0]);
      setCustomEndDate(now.toISOString().split("T")[0]);
    }
  }, [periodFilter, customStartDate, customEndDate]);

  // Salvar configuração de widgets no localStorage
  const saveWidgetConfig = (newConfig: Record<string, string[]>) => {
    if (!user) return;
    setSelectedWidgets(newConfig);
    localStorage.setItem(`acaua_dashboard_widgets_${user.uid}`, JSON.stringify(newConfig));
  };

  // Salvar nova meta de indicador customizado
  const saveCustomBenchmark = (indicatorId: string, value: number) => {
    if (!user) return;
    const newBenchmarks = { ...customBenchmarks, [indicatorId]: value };
    setCustomBenchmarks(newBenchmarks);
    localStorage.setItem(`acaua_custom_benchmarks_${user.uid}`, JSON.stringify(newBenchmarks));
  };

  // Carregar dados estruturados estáticos/iniciais do Firestore (uma vez por sessão/login)
  useEffect(() => {
    if (!user || !auth.currentUser) return;

    // 1. Escutar métricas globais
    const unsubscribeMetrics = onSnapshot(doc(db, "metrics", "global"), (snap) => {
      if (snap.exists()) setGlobalMetrics(snap.data() as GlobalMetrics);
    });

    // 2. Buscar perfis e projetos
    const loadStaticData = async () => {
      try {
        const [projSnap, profSnap] = await Promise.all([
          getDocs(collection(db, "projects")),
          getDocs(collection(db, "profiles"))
        ]);

        const loadedProjects = projSnap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Project));
        const loadedProfiles = profSnap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as UserProfile));

        setProjects(loadedProjects);
        setProfiles(loadedProfiles);

        // Seção silenciosa: Semeador opcional de indicadores para manter compatibilidade
        const currentProfile = loadedProfiles.find(p => p.email === user.email);
        if (currentProfile?.role === "admin") {
          const indicatorsSnap = await getDocs(collection(db, "indicators"));
          if (indicatorsSnap.empty) {
            const batch = writeBatch(db);
            ALL_INDICATORS.forEach(ind => {
              batch.set(doc(db, "indicators", ind.id), ind);
            });
            await batch.commit();
            console.log("Indicadores semeados com sucesso na coleção /indicators.");
          }
        }
      } catch (error) {
        console.error("Erro ao carregar dados estáticos do Dashboard:", error);
      } finally {
        setStaticLoading(false);
      }
    };

    loadStaticData();
    return () => unsubscribeMetrics();
  }, [user]);

  // Intervalo de tempo selecionado e se está limitado
  const { dateRange, isRangeLimited } = useMemo(() => {
    const now = new Date();
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0); // Mês corrente por padrão
    let isRangeLimited = false;

    if (periodFilter === "mes_anterior") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); // Último dia do mês anterior
    } else if (periodFilter === "7_dias") {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
    } else if (periodFilter === "30_dias") {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
    } else if (periodFilter === "90_dias") {
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
    } else if (periodFilter === "ano") {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    } else if (periodFilter === "personalizado" && customStartDate && customEndDate) {
      const s = new Date(customStartDate + "T00:00:00");
      let e = new Date(customEndDate + "T23:59:59");
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        const diffTime = e.getTime() - s.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays > 30) {
          isRangeLimited = true;
          e = new Date(s.getTime() + 30 * 24 * 60 * 60 * 1000 - 1000); // Exatos 30 dias menos 1 segundo
          e.setHours(23, 59, 59, 999);
        }
        start = s;
        end = e;
      }
    }

    return { dateRange: { start, end }, isRangeLimited };
  }, [periodFilter, customStartDate, customEndDate]);

  const startISO = dateRange.start.toISOString();
  const endISO = dateRange.end.toISOString();

  // Carregar dados operacionais dinâmicos (activities, time_logs, audit_logs) baseados no filtro de data
  useEffect(() => {
    if (!user || !auth.currentUser || staticLoading) return;

    const loadDynamicData = async () => {
      setDynamicLoading(true);
      try {
        const startDateOnly = startISO.split("T")[0];
        const endDateOnly = endISO.split("T")[0];

        // Construir queries otimizadas por data
        const tlQuery = query(
          collection(db, "time_logs"),
          where("log_date", ">=", startDateOnly),
          where("log_date", "<=", endDateOnly)
        );
        const actQuery = query(
          collection(db, "activities"),
          where("activity_date", ">=", startDateOnly),
          where("activity_date", "<=", endDateOnly)
        );
        const auditQuery = query(
          collection(db, "audit_logs"),
          where("created_at", ">=", startISO),
          where("created_at", "<=", endISO)
        );

        const [tlSnap, actSnap, auditSnap] = await Promise.all([
          getDocs(tlQuery),
          getDocs(actQuery),
          getDocs(auditQuery)
        ]);

        const loadedTimeLogs = tlSnap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as TimeLog));
        const loadedActivities = actSnap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Activity));
        const loadedAuditLogs = auditSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        setTimeLogs(loadedTimeLogs);
        setActivities(loadedActivities);
        setAuditLogs(loadedAuditLogs);
      } catch (error) {
        console.error("Erro ao carregar dados dinâmicos do Dashboard:", error);
      } finally {
        setDynamicLoading(false);
      }
    };

    loadDynamicData();
  }, [user, staticLoading, startISO, endISO]);

  // --- FILTRAGEM E CÁLCULO DOS DADOS EM MEMÓRIA ---
  
  // Lista de Setores únicos a partir dos perfis cadastrados
  const sectorsList = useMemo(() => {
    const list = new Set<string>();
    profiles.forEach(p => p.setor && list.add(p.setor));
    return Array.from(list).filter(Boolean);
  }, [profiles]);

  // Lista de Colaboradores únicos operacionais
  const membersList = useMemo(() => {
    return profiles.filter(p => p.active && p.role !== "visualizador");
  }, [profiles]);



  // Calcular dias úteis do período atual
  const diasUteisNoPeriodo = useMemo(() => {
    return calcularDiasUteis(dateRange.start, dateRange.end);
  }, [dateRange]);

  // Dados brutos filtrados pelo intervalo de datas
  const filteredData = useMemo(() => {
    const startStr = dateRange.start.toISOString();
    const endStr = dateRange.end.toISOString();

    const tLogs = timeLogs.filter(log => log.log_date >= startStr.split("T")[0] && log.log_date <= endStr.split("T")[0]);
    const acts = activities.filter(act => act.activity_date >= startStr.split("T")[0] && act.activity_date <= endStr.split("T")[0]);
    const adLogs = auditLogs.filter(log => log.created_at >= startStr && log.created_at <= endStr);

    return {
      projects, // Projetos mantém inteiros para ver status ativos
      activities: acts,
      timeLogs: tLogs,
      profiles,
      auditLogs: adLogs
    };
  }, [projects, activities, timeLogs, profiles, auditLogs, dateRange]);

  // Métricas do metrics/global
  const displayMetrics: GlobalMetrics = {
    projects_active: globalMetrics?.projects_active ?? 0,
    projects_done: globalMetrics?.projects_done ?? 0,
    projects_paused: globalMetrics?.projects_paused ?? 0,
    projects_blocked: globalMetrics?.projects_blocked ?? 0,
    avg_progress: globalMetrics?.avg_progress ?? 0,
    total_hours_month: globalMetrics?.total_hours_month ?? 0,
    expected_hours_month: globalMetrics?.expected_hours_month ?? 160,
    productivity_pct: globalMetrics?.productivity_pct ?? 0,
    idleness_pct: globalMetrics?.idleness_pct ?? 100,
    last_updated: globalMetrics?.last_updated ?? new Date().toISOString(),
  };

  // --- MOTOR DE PROCESSAMENTO DE BI CLIENT-SIDE ---
  const calculatedKPIs = useMemo(() => {
    return calculateIndicators(
      filteredData,
      profiles,
      sectorFilter,
      responsibleFilter,
      diasUteisNoPeriodo,
      customBenchmarks,
      displayMetrics.expected_hours_month
    );
  }, [filteredData, profiles, sectorFilter, responsibleFilter, diasUteisNoPeriodo, customBenchmarks, displayMetrics.expected_hours_month]);

  const totalHoursFiltered = useMemo(() => {
    return filteredData.timeLogs.reduce((sum, log) => sum + log.hours, 0);
  }, [filteredData.timeLogs]);

  const expectedHoursFiltered = useMemo(() => {
    if (sectorFilter === "todos" && responsibleFilter === "todos" && periodFilter === "mes") {
      return displayMetrics.expected_hours_month;
    }
    
    let filteredProfiles = profiles.filter(p => p.active && p.role !== "visualizador");
    
    if (sectorFilter !== "todos") {
      filteredProfiles = filteredProfiles.filter(p => p.setor === sectorFilter);
    }
    
    if (responsibleFilter !== "todos") {
      filteredProfiles = filteredProfiles.filter(p => p.email === responsibleFilter || p.id === responsibleFilter);
    }
    
    const calculatedCapacity = filteredProfiles.reduce((sum, p) => sum + ((p.carga_horaria || 40) / 5 * diasUteisNoPeriodo), 0);
    return calculatedCapacity > 0 ? calculatedCapacity : displayMetrics.expected_hours_month;
  }, [profiles, sectorFilter, responsibleFilter, periodFilter, diasUteisNoPeriodo, displayMetrics.expected_hours_month]);

  const expectedHours = expectedHoursFiltered || 160;
  const productivity = expectedHours > 0 ? Math.min((totalHoursFiltered / expectedHours) * 105, 100) : 0;
  const idleness = Math.max(100 - productivity, 0);

  if (staticLoading) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-850 border-t-emerald-500"></div>
        <p className="mt-4 text-xs font-semibold text-zinc-550 uppercase tracking-widest">
          Carregando Dashboard de Indicadores...
        </p>
      </div>
    );
  }

  // Filtragem dos widgets a serem exibidos com base na aba ativa
  const widgetsToShow = ALL_INDICATORS.filter(
    ind => selectedWidgets[activeTab]?.includes(ind.id)
  );

  return (
    <div className="space-y-6">
      
      {/* HEADER & FILTROS GLOBAIS */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-800/60 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <LayoutDashboard className="h-7 w-7 text-emerald-500" />
            Dashboard de Indicadores
          </h1>
          <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
            Métricas estratégicas e controle de capacidade do NGD da UEFS.
          </p>
        </div>

        {/* Barra de Filtros */}
        <div className="flex flex-wrap items-center gap-3 bg-zinc-950/40 p-2 rounded-xl border border-zinc-850">
          {/* Período */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400">
            <Calendar className="h-3.5 w-3.5 text-zinc-500" />
            <select 
              value={periodFilter} 
              onChange={(e) => setPeriodFilter(e.target.value as any)}
              className="bg-transparent text-white font-semibold outline-none border-none cursor-pointer focus:ring-0"
            >
              <option value="mes" className="bg-zinc-900 text-white">Mês Corrente</option>
              <option value="mes_anterior" className="bg-zinc-900 text-white">Mês Anterior</option>
              <option value="7_dias" className="bg-zinc-900 text-white">Últimos 7 Dias</option>
              <option value="30_dias" className="bg-zinc-900 text-white">Últimos 30 Dias</option>
              <option value="90_dias" className="bg-zinc-900 text-white">Últimos 90 Dias</option>
              <option value="ano" className="bg-zinc-900 text-white">Este Ano</option>
              <option value="personalizado" className="bg-zinc-900 text-white">Personalizado...</option>
            </select>
            {dynamicLoading && (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border border-zinc-700 border-t-emerald-500 ml-1"></div>
            )}
          </div>

          {periodFilter === "personalizado" && (
            <>
              <div className="h-4 w-px bg-zinc-800"></div>
              <div className="flex items-center gap-2 px-2 text-xs">
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-zinc-900 text-white border border-zinc-800 rounded px-2.5 py-1 focus:outline-none focus:border-emerald-500 text-[11px] font-semibold"
                />
                <span className="text-zinc-500 font-bold text-[9px] uppercase">até</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-zinc-900 text-white border border-zinc-800 rounded px-2.5 py-1 focus:outline-none focus:border-emerald-500 text-[11px] font-semibold"
                />
                {isRangeLimited && (
                  <span className="text-amber-500 text-[10px] font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg animate-pulse whitespace-nowrap">
                    Intervalo limitado a 30 dias
                  </span>
                )}
              </div>
            </>
          )}

          <div className="h-4 w-px bg-zinc-800"></div>

          {/* Setor */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400">
            <Filter className="h-3.5 w-3.5 text-zinc-500" />
            <select 
              value={sectorFilter} 
              onChange={(e) => setSectorFilter(e.target.value)}
              className="bg-transparent text-white font-semibold outline-none border-none cursor-pointer focus:ring-0"
            >
              <option value="todos" className="bg-zinc-900 text-white">Todos Setores</option>
              {sectorsList.map(s => (
                <option key={s} value={s} className="bg-zinc-900 text-white">{s}</option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-zinc-800"></div>

          {/* Colaborador */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400">
            <Users className="h-3.5 w-3.5 text-zinc-500" />
            <select 
              value={responsibleFilter} 
              onChange={(e) => setResponsibleFilter(e.target.value)}
              className="bg-transparent text-white font-semibold outline-none border-none cursor-pointer focus:ring-0 select-none"
            >
              <option value="todos" className="bg-zinc-900 text-white">Equipe Inteira</option>
              {membersList.map(m => (
                <option key={m.email} value={m.email} className="bg-zinc-900 text-white">{m.full_name}</option>
              ))}
            </select>
          </div>

          {/* Configuração de Widgets */}
          <button 
            onClick={() => setIsWidgetModalOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold px-3 py-1.5 rounded-lg text-xs transition duration-300 border border-emerald-500/20"
          >
            <Settings className="h-3.5 w-3.5" />
            Customizar
          </button>
        </div>
      </div>

      {/* ABAS DO DASHBOARD */}
      <div className="flex items-center justify-between border-b border-zinc-850">
        <div className="flex space-x-1 p-1">
          <button
            onClick={() => setActiveTab("visao_geral")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition duration-200 ${
              activeTab === "visao_geral" 
                ? "bg-zinc-900/60 text-white border-b-2 border-emerald-500" 
                : "text-zinc-450 hover:text-zinc-200"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Visão Geral
          </button>
          <button
            onClick={() => setActiveTab("projetos")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition duration-200 ${
              activeTab === "projetos" 
                ? "bg-zinc-900/60 text-white border-b-2 border-emerald-500" 
                : "text-zinc-450 hover:text-zinc-200"
            }`}
          >
            <FolderKanban className="h-4 w-4" />
            Projetos & Prazos
          </button>
          <button
            onClick={() => setActiveTab("capacidade")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition duration-200 ${
              activeTab === "capacidade" 
                ? "bg-zinc-900/60 text-white border-b-2 border-emerald-500" 
                : "text-zinc-450 hover:text-zinc-200"
            }`}
          >
            <Users className="h-4 w-4" />
            Capacidade & FTE
          </button>
          <button
            onClick={() => setActiveTab("rotinas")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition duration-200 ${
              activeTab === "rotinas" 
                ? "bg-zinc-900/60 text-white border-b-2 border-emerald-500" 
                : "text-zinc-450 hover:text-zinc-200"
            }`}
          >
            <ActivityIcon className="h-4 w-4" />
            Rotinas & Operações
          </button>
        </div>
      </div>

      {/* METRICAS DE VISÃO GERAL (RESUMO RÁPIDO DO BANCO) */}
      {activeTab === "visao_geral" && (
        <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 transition-opacity duration-300 ${dynamicLoading ? "opacity-60" : "opacity-100"}`}>
          <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-5 backdrop-blur-md hover:border-zinc-750 transition duration-300 group">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Projetos Ativos</p>
            <p className="mt-3 text-3xl font-extrabold text-white">{displayMetrics.projects_active}</p>
            <div className="mt-3 text-xs text-zinc-550 flex gap-2">
              <span>{displayMetrics.projects_done} concluídos</span>
              <span>•</span>
              <span>{displayMetrics.projects_paused} pausados</span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-5 backdrop-blur-md hover:border-zinc-750 transition duration-300 group">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {periodFilter === "mes" ? "Esforço Mensal" : "Esforço do Período"}
            </p>
            <p className="mt-3 text-3xl font-extrabold text-white">{totalHoursFiltered.toFixed(1)}h</p>
            <div className="mt-3 flex items-center gap-1.5">
              <p className="text-xs text-zinc-550">
                {sectorFilter === "todos" && responsibleFilter === "todos" && periodFilter === "mes"
                  ? `Meta esperada: ${displayMetrics.expected_hours_month}h`
                  : `Capacidade estimada: ${expectedHoursFiltered.toFixed(0)}h`
                }
              </p>
              {sectorFilter === "todos" && responsibleFilter === "todos" && periodFilter === "mes" && profile?.role === "admin" && (
                <Link 
                  href="/parameters" 
                  className="p-0.5 rounded hover:bg-zinc-850 text-zinc-500 hover:text-white transition duration-200 flex items-center justify-center animate-fade-in"
                  title="Configurar nos Parâmetros Gerais"
                >
                  <Settings className="h-3 w-3 animate-pulse" />
                </Link>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-5 backdrop-blur-md hover:border-zinc-750 transition duration-300 group">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Produtividade Estimada</p>
            <p className="mt-3 text-3xl font-extrabold text-white">{productivity.toFixed(1)}%</p>
            <p className="mt-3 text-xs text-zinc-550">Ociosidade de capacidade: {idleness.toFixed(1)}%</p>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-5 backdrop-blur-md hover:border-zinc-750 transition duration-300 group">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Progresso Médio</p>
            <p className="mt-3 text-3xl font-extrabold text-white">{displayMetrics.avg_progress.toFixed(1)}%</p>
            <p className="mt-3 text-xs text-zinc-550">Avanço físico da carteira</p>
          </div>
        </div>
      )}

      {/* GRID DE WIDGETS DINÂMICOS CUSTOMIZÁVEIS */}
      <div className={`grid gap-6 md:grid-cols-2 grid-flow-row-dense transition-opacity duration-300 ${dynamicLoading ? "opacity-60" : "opacity-100"}`}>
        {widgetsToShow.map(widget => {
          const kpiData = calculatedKPIs[widget.id] || { value: 0, benchmark: true };
          
          return (
            <div 
              key={widget.id} 
              className={`rounded-xl border bg-zinc-950/20 p-6 backdrop-blur-sm transition duration-300 ${
                widget.visualization.default_chart === "card" ? "md:col-span-1" : "md:col-span-2"
              } border-zinc-850 hover:border-zinc-800 flex flex-col justify-between`}
            >
              {/* Informações superiores */}
              <div className="mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-550 bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded">
                      {widget.category.replace(/_/g, " ")}
                    </span>
                    <h3 className="mt-2 text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                      {widget.title}
                      <button
                        onClick={() => setSelectedHelpIndicator(widget)}
                        title="Ver ajuda detalhada deste indicador"
                        className="relative flex flex-col items-center group cursor-pointer focus:outline-none"
                      >
                        <HelpCircle className="h-4 w-4 text-zinc-600 hover:text-emerald-400 hover:scale-110 transition-all duration-200" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center pointer-events-none">
                          <span className="relative z-10 p-2 text-[10px] leading-relaxed text-zinc-300 bg-zinc-900 rounded-lg border border-zinc-800 shadow-xl w-48 text-center">
                            {widget.description}
                            <span className="block mt-1 text-emerald-400 font-bold font-mono">Clique para ver ajuda completa</span>
                          </span>
                        </div>
                      </button>
                    </h3>
                  </div>

                  {/* Tag de Meta/Benchmark com Edição Inline */}
                  {editingTargetId === widget.id ? (
                    <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                      <span className="text-[10px] text-zinc-500 font-semibold px-1 select-none">
                        {widget.target_benchmark.operator}
                      </span>
                      <input 
                        type="number" 
                        defaultValue={customBenchmarks[widget.id] !== undefined ? customBenchmarks[widget.id] : widget.target_benchmark.value}
                        className="w-14 bg-zinc-950 text-white border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] font-bold focus:outline-none focus:border-emerald-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = Number((e.target as HTMLInputElement).value);
                            if (!isNaN(val)) {
                              saveCustomBenchmark(widget.id, val);
                            }
                            setEditingTargetId(null);
                          } else if (e.key === "Escape") {
                            setEditingTargetId(null);
                          }
                        }}
                        onBlur={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val)) {
                            saveCustomBenchmark(widget.id, val);
                          }
                          setEditingTargetId(null);
                        }}
                        autoFocus
                      />
                      <span className="text-[10px] text-zinc-500 font-semibold pr-1 select-none">
                        {widget.target_benchmark.unit}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                        kpiData.benchmark 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10" 
                          : "bg-orange-500/10 text-orange-400 border border-orange-500/10"
                      }`}>
                        {kpiData.benchmark ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                        <span>
                          Meta: {widget.target_benchmark.operator} {customBenchmarks[widget.id] !== undefined ? customBenchmarks[widget.id] : widget.target_benchmark.value}{widget.target_benchmark.unit}
                        </span>
                      </div>
                      <button 
                        onClick={() => setEditingTargetId(widget.id)}
                        className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition duration-200"
                        title="Ajustar Meta"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* RENDERIZADOR DE VISUALIZAÇÃO GRÁFICA */}
              <div className="mt-2 flex-grow flex items-center justify-center">
                {/* 1. RENDER WIDGET CARD */}
                {widget.visualization.default_chart === "card" && (
                  <div className="text-center py-6">
                    <p className={`text-5xl font-extrabold tracking-tight ${
                      kpiData.benchmark ? "text-emerald-400" : "text-orange-400"
                    }`}>
                      {kpiData.value}{widget.target_benchmark.unit}
                    </p>
                    <p className="mt-3 text-xs text-zinc-500 italic max-w-sm mx-auto leading-relaxed">
                      Lógica: {widget.formula_logic}
                    </p>
                  </div>
                )}

                {/* 2. RENDER WIDGET BAR_CHART */}
                {widget.visualization.default_chart === "bar_chart" && (
                  <div className="w-full space-y-3.5 py-2">
                    {kpiData.list && kpiData.list.length > 0 ? (
                      kpiData.list.map((item, idx) => {
                        // Calcula proporção largura da barra
                        const maxVal = Math.max(...(kpiData.list?.map(i => i.value) || [100]));
                        const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
                        
                        return (
                          <div key={idx} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-zinc-300 tracking-tight flex items-center gap-1">
                                <span className="text-zinc-600 font-mono">#{idx+1}</span>
                                {item.label}
                              </span>
                              <span className="text-white">{item.value}{widget.target_benchmark.unit}</span>
                            </div>
                            <div className="h-3.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-850">
                              <div 
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                                style={{ width: `${Math.max(3, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-zinc-600 text-center py-8">Nenhum dado encontrado para o agrupamento.</p>
                    )}
                  </div>
                )}

                {/* 3. RENDER WIDGET PIE_CHART (Rosca/Donut SVG) */}
                {widget.visualization.default_chart === "pie_chart" && (
                  <div className="flex flex-col sm:flex-row items-center gap-8 py-4 w-full justify-center">
                    {kpiData.list && kpiData.list.length > 0 ? (
                      <>
                        {/* Desenho do Donut */}
                        <div className="relative h-32 w-32 flex items-center justify-center">
                          <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#18181b" strokeWidth="3" />
                            {(() => {
                              const totalVal = kpiData.list.reduce((sum, i) => sum + i.value, 0);
                              let accumulatedPct = 0;
                              const colors = ["#10b981", "#14b8a6", "#06b6d4", "#64748b", "#3f3f46"];
                              
                              return kpiData.list.map((item, idx) => {
                                const valPct = totalVal > 0 ? (item.value / totalVal) * 100 : 0;
                                const strokeDash = `${valPct} ${100 - valPct}`;
                                const strokeOffset = 100 - accumulatedPct;
                                accumulatedPct += valPct;
                                
                                return (
                                  <circle 
                                    key={idx}
                                    cx="18" 
                                    cy="18" 
                                    r="15.915" 
                                    fill="none" 
                                    stroke={colors[idx % colors.length]} 
                                    strokeWidth="3.2" 
                                    strokeDasharray={strokeDash} 
                                    strokeDashoffset={strokeOffset} 
                                    className="transition-all duration-500"
                                  />
                                );
                              });
                            })()}
                          </svg>
                          <div className="absolute text-center">
                            <p className="text-[10px] uppercase font-bold text-zinc-550">Total</p>
                            <p className="text-xl font-extrabold text-white">
                              {kpiData.list.reduce((s, i) => s + i.value, 0).toFixed(1)}
                            </p>
                          </div>
                        </div>

                        {/* Legendas */}
                        <div className="space-y-2 text-xs font-semibold">
                          {kpiData.list.map((item, idx) => {
                            const colors = ["bg-emerald-500", "bg-teal-500", "bg-cyan-500", "bg-slate-500", "bg-zinc-700"];
                            const total = kpiData.list?.reduce((s, i) => s + i.value, 0) || 1;
                            const share = ((item.value / total) * 100).toFixed(1);
                            
                            return (
                              <div key={idx} className="flex items-center gap-2">
                                <span className={`h-3 w-3 rounded-full ${colors[idx % colors.length]}`} />
                                <span className="text-zinc-300 font-medium">{item.label}:</span>
                                <span className="text-white">{item.value} ({share}%)</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-650 py-8">Sem dados de esforço distribuído.</p>
                    )}
                  </div>
                )}

                {/* 4. RENDER WIDGET LINE_CHART (Série Temporal SVG) */}
                {widget.visualization.default_chart === "line_chart" && (
                  <div className="w-full py-4">
                    {kpiData.list && kpiData.list.length > 0 ? (
                      <div className="space-y-4">
                        <div className="h-32 w-full relative">
                          <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 30">
                            {/* Linhas de Grid */}
                            <line x1="0" y1="5" x2="100" y2="5" stroke="#27272a" strokeWidth="0.3" strokeDasharray="2" />
                            <line x1="0" y1="15" x2="100" y2="15" stroke="#27272a" strokeWidth="0.3" strokeDasharray="2" />
                            <line x1="0" y1="25" x2="100" y2="25" stroke="#27272a" strokeWidth="0.3" strokeDasharray="2" />
                            
                            {/* Polilinha de tendência */}
                            {(() => {
                              const list = [...kpiData.list].reverse(); // cronológico
                              const maxVal = Math.max(...list.map(i => i.value), 1);
                              const points = list.map((item, idx) => {
                                const x = (idx / (list.length - 1)) * 100;
                                const y = 30 - ((item.value / maxVal) * 20 + 5); // escala entre 5 e 25
                                return `${x},${y}`;
                              }).join(" ");

                              return (
                                <polyline 
                                  fill="none" 
                                  stroke="#10b981" 
                                  strokeWidth="1.2" 
                                  points={points} 
                                  className="transition-all duration-500"
                                />
                              );
                            })()}
                          </svg>
                        </div>
                        {/* Eixos Horizontais */}
                        <div className="flex justify-between text-[10px] text-zinc-550 font-semibold uppercase">
                          {[...kpiData.list].reverse().map((item, idx) => (
                            <span key={idx}>{item.label}</span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-650 text-center py-8">Nenhum log cronológico disponível no período.</p>
                    )}
                  </div>
                )}

                {/* 5. RENDER WIDGET TABLE */}
                {widget.visualization.default_chart === "table" && (
                  <div className="w-full overflow-hidden rounded-xl border border-zinc-850 bg-zinc-950/40 mt-2">
                    <table className="min-w-full divide-y divide-zinc-850 text-left text-xs">
                      <thead className="bg-zinc-900 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        <tr>
                          <th className="px-4 py-2">Item / Label</th>
                          <th className="px-4 py-2 text-right">Valor Calculado</th>
                          <th className="px-4 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850/60 font-semibold text-zinc-300">
                        {kpiData.list && kpiData.list.length > 0 ? (
                          kpiData.list.map((item, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/30 transition">
                              <td className="px-4 py-2.5 flex items-center gap-1.5">
                                <ChevronRight className="h-3 w-3 text-emerald-500" />
                                {item.label}
                              </td>
                              <td className="px-4 py-2.5 text-right text-white font-mono">{item.value}{widget.target_benchmark.unit}</td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                                  item.value <= widget.target_benchmark.value
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-orange-500/10 text-orange-400"
                                }`}>
                                  {item.value <= widget.target_benchmark.value ? "OK" : "ALERTA"}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-zinc-600">Sem registros disponíveis.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ÚLTIMA ATUALIZAÇÃO */}
      <div className="flex justify-end pt-4 border-t border-zinc-850">
        <span className="text-[9px] font-mono text-zinc-650 bg-zinc-900/40 border border-zinc-850/50 px-2 py-1 rounded">
          MÉTRICAS ATUALIZADAS: {isMounted ? new Date(displayMetrics.last_updated).toLocaleString("pt-BR") : ""}
        </span>
      </div>

      {/* MODAL CONFIGURADOR DE WIDGETS (GALERIA DE SELEÇÃO) */}
      {isWidgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-3xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl flex flex-col max-h-[85vh]">
            
            {/* Header modal */}
            <div className="flex items-center justify-between border-b border-zinc-850 pb-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Settings className="h-5 w-5 text-emerald-500 animate-spin-slow" />
                  Gerenciar Painéis de Indicadores
                </h2>
                <p className="text-xs text-zinc-550 mt-1">
                  Ative ou desative quais KPIs deseja visualizar na aba <span className="text-emerald-400 font-semibold uppercase">{activeTab.replace(/_/g, " ")}</span>.
                </p>
              </div>
              <button 
                onClick={() => setIsWidgetModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Corpo com galeria de 42 widgets divididos por categoria */}
            <div className="flex-grow overflow-y-auto pr-1 space-y-6">
              {["prazo_e_entrega", "esforco_e_capacidade", "eficiencia", "qualidade_e_operacoes", "auditoria_e_controle"].map(category => {
                const categoryIndicators = ALL_INDICATORS.filter(ind => ind.category === category);
                
                return (
                  <div key={category} className="space-y-3">
                    <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest border-l-2 border-emerald-500 pl-2">
                      {category.replace(/_/g, " ")}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {categoryIndicators.map(ind => {
                        const isSelected = selectedWidgets[activeTab]?.includes(ind.id);
                        
                        return (
                          <div 
                            key={ind.id}
                            onClick={() => {
                              const activeList = selectedWidgets[activeTab] || [];
                              const newTabWidgets = activeList.includes(ind.id)
                                ? activeList.filter(id => id !== ind.id)
                                : [...activeList, ind.id];
                              
                              saveWidgetConfig({
                                ...selectedWidgets,
                                [activeTab]: newTabWidgets
                              });
                            }}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer select-none transition ${
                              isSelected 
                                ? "bg-emerald-500/5 border-emerald-500/35 text-white" 
                                : "bg-zinc-900/20 border-zinc-850 text-zinc-400 hover:border-zinc-800"
                            }`}
                          >
                            <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              isSelected ? "bg-emerald-500 border-emerald-500 text-black" : "border-zinc-700"
                            }`}>
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white">{ind.title}</p>
                              <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed line-clamp-2">{ind.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Modal */}
            <div className="flex items-center justify-between border-t border-zinc-850 pt-4 mt-6">
              <button
                onClick={() => saveWidgetConfig({ ...selectedWidgets, [activeTab]: DEFAULT_WIDGETS[activeTab] })}
                className="text-xs font-semibold text-zinc-500 hover:text-white transition"
              >
                Restaurar Padrões da Aba
              </button>
              
              <button
                onClick={() => setIsWidgetModalOpen(false)}
                className="bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold px-5 py-2 rounded-lg text-xs tracking-wide transition duration-300"
              >
                Concluir Seleção
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE AJUDA DOS INDICADORES */}
      {selectedHelpIndicator && (() => {
        const docData = getIndicatorDocumentation(selectedHelpIndicator);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all animate-fade-in">
            <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 md:p-8 space-y-6 max-h-[85vh] overflow-y-auto">
              {/* Botão de Fechar */}
              <button 
                onClick={() => setSelectedHelpIndicator(null)}
                className="absolute right-4 top-4 text-zinc-400 hover:text-white hover:bg-zinc-800 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Cabeçalho */}
              <div className="space-y-2">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide border uppercase bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {selectedHelpIndicator.category.replace(/_/g, " ")}
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {selectedHelpIndicator.title}
                </h2>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  {selectedHelpIndicator.description}
                </p>
              </div>

              {/* Grid explicativo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Objetivo */}
                <div className="bg-zinc-950/40 border border-zinc-850 rounded-xl p-4.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-zinc-300 font-semibold text-xs">
                    <Target className="h-4 w-4 text-emerald-400 shrink-0" />
                    <h4>Objetivo Principal</h4>
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    {docData.objective}
                  </p>
                </div>

                {/* Cálculo */}
                <div className="bg-zinc-950/40 border border-zinc-850 rounded-xl p-4.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-zinc-300 font-semibold text-xs">
                    <Calculator className="h-4 w-4 text-indigo-400 shrink-0" />
                    <h4>Como Funciona o Cálculo</h4>
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    {docData.calculation}
                  </p>
                </div>

                {/* Interpretação */}
                <div className="bg-zinc-950/40 border border-zinc-850 rounded-xl p-4.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-zinc-300 font-semibold text-xs">
                    <TrendingUp className="h-4 w-4 text-amber-400 shrink-0" />
                    <h4>Interpretação e Gestão</h4>
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    {docData.interpretation}
                  </p>
                </div>

                {/* Diagnóstico */}
                <div className="bg-zinc-950/40 border border-zinc-850 rounded-xl p-4.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-zinc-300 font-semibold text-xs">
                    <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                    <h4>Diagnóstico de Problemas</h4>
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    {docData.troubleshooting}
                  </p>
                </div>
              </div>

              {/* Rodapé / Ações */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-zinc-850 pt-5 gap-3 mt-4">
                <div className="text-[10px] text-zinc-500">
                  Meta esperada: <span className="font-mono font-bold text-zinc-300">{selectedHelpIndicator.target_benchmark.operator} {selectedHelpIndicator.target_benchmark.value} {selectedHelpIndicator.target_benchmark.unit}</span>
                </div>
                <div className="flex items-center gap-2.5 justify-end">
                  <button
                    onClick={() => setSelectedHelpIndicator(null)}
                    className="px-4 py-2 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg text-xs font-semibold cursor-pointer transition"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={() => {
                      setSelectedHelpIndicator(null);
                      router.push(`/help?id=${selectedHelpIndicator.id}`);
                    }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold px-4 py-2 rounded-lg text-xs tracking-wide cursor-pointer transition duration-300"
                  >
                    Ver no Glossário Completo
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
