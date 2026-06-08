"use client";

import React, { useState, useEffect } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { 
  CalendarClock, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  Calendar, 
  Clock, 
  AlertCircle,
  FolderKanban,
  ListTodo,
  Sparkles,
  RefreshCw,
  Loader2,
  Pencil,
  Eye,
  Search,
  Filter,
  Lock
} from "lucide-react";
import { getRoutines, createRoutine, updateRoutine, deleteRoutine } from "@/services/routines";
import { getProjects } from "@/services/projects";
import { RecurringRoutine, Project } from "@/types";
import { DocumentSnapshot } from "firebase/firestore";

const getDateRangeFromShortcut = (shortcut: string): { start: string; end: string } => {
  const today = new Date();
  
  const formatDate = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  switch (shortcut) {
    case "hoje": {
      const dateStr = formatDate(today);
      return { start: dateStr, end: dateStr };
    }
    case "ontem": {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const dateStr = formatDate(yesterday);
      return { start: dateStr, end: dateStr };
    }
    case "amanha": {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const dateStr = formatDate(tomorrow);
      return { start: dateStr, end: dateStr };
    }
    case "semana": {
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { start: formatDate(monday), end: formatDate(sunday) };
    }
    case "mes": {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: formatDate(firstDay), end: formatDate(lastDay) };
    }
    default:
      return { start: "", end: "" };
  }
};

const calculateHoursBetween = (start: string, end: string): string => {
  if (!start || !end) return "";
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  
  const diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (diffMinutes < 0) return "";
  
  const hours = diffMinutes / 60;
  return String(Number(hours.toFixed(2)));
};

export default function RoutinesPage() {
  const { user, profile, hasPermission } = useAuthContext();
  const [routines, setRoutines] = useState<RecurringRoutine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | undefined>(undefined);

  // Filtros
  const [filterText, setFilterText] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterFrequency, setFilterFrequency] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateShortcut, setFilterDateShortcut] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<RecurringRoutine | null>(null);

  const canEditRoutine = (routine: RecurringRoutine | null) => {
    if (!routine) return hasPermission("routines", "create");
    return hasPermission("routines", "update");
  };

  const getFilteredRoutines = () => {
    let list = [...routines];

    // Busca textual (Título, Descrição e Tags)
    if (filterText.trim()) {
      const searchVal = filterText.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(searchVal) ||
          (r.description && r.description.toLowerCase().includes(searchVal)) ||
          (r.observations && r.observations.toLowerCase().includes(searchVal)) ||
          r.tags.some((tag) => tag.toLowerCase().includes(searchVal))
      );
    }

    // Filtro por Projeto
    if (filterProject) {
      if (filterProject === "none") {
        list = list.filter((r) => !r.project_id);
      } else {
        list = list.filter((r) => r.project_id === filterProject);
      }
    }

    // Filtro por Prioridade
    if (filterPriority) {
      list = list.filter((r) => r.priority === filterPriority);
    }

    // Filtro por Tag
    if (filterTag) {
      list = list.filter((r) => r.tags && r.tags.includes(filterTag));
    }

    // Filtro por Frequência
    if (filterFrequency) {
      list = list.filter((r) => r.frequency === filterFrequency);
    }

    // Filtro por Status (Ativa / Pausada)
    if (filterStatus) {
      const activeVal = filterStatus === "ativa";
      list = list.filter((r) => r.active === activeVal);
    }

    // Filtro por Próxima Execução (Intervalo ou Atalho)
    let startDate = "";
    let endDate = "";

    if (filterDateShortcut === "custom") {
      startDate = filterStartDate;
      endDate = filterEndDate;
    } else if (filterDateShortcut) {
      const range = getDateRangeFromShortcut(filterDateShortcut);
      startDate = range.start;
      endDate = range.end;
    }

    if (startDate) {
      list = list.filter((r) => r.next_run >= startDate);
    }
    if (endDate) {
      list = list.filter((r) => r.next_run <= endDate);
    }

    return list;
  };

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<RecurringRoutine["type"]>("rotina");
  const [priority, setPriority] = useState<RecurringRoutine["priority"]>("media");
  const [hoursPlanned, setHoursPlanned] = useState("");
  const [startTimePlanned, setStartTimePlanned] = useState("");
  const [endTimePlanned, setEndTimePlanned] = useState("");
  const [observations, setObservations] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // Atualiza automaticamente as horas planejadas na rotina
  useEffect(() => {
    if (startTimePlanned && endTimePlanned) {
      const calculated = calculateHoursBetween(startTimePlanned, endTimePlanned);
      if (calculated) {
        setHoursPlanned(calculated);
      } else {
        setHoursPlanned("");
      }
    } else {
      setHoursPlanned("");
    }
  }, [startTimePlanned, endTimePlanned]);
  
  // Recurrence fields
  const [frequency, setFrequency] = useState<RecurringRoutine["frequency"]>("dia");
  const [interval, setInterval] = useState("1");
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!user) return;
      try {
        setLoading(true);
        // Load routines
        const routinesRes = await getRoutines();
        // Load projects for select dropdown
        const projectsRes = await getProjects();

        if (active) {
          setRoutines(routinesRes.routines);
          setLastDoc(routinesRes.lastDoc);
          setHasMore(!!routinesRes.lastDoc);
          setProjects(projectsRes.projects);
        }
      } catch (error) {
        console.error("Erro ao carregar dados de rotinas:", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [user]);

  const loadMoreRoutines = async () => {
    if (!lastDoc || loading) return;
    try {
      setLoading(true);
      const res = await getRoutines({ lastVisible: lastDoc });
      setRoutines((prev) => [...prev, ...res.routines]);
      setLastDoc(res.lastDoc);
      setHasMore(!!res.lastDoc);
    } catch (error) {
      console.error("Erro ao carregar mais rotinas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (routine: RecurringRoutine) => {
    setEditingRoutine(routine);
    setTitle(routine.title);
    setDescription(routine.description || "");
    setProjectId(routine.project_id || "");
    setType(routine.type);
    setPriority(routine.priority);
    setHoursPlanned(routine.hours_planned ? String(routine.hours_planned) : "");
    setStartTimePlanned(routine.start_time_planned || "");
    setEndTimePlanned(routine.end_time_planned || "");
    setObservations(routine.observations || "");
    setTagsInput(routine.tags ? routine.tags.join(", ") : "");
    setFrequency(routine.frequency);
    setInterval(String(routine.interval));
    setWeekDays(routine.week_days || []);
    setStartDate(routine.next_run);
    setIsModalOpen(true);
  };

  const handleRoutineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    try {
      setSubmitting(true);
      const selectedProjectObj = projects.find((p) => p.id === projectId);
      const tags = tagsInput.split(",").map((t) => t.trim()).filter((t) => t !== "");

      const routineData = {
        title,
        description,
        project_id: projectId || null,
        project_name: selectedProjectObj ? selectedProjectObj.name : null,
        type,
        priority,
        start_time_planned: startTimePlanned || "",
        end_time_planned: endTimePlanned || "",
        hours_planned: Number(hoursPlanned) || 0,
        observations,
        tags,
        frequency,
        interval: Number(interval) || 1,
        week_days: frequency === "semana" ? weekDays : [],
        next_run: startDate,
      };

      if (editingRoutine) {
        await updateRoutine(editingRoutine.id, routineData);
        setRoutines((prev) =>
          prev.map((r) =>
            r.id === editingRoutine.id ? { ...r, ...routineData } : r
          )
        );
      } else {
        const newRoutine = await createRoutine({
          ...routineData,
          active: true,
          created_by: user.uid,
        }, profile.full_name);
        setRoutines((prev) => [newRoutine, ...prev]);
      }

      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao salvar rotina:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (routine: RecurringRoutine) => {
    try {
      const nextActive = !routine.active;
      await updateRoutine(routine.id, { active: nextActive });
      setRoutines((prev) =>
        prev.map((r) => (r.id === routine.id ? { ...r, active: nextActive } : r))
      );
    } catch (error) {
      console.error("Erro ao alternar status da rotina:", error);
    }
  };

  const handleDeleteRoutine = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta rotina recorrente?")) return;
    try {
      await deleteRoutine(id);
      setRoutines((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Erro ao excluir rotina:", error);
    }
  };

  const resetForm = () => {
    setEditingRoutine(null);
    setTitle("");
    setDescription("");
    setProjectId("");
    setType("rotina");
    setPriority("media");
    setHoursPlanned("");
    setStartTimePlanned("");
    setEndTimePlanned("");
    setObservations("");
    setTagsInput("");
    setFrequency("dia");
    setInterval("1");
    setWeekDays([]);
    setStartDate(new Date().toISOString().split("T")[0]);
  };

  const handleWeekdayCheckbox = (dayNum: number) => {
    setWeekDays((prev) =>
      prev.includes(dayNum)
        ? prev.filter((d) => d !== dayNum)
        : [...prev, dayNum]
    );
  };

  const getFrequencyLabel = (freq: string, val: number, days: number[]) => {
    const period = val === 1 
      ? { hora: "hora", dia: "dia", semana: "semana", mes: "mês", ano: "ano" }[freq]
      : { hora: "horas", dia: "dias", semana: "semanas", mes: "meses", ano: "anos" }[freq];

    const valStr = val === 1 ? "Todo(a)" : `A cada ${val}`;
    
    let details = "";
    if (freq === "semana" && days && days.length > 0) {
      const daysMap: Record<number, string> = {
        1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb", 0: "Dom"
      };
      const daysSorted = [...days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
      details = ` (${daysSorted.map(d => daysMap[d]).join(", ")})`;
    }

    return `${valStr} ${period}${details}`;
  };

  const getPriorityColor = (p: RecurringRoutine["priority"]) => {
    switch (p) {
      case "critica": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "alta": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      case "media": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default: return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  if (!hasPermission("routines", "read")) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-center p-6 bg-zinc-950">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500 mb-4 border border-red-500/20">
          <Lock className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Acesso Restrito</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          Você não tem permissão para visualizar a página de Rotinas.
        </p>
      </div>
    );
  }

  const allUniqueTags = Array.from(
    new Set(routines.flatMap((r) => r.tags || []))
  ).sort();

  const hasActiveFilters = 
    filterProject !== "" ||
    filterPriority !== "" ||
    filterFrequency !== "" ||
    filterStatus !== "" ||
    filterTag !== "" ||
    filterDateShortcut !== "";

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/60 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <CalendarClock className="h-8 w-8 text-emerald-400" />
            Rotinas Recorrentes
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-xl">
            Gerencie tarefas recorrentes automatizadas que disparam a criação de novas atividades de forma periódica no sistema.
          </p>
        </div>
        {hasPermission("routines", "create") && (
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-450 hover:to-teal-550 text-xs font-bold text-white px-5 py-3 transition-all duration-200 shadow-lg shadow-emerald-950/20 hover:scale-[1.02] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nova Rotina
          </button>
        )}
      </div>

      {/* Painel de Filtros e Busca Avançada */}
      <div className="space-y-4">
        {/* Barra de Filtros Principal */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Buscar por rotina, tag..."
              className="w-full pl-9 pr-8 py-2.5 text-xs rounded-xl border border-zinc-800 bg-zinc-950/40 text-white placeholder-zinc-550 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all"
            />
            {filterText && (
              <button
                onClick={() => setFilterText("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-350 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              showAdvancedFilters
                ? "bg-zinc-800 border-zinc-700 text-white shadow-md shadow-black/20"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            <Filter className="h-4 w-4" />
            Filtros Avançados
            <span className="text-[10px] opacity-60">{showAdvancedFilters ? "▲" : "▼"}</span>
          </button>
        </div>

        {/* Painel Expansível de Filtros Avançados */}
        {showAdvancedFilters && (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 rounded-xl border border-zinc-850/80 bg-zinc-900/10 p-4 backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
            {/* Filtrar por Projeto */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Projeto</label>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todos os Projetos</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-950">{p.name}</option>
                ))}
                <option value="none" className="bg-zinc-950">Sem Vínculo (Geral)</option>
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Prioridade */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Prioridade</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todas as Prioridades</option>
                <option value="baixa" className="bg-zinc-950">Baixa</option>
                <option value="media" className="bg-zinc-950">Média</option>
                <option value="alta" className="bg-zinc-950">Alta</option>
                <option value="critica" className="bg-zinc-950">Crítica</option>
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Frequência */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Frequência</label>
              <select
                value={filterFrequency}
                onChange={(e) => setFilterFrequency(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todas as Frequências</option>
                <option value="hora" className="bg-zinc-950">Hora</option>
                <option value="dia" className="bg-zinc-950">Dia</option>
                <option value="semana" className="bg-zinc-950">Semana</option>
                <option value="mes" className="bg-zinc-950">Mês</option>
                <option value="ano" className="bg-zinc-950">Ano</option>
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Status */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todos os Status</option>
                <option value="ativa" className="bg-zinc-950">Ativas</option>
                <option value="pausada" className="bg-zinc-950">Pausadas</option>
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Tag */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Tag</label>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todas as Tags</option>
                {allUniqueTags.map((tag) => (
                  <option key={tag} value={tag} className="bg-zinc-950">{tag}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Período */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Próxima Execução</label>
              <select
                value={filterDateShortcut}
                onChange={(e) => setFilterDateShortcut(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Qualquer período</option>
                <option value="hoje" className="bg-zinc-950">Hoje</option>
                <option value="ontem" className="bg-zinc-950">Ontem</option>
                <option value="amanha" className="bg-zinc-950">Amanhã</option>
                <option value="semana" className="bg-zinc-950">Esta semana</option>
                <option value="mes" className="bg-zinc-950">Este mês</option>
                <option value="custom" className="bg-zinc-950">Personalizado...</option>
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Próxima Execução Inicial (Condicional) */}
            {filterDateShortcut === "custom" && (
              <div className="relative">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Próxima Exec. Inicial</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full pl-3 pr-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all cursor-pointer block"
                  title="Próxima execução a partir de"
                />
              </div>
            )}

            {/* Filtrar por Próxima Execução Final (Condicional) */}
            {filterDateShortcut === "custom" && (
              <div className="relative">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Próxima Exec. Final</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full pl-3 pr-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all cursor-pointer block"
                  title="Próxima execução até"
                />
              </div>
            )}
          </div>
        )}

        {/* Badges de Filtros Ativos */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-in fade-in duration-200">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mr-1">Filtros ativos:</span>
            
            {filterProject && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Projeto: {filterProject === "none" ? "Geral" : projects.find(p => p.id === filterProject)?.name || filterProject}</span>
                <button onClick={() => setFilterProject("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterPriority && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Prioridade: {{
                  baixa: "Baixa",
                  media: "Média",
                  alta: "Alta",
                  critica: "Crítica"
                }[filterPriority] || filterPriority}</span>
                <button onClick={() => setFilterPriority("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterFrequency && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Frequência: {{
                  hora: "Hora",
                  dia: "Dia",
                  semana: "Semana",
                  mes: "Mês",
                  ano: "Ano"
                }[filterFrequency] || filterFrequency}</span>
                <button onClick={() => setFilterFrequency("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterStatus && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Status: {filterStatus === "ativa" ? "Ativa" : "Pausada"}</span>
                <button onClick={() => setFilterStatus("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterTag && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Tag: {filterTag}</span>
                <button onClick={() => setFilterTag("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterDateShortcut && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>
                  Próxima Execução: {
                    filterDateShortcut === "custom" 
                      ? `${filterStartDate ? filterStartDate.split("-").reverse().join("/") : ""} a ${filterEndDate ? filterEndDate.split("-").reverse().join("/") : ""}`
                      : {
                          hoje: "Hoje",
                          ontem: "Ontem",
                          amanha: "Amanhã",
                          semana: "Esta semana",
                          mes: "Este mês"
                        }[filterDateShortcut] || filterDateShortcut
                  }
                </span>
                <button onClick={() => {
                  setFilterDateShortcut("");
                  setFilterStartDate("");
                  setFilterEndDate("");
                }} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            <button
              onClick={() => {
                setFilterProject("");
                setFilterPriority("");
                setFilterFrequency("");
                setFilterStatus("");
                setFilterTag("");
                setFilterDateShortcut("");
                setFilterStartDate("");
                setFilterEndDate("");
              }}
              className="text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors uppercase tracking-wider ml-1"
            >
              Limpar Todos
            </button>
          </div>
        )}
      </div>

      {/* Routine Listing */}
      {loading && routines.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 text-emerald-450 animate-spin" />
          <p className="text-sm font-semibold text-zinc-500">Carregando rotinas...</p>
        </div>
      ) : routines.length === 0 ? (
        <div className="py-20 border border-dashed border-zinc-850 rounded-2xl flex flex-col items-center justify-center text-center">
          <div className="h-14 w-14 rounded-full bg-zinc-900/50 flex items-center justify-center border border-zinc-800 mb-4">
            <CalendarClock className="h-7 w-7 text-zinc-550" />
          </div>
          <h3 className="text-base font-bold text-white">Nenhuma rotina configurada</h3>
          <p className="mt-2 text-xs text-zinc-450 max-w-xs leading-relaxed">
            As rotinas recorrentes geram novas atividades pendentes automaticamente a cada hora, dia, semana ou mês.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-6 text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1.5 cursor-pointer"
          >
            Cadastrar primeira rotina
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-850/80 bg-zinc-900/10 backdrop-blur-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider bg-zinc-900/30">
                <th className="py-4 px-6">Rotina</th>
                <th className="py-4 px-6">Frequência</th>
                <th className="py-4 px-6">Projeto Vinculado</th>
                <th className="py-4 px-6">Próxima Execução</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850">
              {getFilteredRoutines().map((routine) => (
                <tr 
                  key={routine.id} 
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) {
                      return;
                    }
                    handleStartEdit(routine);
                  }}
                  className="hover:bg-zinc-900/20 transition-all cursor-pointer"
                >
                  <td className="py-4 px-6 max-w-sm">
                    <div className="space-y-1">
                      <span className="font-bold text-white text-sm">{routine.title}</span>
                      {routine.description && (
                        <p className="text-zinc-450 line-clamp-1">{routine.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className={`text-[9px] font-mono px-1.5 rounded border uppercase ${getPriorityColor(routine.priority)}`}>
                          {routine.priority}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-500 uppercase">
                          {routine.type}
                        </span>
                        {routine.hours_planned > 0 && (
                          <span className="text-[9px] font-mono px-1.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-500">
                            {routine.hours_planned}h planejadas
                          </span>
                        )}
                        {routine.start_time_planned && routine.end_time_planned && (
                          <span className="text-[9px] font-mono px-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5 text-emerald-500/60" />
                            {routine.start_time_planned} - {routine.end_time_planned}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 font-medium text-zinc-300">
                    {getFrequencyLabel(routine.frequency, routine.interval, routine.week_days)}
                  </td>
                  <td className="py-4 px-6 text-zinc-400">
                    {routine.project_name ? (
                      <span className="flex items-center gap-1.5 text-zinc-300">
                        <FolderKanban className="h-3.5 w-3.5 text-emerald-500/80" />
                        {routine.project_name}
                      </span>
                    ) : (
                      <span className="text-zinc-550 italic font-mono text-[10px]">-- Rotina Geral --</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-zinc-300 font-mono">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                      {routine.next_run}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <button
                      disabled={!canEditRoutine(routine)}
                      onClick={() => handleToggleActive(routine)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold border text-[10px] transition-all ${
                        !canEditRoutine(routine) ? "cursor-default" : "cursor-pointer"
                      } ${
                        routine.active
                          ? `bg-emerald-500/10 text-emerald-450 border-emerald-500/30 ${canEditRoutine(routine) ? "hover:bg-emerald-500/20" : ""}`
                          : `bg-amber-500/10 text-amber-450 border-amber-500/30 ${canEditRoutine(routine) ? "hover:bg-amber-500/20" : ""}`
                      }`}
                    >
                      {routine.active ? (
                        <>
                          <Play className="h-2.5 w-2.5 fill-current" />
                          Ativa
                        </>
                      ) : (
                        <>
                          <Pause className="h-2.5 w-2.5 fill-current" />
                          Pausada
                        </>
                      )}
                    </button>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleStartEdit(routine)}
                        className="text-zinc-500 hover:text-emerald-400 transition-colors p-1.5 hover:bg-emerald-500/10 rounded-lg cursor-pointer"
                        title={canEditRoutine(routine) ? "Editar rotina" : "Ver detalhes"}
                      >
                        {canEditRoutine(routine) ? (
                          <Pencil className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                      {canEditRoutine(routine) && (
                        <button
                          onClick={() => handleDeleteRoutine(routine.id)}
                          className="text-zinc-500 hover:text-red-400 transition-colors p-1.5 hover:bg-red-500/10 rounded-lg cursor-pointer"
                          title="Excluir rotina"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {getFilteredRoutines().length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-12 px-6 text-center text-zinc-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CalendarClock className="h-10 w-10 text-zinc-650" />
                      <p className="font-semibold text-sm">Nenhuma rotina recorrente encontrada</p>
                      <p className="text-[11px]">Altere os filtros ou adicione uma nova rotina recorrente.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {hasMore && (
            <div className="flex justify-center border-t border-zinc-800 p-4">
              <button
                onClick={loadMoreRoutines}
                disabled={loading}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors py-1.5 px-3 rounded-lg hover:bg-zinc-850 font-semibold cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Carregar Mais Rotinas
              </button>
            </div>
          )}
        </div>
      )}

      {/* CREATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              {!editingRoutine ? (
                <>
                  <CalendarClock className="h-5 w-5 text-emerald-400" />
                  Nova Rotina Recorrente
                </>
              ) : canEditRoutine(editingRoutine) ? (
                <>
                  <Pencil className="h-5 w-5 text-emerald-400" />
                  Editar Rotina Recorrente
                </>
              ) : (
                <>
                  <Eye className="h-5 w-5 text-zinc-400" />
                  Detalhes da Rotina
                </>
              )}
            </h2>
            <form onSubmit={handleRoutineSubmit} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                
                {/* General Info */}
                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Título da Rotina</label>
                  <input
                    type="text"
                    required
                    disabled={!canEditRoutine(editingRoutine)}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Ex: Reunião Semanal de Alinhamento"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Descrição das Atividades Geradas</label>
                  <textarea
                    disabled={!canEditRoutine(editingRoutine)}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-16 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Descreva o que será feito quando a rotina rodar..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Projeto Vinculado</label>
                  <select
                    disabled={!canEditRoutine(editingRoutine)}
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="" className="bg-zinc-950 text-white">-- Sem vínculo (Rotina Geral) --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id} className="bg-zinc-950 text-white">{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tipo da Atividade Gerada</label>
                  <select
                    disabled={!canEditRoutine(editingRoutine)}
                    value={type}
                    onChange={(e) => setType(e.target.value as RecurringRoutine["type"])}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="rotina" className="bg-zinc-950 text-white">Rotina</option>
                    <option value="projeto" className="bg-zinc-950 text-white">Projeto</option>
                    <option value="planejamento" className="bg-zinc-950 text-white">Planejamento</option>
                    <option value="capacitacao" className="bg-zinc-950 text-white">Capacitação</option>
                    <option value="reuniao" className="bg-zinc-950 text-white">Reunião</option>
                    <option value="atendimento" className="bg-zinc-950 text-white">Atendimento</option>
                    <option value="suporte" className="bg-zinc-950 text-white">Suporte</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Prioridade</label>
                  <select
                    disabled={!canEditRoutine(editingRoutine)}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as RecurringRoutine["priority"])}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="baixa" className="bg-zinc-950 text-white">Baixa</option>
                    <option value="media" className="bg-zinc-950 text-white">Média</option>
                    <option value="alta" className="bg-zinc-950 text-white">Alta</option>
                    <option value="critica" className="bg-zinc-950 text-white">Crítica</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Horas Planejadas</label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={hoursPlanned}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 text-sm text-zinc-400 focus:outline-none cursor-not-allowed"
                    placeholder="Calculado automaticamente..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Hora de Início (Planejado)</label>
                  <input
                    type="time"
                    disabled={!canEditRoutine(editingRoutine)}
                    value={startTimePlanned}
                    onChange={(e) => setStartTimePlanned(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Hora de Fim (Planejado)</label>
                  <input
                    type="time"
                    disabled={!canEditRoutine(editingRoutine)}
                    value={endTimePlanned}
                    onChange={(e) => setEndTimePlanned(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Recurrence Lógica */}
                <div className="space-y-2 col-span-2 border-t border-zinc-850 pt-4 mt-2">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Regra de Recorrência
                  </h3>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Frequência</label>
                  <select
                    disabled={!canEditRoutine(editingRoutine)}
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as RecurringRoutine["frequency"])}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="hora" className="bg-zinc-950 text-white">A cada hora (Cron diário executa 1x/dia)</option>
                    <option value="dia" className="bg-zinc-950 text-white">Dia(s)</option>
                    <option value="semana" className="bg-zinc-950 text-white">Semana(s)</option>
                    <option value="mes" className="bg-zinc-950 text-white">Mês(es)</option>
                    <option value="ano" className="bg-zinc-950 text-white">Ano(s)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Intervalo (A cada X períodos)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    disabled={!canEditRoutine(editingRoutine)}
                    value={interval}
                    onChange={(e) => setInterval(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Ex: 2 (A cada 2 períodos)"
                  />
                </div>

                {/* Week days checklist (Visible only when Weekly is selected) */}
                {frequency === "semana" && (
                  <div className="space-y-2 col-span-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Dias da Semana</label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {[
                        { label: "Dom", value: 0 },
                        { label: "Seg", value: 1 },
                        { label: "Ter", value: 2 },
                        { label: "Qua", value: 3 },
                        { label: "Qui", value: 4 },
                        { label: "Sex", value: 5 },
                        { label: "Sáb", value: 6 }
                      ].map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          disabled={!canEditRoutine(editingRoutine)}
                          onClick={() => handleWeekdayCheckbox(day.value)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                            weekDays.includes(day.value)
                              ? "bg-emerald-500/10 text-emerald-450 border-emerald-500/30"
                              : "bg-zinc-950 text-zinc-550 border-zinc-800 hover:text-zinc-300"
                          }`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Início / Primeira Execução</label>
                  <input
                    type="date"
                    required
                    disabled={!canEditRoutine(editingRoutine)}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Additional details */}
                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Observações</label>
                  <textarea
                    disabled={!canEditRoutine(editingRoutine)}
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-14 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Observações adicionais para as atividades geradas..."
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tags (Separadas por vírgula)</label>
                  <input
                    type="text"
                    disabled={!canEditRoutine(editingRoutine)}
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Ex: Alinhamento, Semanal, NGD"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-zinc-850 bg-zinc-900/60 hover:bg-zinc-900 px-5 py-3 text-xs font-semibold text-zinc-400 hover:text-white transition-all cursor-pointer"
                >
                  {canEditRoutine(editingRoutine) ? "Cancelar" : "Fechar"}
                </button>
                {canEditRoutine(editingRoutine) && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-450 hover:to-teal-550 px-5 py-3 text-xs font-bold text-white transition-all shadow-md shadow-emerald-950/20 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {editingRoutine ? "Salvando..." : "Criando..."}
                      </>
                    ) : (
                      <>
                        {editingRoutine ? "Salvar Alterações" : "Criar Rotina"}
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
