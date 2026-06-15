"use client";

import React, { useEffect, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { 
  getProjects, 
  createProject, 
  updateProjectStatus,
  updateProject,
  deleteProject
} from "@/services/projects";
import { getProfiles } from "@/services/profiles";
import { Project, Category } from "@/types";
import { getSectors, getCategories, normalizeKey } from "@/services/registrations";
import { 
  FolderKanban, 
  Plus, 
  Calendar, 
  Clock, 
  ChevronRight,
  Filter,
  FolderOpen,
  Pencil,
  Eye,
  Settings,
  Archive,
  Search,
  Lock,
  Trash2,
  HelpCircle
} from "lucide-react";
import { db, auth } from "@/lib/firebase/client";
import { doc, onSnapshot, DocumentSnapshot } from "firebase/firestore";
import { updateArchiveDaysLimit } from "@/services/settings";
import { useToast } from "@/context/ToastContext";

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

export default function ProjectsPage() {
  const { user, profile, hasPermission } = useAuthContext();
  const { addToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [filterText, setFilterText] = useState("");
  const [filterResponsible, setFilterResponsible] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterDateShortcut, setFilterDateShortcut] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterOrigem, setFilterOrigem] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditStatusModalOpen, setIsEditStatusModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  
  // View mode & Drag and Drop state for projects
  const [viewMode, setViewMode] = useState<"grid" | "kanban">("kanban");
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [activeDragProjectColumn, setActiveDragProjectColumn] = useState<string | null>(null);
  
  // Form fields for new project
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("desenvolvimento");
  const [priority, setPriority] = useState<Project["priority"]>("media");
  const [deadline, setDeadline] = useState("");
  const [seiCode, setSeiCode] = useState("");
  const [origem, setOrigem] = useState("");
  const [demandSources, setDemandSources] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
  const [estimatedHours, setEstimatedHours] = useState("");
  const [observations, setObservations] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // Lista de perfis para seleção do responsável
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [responsibleId, setResponsibleId] = useState("");
  const [editResponsibleId, setEditResponsibleId] = useState("");
  
  // Form fields for editing status
  const [newStatus, setNewStatus] = useState<Project["status"]>("em_andamento");

  // Configuração e Filtro de Arquivamento
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDaysLimit, setArchiveDaysLimit] = useState<number>(30);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // Modal de Edição Geral do Projeto
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Estados dos campos de Edição
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<string>("desenvolvimento");
  const [editPriority, setEditPriority] = useState<Project["priority"]>("media");
  const [editDeadline, setEditDeadline] = useState("");
  const [editSeiCode, setEditSeiCode] = useState("");
  const [editOrigem, setEditOrigem] = useState("");
  const [editEstimatedHours, setEditEstimatedHours] = useState("");
  const [editObservations, setEditObservations] = useState("");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editStatus, setEditStatus] = useState<Project["status"]>("planejamento");

  // Escuta configurações do limite de dias de arquivamento no banco de dados
  useEffect(() => {
    if (!user || !auth.currentUser) return;
    const docRef = doc(db, "metrics", "global");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data.archive_days_limit === "number") {
          setArchiveDaysLimit(data.archive_days_limit);
        }
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Carrega setores (origem de demanda) e categorias dinâmicas do Firestore
  useEffect(() => {
    if (!user || !auth.currentUser) return;
    const fetchAuxiliaryData = async () => {
      try {
        const [sectorsData, categoriesData] = await Promise.all([
          getSectors(),
          getCategories()
        ]);
        setAvailableCategories(categoriesData);
        setDemandSources(sectorsData.map((s) => s.name));
      } catch (err) {
        console.error("Erro ao carregar dados dinâmicos de setores e categorias:", err);
      }
    };
    fetchAuxiliaryData();
  }, [user]);

  // Carrega perfis para listagem de responsáveis
  useEffect(() => {
    const fetchProfiles = async () => {
      if (!user || !auth.currentUser) return;
      try {
        const data = await getProfiles();
        setAllProfiles(data);
      } catch (err) {
        console.error("Erro ao obter perfis:", err);
      }
    };
    fetchProfiles();
  }, [user]);

  useEffect(() => {
    if (user && !responsibleId) {
      setResponsibleId(user.uid);
    }
  }, [user, responsibleId]);

  const isProjectArchived = (project: Project, limitDays: number) => {
    if (project.status === "arquivado") return true;
    if (project.status === "concluido" && project.updated_at) {
      const diffTime = Math.abs(new Date().getTime() - new Date(project.updated_at).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > limitDays;
    }
    return false;
  };

  const canEditProject = (project: Project | null) => {
    if (!project) return false;
    return hasPermission("projects", "update");
  };

  const canDeleteProject = (project: Project | null) => {
    if (!project) return false;
    return hasPermission("projects", "delete");
  };

  const handleOpenEditModal = (project: Project) => {
    setEditingProject(project);
    setEditName(project.name || "");
    setEditDescription(project.description || "");
    setEditCategory(project.category || "desenvolvimento");
    setEditPriority(project.priority || "media");
    setEditDeadline(project.deadline || "");
    setEditSeiCode(project.codigo_processo_sei || "");
    setEditOrigem(project.origem_demanda || "");
    setEditEstimatedHours(project.estimated_hours ? String(project.estimated_hours) : "");
    setEditObservations(project.observations || "");
    setEditTagsInput(project.tags ? project.tags.join(", ") : "");
    setEditStatus(project.status || "planejamento");
    setEditResponsibleId(project.responsible_id || "");
    setIsEditModalOpen(true);
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !user) return;

    try {
      const tags = editTagsInput.split(",").map((t) => t.trim()).filter((t) => t !== "");
      const newEstimatedHours = Number(editEstimatedHours) || 0;
      
      const statusChanged = editingProject.status !== editStatus;
      
      if (statusChanged) {
        await updateProjectStatus({
          projectId: editingProject.id,
          oldStatus: editingProject.status,
          newStatus: editStatus,
          userId: user.uid,
          userEmail: user.email || "",
        });
      }

      const selectedResp = allProfiles.find(p => p.id === editResponsibleId) || { 
        id: editingProject.responsible_id, 
        full_name: editingProject.responsible_name 
      };

      // Case-insensitive demand source normalization
      let finalEditOrigem = editOrigem.trim();
      if (finalEditOrigem) {
        const matched = demandSources.find(
          (s) => s.toLowerCase() === finalEditOrigem.toLowerCase()
        );
        if (matched) {
          finalEditOrigem = matched;
        }
      }

      const updates: Partial<Project> = {
        name: editName,
        description: editDescription,
        category: editCategory,
        priority: editPriority,
        deadline: editDeadline || "",
        codigo_processo_sei: editSeiCode,
        origem_demanda: finalEditOrigem,
        estimated_hours: newEstimatedHours,
        observations: editObservations,
        tags,
        responsible_id: selectedResp.id,
        responsible_name: selectedResp.full_name,
      };

      await updateProject(editingProject.id, updates);

      setProjects((prev) =>
        prev.map((p) =>
          p.id === editingProject.id
            ? { 
                ...p, 
                ...updates, 
                status: editStatus, 
                updated_at: new Date().toISOString() 
              }
            : p
        )
      );

      setIsEditModalOpen(false);
      setEditingProject(null);
      addToast("Projeto atualizado com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao editar projeto:", error);
      addToast("Ocorreu um erro ao editar o projeto.", "error");
    }
  };

  const handleDeleteProject = async () => {
    if (!editingProject) return;
    
    const confirmDelete = window.confirm(
      `Tem certeza que deseja excluir o projeto "${editingProject.name}"? Esta ação é irreversível.`
    );
    if (!confirmDelete) return;

    try {
      await deleteProject(editingProject);
      setIsEditModalOpen(false);
      setEditingProject(null);
      // Refresh local projects list
      const { projects: list } = await getProjects({ includeArchived: showArchived });
      setProjects(list);
      addToast("Projeto excluído com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao excluir projeto:", error);
      addToast("Ocorreu um erro ao excluir o projeto. Tente novamente.", "error");
    }
  };

  const loadMoreProjects = async () => {
    if (!lastVisible || loading) return;
    setLoading(true);
    try {
      const { projects: fetchedProjects, lastDoc } = await getProjects({
        status: statusFilter || undefined,
        lastVisible,
        includeArchived: true,
      });
      setProjects((prev) => [...prev, ...fetchedProjects]);
      setLastVisible(lastDoc);
      setHasMore(fetchedProjects.length === 25);
    } catch (error) {
      console.error("Erro ao carregar mais projetos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !auth.currentUser) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const { projects: fetchedProjects, lastDoc } = await getProjects({
          status: statusFilter || undefined,
          includeArchived: true,
        });
        if (!active) return;
        setProjects(fetchedProjects);
        setLastVisible(lastDoc);
        setHasMore(fetchedProjects.length === 25);
      } catch (error) {
        console.error("Erro ao carregar projetos:", error);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [user, statusFilter]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter((t) => t !== "");
      const selectedResp = allProfiles.find(p => p.id === responsibleId) || profile;
      
      // Case-insensitive demand source normalization
      let finalOrigem = origem.trim();
      if (finalOrigem) {
        const matched = demandSources.find(
          (s) => s.toLowerCase() === finalOrigem.toLowerCase()
        );
        if (matched) {
          finalOrigem = matched;
        }
      }

      const newProj = await createProject({
        name,
        description,
        status: "planejamento",
        category,
        priority,
        start_date: new Date().toISOString().split("T")[0],
        end_date: null,
        deadline,
        codigo_processo_sei: seiCode,
        origem_demanda: finalOrigem,
        estimated_hours: Number(estimatedHours) || 0,
        observations,
        tags,
        archived: false,
        responsible_id: selectedResp.id || user.uid,
        responsible_name: selectedResp.full_name || profile.full_name,
        members: [
          {
            profile_id: selectedResp.id || user.uid,
            full_name: selectedResp.full_name || profile.full_name,
            role_in_project: "responsavel",
            allocated_hours: Number(estimatedHours) || 0
          }
        ],
        created_by: user.uid,
      });

      setProjects((prev) => [newProj, ...prev]);
      setIsModalOpen(false);
      resetForm();
      addToast("Projeto criado com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao criar projeto:", error);
      addToast("Erro ao criar o projeto. Tente novamente.", "error");
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !user) return;

    try {
      await updateProjectStatus({
        projectId: selectedProject.id,
        oldStatus: selectedProject.status,
        newStatus: newStatus,
        userId: user.uid,
        userEmail: user.email || "",
      });

      // Update in local state
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProject.id
            ? { ...p, status: newStatus, updated_at: new Date().toISOString() }
            : p
        )
      );

      setIsEditStatusModalOpen(false);
      setSelectedProject(null);
      addToast("Status do projeto atualizado com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      addToast("Erro ao atualizar o status do projeto.", "error");
    }
  };

  const projectColumns: { label: string; status: Project["status"]; color: string }[] = [
    { label: "Planejamento", status: "planejamento", color: "border-zinc-800 bg-zinc-900/10 text-zinc-400" },
    { label: "Em Andamento", status: "em_andamento", color: "border-blue-500/20 bg-blue-500/5 text-blue-400" },
    { label: "Pausado", status: "pausado", color: "border-amber-500/20 bg-amber-500/5 text-amber-400" },
    { label: "Bloqueado", status: "bloqueado", color: "border-red-500/20 bg-red-500/5 text-red-400" },
    { label: "Concluído", status: "concluido", color: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" },
  ];

  if (showArchived) {
    projectColumns.push({ label: "Arquivado", status: "arquivado", color: "border-zinc-800/80 bg-zinc-900/20 text-zinc-500" });
  }

  const getFilteredProjects = () => {
    let list = [...projects];

    // Busca textual (Nome, Descrição, SEI e Tags)
    if (filterText.trim()) {
      const searchVal = filterText.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(searchVal) ||
          (p.description && p.description.toLowerCase().includes(searchVal)) ||
          p.codigo_processo_sei.toLowerCase().includes(searchVal) ||
          (p.numero_sei && p.numero_sei.toLowerCase().includes(searchVal)) ||
          p.tags.some((tag) => tag.toLowerCase().includes(searchVal))
      );
    }

    // Filtro de Responsável
    if (filterResponsible) {
      list = list.filter((p) => p.responsible_id === filterResponsible);
    }

    // Filtro de Categoria
    if (filterCategory) {
      list = list.filter((p) => p.category === filterCategory);
    }

    // Filtro de Prioridade
    if (filterPriority) {
      list = list.filter((p) => p.priority === filterPriority);
    }

    // Filtro por Tag
    if (filterTag) {
      list = list.filter((p) => p.tags && p.tags.includes(filterTag));
    }

    // Filtro por Origem de Demanda
    if (filterOrigem) {
      list = list.filter((p) => p.origem_demanda === filterOrigem);
    }

    // Filtro por Data Limite (Intervalo ou Atalho)
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
      list = list.filter((p) => p.deadline >= startDate);
    }
    if (endDate) {
      list = list.filter((p) => p.deadline <= endDate);
    }

    return list;
  };

  const getColProjects = (status: Project["status"]) => {
    const list = getFilteredProjects();
    if (status === "arquivado") {
      return list.filter((p) => isProjectArchived(p, archiveDaysLimit));
    }
    return list.filter(
      (p) => p.status === status && !isProjectArchived(p, archiveDaysLimit)
    );
  };

  const handleMoveProjectStatus = async (project: Project, status: Project["status"]) => {
    if (!user) return;
    try {
      await updateProjectStatus({
        projectId: project.id,
        oldStatus: project.status,
        newStatus: status,
        userId: user.uid,
        userEmail: user.email || "",
      });

      // Sincroniza a flag archived com o status no banco de dados para retrocompatibilidade
      await updateProject(project.id, { archived: status === "arquivado" });

      // Update in local state
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? { ...p, status, archived: status === "arquivado", updated_at: new Date().toISOString() }
            : p
        )
      );
      addToast(`Status do projeto "${project.name}" atualizado!`, "success");
    } catch (error) {
      console.error("Erro ao mover status do projeto:", error);
      addToast("Erro ao atualizar o status do projeto.", "error");
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setCategory("desenvolvimento");
    setPriority("media");
    setDeadline("");
    setSeiCode("");
    setOrigem("");
    setEstimatedHours("");
    setObservations("");
    setTagsInput("");
  };

  const getPriorityColor = (p: Project["priority"]) => {
    switch (p) {
      case "critica":
        return "text-red-400 border-red-500/20 bg-red-550/10";
      case "alta":
        return "text-amber-400 border-amber-500/20 bg-amber-550/10";
      case "media":
        return "text-emerald-400 border-emerald-500/20 bg-emerald-550/10";
      default:
        return "text-zinc-400 border-zinc-550/20 bg-zinc-550/10";
    }
  };

  const getStatusLabel = (s: Project["status"]) => {
    switch (s) {
      case "planejamento":
        return "Planejamento";
      case "em_andamento":
        return "Em Andamento";
      case "pausado":
        return "Pausado";
      case "bloqueado":
        return "Bloqueado";
      case "concluido":
        return "Concluído";
      case "arquivado":
        return "Arquivado";
      default:
        return "Cancelado";
    }
  };

  const getStatusColor = (s: Project["status"]) => {
    switch (s) {
      case "concluido":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
      case "em_andamento":
        return "bg-blue-500/10 text-blue-400 border-blue-500/25";
      case "pausado":
        return "bg-zinc-800 text-zinc-400 border-zinc-700";
      case "bloqueado":
        return "bg-red-500/10 text-red-400 border-red-500/25";
      case "arquivado":
        return "bg-zinc-950 text-zinc-500 border-zinc-800";
      default:
        return "bg-zinc-850 text-zinc-500 border-zinc-800";
    }
  };

  // RBAC checks
  const canModify = hasPermission("projects", "update");
  const canCreate = hasPermission("projects", "create");

  const canModifyProjectStatus = (project: Project) => {
    return hasPermission("projects", "update");
  };

  const allUniqueTags = Array.from(
    new Set(projects.flatMap((p) => p.tags || []))
  ).sort();

  const hasActiveFilters = 
    statusFilter !== "" ||
    filterResponsible !== "" ||
    filterCategory !== "" ||
    filterPriority !== "" ||
    filterTag !== "" ||
    filterOrigem !== "" ||
    filterDateShortcut !== "";

  if (!hasPermission("projects", "read")) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-center p-6 bg-zinc-950">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500 mb-4 border border-red-500/20">
          <Lock className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Acesso Restrito</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          Você não tem permissão para visualizar a página de Projetos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Projetos</h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            Acompanhamento, governança e lançamento dos projetos institucionais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Configuração de Dias (Apenas Admin/Gestor) */}
          {canModify && (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
              <Settings className="h-3.5 w-3.5 text-zinc-500" />
              <span>Auto-arquivar após:</span>
              <input
                type="number"
                min={1}
                disabled={isUpdatingSettings}
                value={archiveDaysLimit}
                onChange={async (e) => {
                  const val = Number(e.target.value);
                  if (val > 0) {
                    setArchiveDaysLimit(val);
                    setIsUpdatingSettings(true);
                    try {
                      await updateArchiveDaysLimit(val);
                    } catch (err) {
                      console.error("Erro ao atualizar limite:", err);
                    } finally {
                      setIsUpdatingSettings(false);
                    }
                  }
                }}
                className="w-12 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-center text-white focus:outline-none focus:border-emerald-500 text-[11px] disabled:opacity-50"
              />
              <span>dias</span>
            </div>
          )}

          {/* Toggle de Arquivados */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
              showArchived
                ? "bg-zinc-800 border-zinc-750 text-white"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            <Archive className="h-4 w-4" />
            {showArchived ? "Ocultar Arquivados" : "Mostrar Arquivados"}
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Grade
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                viewMode === "kanban"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Kanban
            </button>
          </div>

          {canCreate && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:bg-zinc-100 hover:shadow-lg active:scale-95 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Novo Projeto
            </button>
          )}
        </div>
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
              placeholder="Buscar por nome, SEI, tag..."
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
            {/* Filtrar por Categoria */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Categoria</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todas as Categorias</option>
                {availableCategories.map((c) => (
                  <option key={c.id} value={(c as any).key || normalizeKey(c.name)} className="bg-zinc-950">
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Responsável */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Responsável</label>
              <select
                value={filterResponsible}
                onChange={(e) => setFilterResponsible(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todos os Responsáveis</option>
                {Array.from(new Set(projects.map(p => JSON.stringify({id: p.responsible_id, name: p.responsible_name}))))
                  .map(str => JSON.parse(str) as {id: string, name: string})
                  .filter(r => r.id && r.name)
                  .map((resp) => (
                    <option key={resp.id} value={resp.id} className="bg-zinc-950">{resp.name}</option>
                  ))
                }
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

            {/* Filtrar por Origem de Demanda */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Origem de Demanda</label>
              <select
                value={filterOrigem}
                onChange={(e) => setFilterOrigem(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todas as Origens</option>
                {demandSources.map((source) => (
                  <option key={source} value={source} className="bg-zinc-950">{source}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Período */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Período do Prazo</label>
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

            {/* Filtrar por Prazo Inicial (Condicional) */}
            {filterDateShortcut === "custom" && (
              <div className="relative">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Prazo Inicial</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full pl-3 pr-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all cursor-pointer block"
                  title="Prazo a partir de"
                />
              </div>
            )}

            {/* Filtrar por Prazo Final (Condicional) */}
            {filterDateShortcut === "custom" && (
              <div className="relative">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Prazo Final</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full pl-3 pr-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all cursor-pointer block"
                  title="Prazo até"
                />
              </div>
            )}
          </div>
        )}

        {/* Badges de Filtros Ativos */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-in fade-in duration-200">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mr-1">Filtros ativos:</span>
            
            {filterCategory && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Categoria: {availableCategories.find(c => ((c as any).key || normalizeKey(c.name)) === filterCategory)?.name || filterCategory}</span>
                <button onClick={() => setFilterCategory("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterResponsible && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Responsável: {allProfiles.find(p => p.id === filterResponsible)?.full_name || filterResponsible}</span>
                <button onClick={() => setFilterResponsible("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
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

            {filterTag && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Tag: {filterTag}</span>
                <button onClick={() => setFilterTag("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterOrigem && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Origem: {filterOrigem}</span>
                <button onClick={() => setFilterOrigem("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterDateShortcut && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>
                  Prazo: {
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
                setFilterCategory("");
                setFilterResponsible("");
                setFilterPriority("");
                setFilterTag("");
                setFilterOrigem("");
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

      {viewMode === "grid" ? (
        <>
          {/* Filters row */}
          <div className="flex items-center gap-4 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2 text-zinc-400">
              <Filter className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Filtrar por Status:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {["", "planejamento", "em_andamento", "pausado", "bloqueado", "concluido", ...(showArchived ? ["arquivado"] : [])].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all cursor-pointer ${
                    statusFilter === status
                      ? "bg-emerald-500/10 text-emerald-450 border-emerald-500/30"
                      : "bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:text-white"
                  }`}
                >
                  {status === "" ? "Todos" : getStatusLabel(status as Project["status"])}
                </button>
              ))}
            </div>
          </div>

          {/* Projects Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {getFilteredProjects().filter((project) => {
              const isArchived = isProjectArchived(project, archiveDaysLimit);
              if (!showArchived && isArchived) return false;
              if (statusFilter) {
                if (statusFilter === "arquivado") return isArchived;
                return project.status === statusFilter && !isArchived;
              }
              return true;
            }).map((project) => (
              <div
                key={project.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
                    return;
                  }
                  handleOpenEditModal(project);
                }}
                className="flex flex-col rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-6 backdrop-blur-md hover:border-zinc-750 transition-all shadow-md group cursor-pointer"
              >
                {/* Header info */}
                <div className="flex items-start justify-between gap-4">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getPriorityColor(project.priority)}`}>
                    {project.priority.toUpperCase()}
                  </span>
                  <div className="flex items-center gap-2">
                    {canEditProject(project) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveProjectStatus(project, project.status === "arquivado" ? "em_andamento" : "arquivado");
                        }}
                        className="text-zinc-550 hover:text-white transition-colors cursor-pointer"
                        title={project.status === "arquivado" ? "Reativar Projeto" : "Arquivar Projeto"}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (canModifyProjectStatus(project)) {
                          setSelectedProject(project);
                          setNewStatus(project.status);
                          setIsEditStatusModalOpen(true);
                        }
                      }}
                      disabled={!canModifyProjectStatus(project)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getStatusColor(project.status)} ${
                        canModifyProjectStatus(project) ? "hover:scale-105 cursor-pointer" : ""
                      }`}
                    >
                      {getStatusLabel(project.status)}
                    </button>
                  </div>
                </div>

                <h3 className="mt-4 text-lg font-bold text-white leading-snug group-hover:text-emerald-450 transition-colors">
                  {project.name}
                </h3>
                <p className="mt-2 text-xs text-zinc-450 line-clamp-3 leading-relaxed flex-grow">
                  {project.description}
                </p>

                {/* Progress bar */}
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-zinc-400">
                    <span>Progresso</span>
                    <span className="text-white">{project.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-850 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-emerald-500 transition-all duration-350"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Redundant info section */}
                <div className="mt-6 pt-4 border-t border-zinc-850/60 grid grid-cols-2 gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Clock className="h-3.5 w-3.5 text-zinc-500" />
                    <div>
                      <p className="text-[10px] text-zinc-550 uppercase font-semibold">Horas Exec.</p>
                      <p className="font-semibold text-zinc-350">{project.executed_hours.toFixed(1)}h / {project.estimated_hours}h</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                    <div>
                      <p className="text-[10px] text-zinc-550 uppercase font-semibold">Prazo</p>
                      <p className="font-semibold text-zinc-350">{project.deadline || "Sem prazo"}</p>
                    </div>
                  </div>
                </div>

                {/* Responsible */}
                <div className="mt-6 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-850/60 pt-3">
                  <span>Resp: <strong className="text-zinc-400">{project.responsible_name}</strong></span>
                  <span className="font-mono text-[9px] text-zinc-600 bg-zinc-950/40 px-1.5 py-0.5 rounded border border-zinc-850/40">
                    SEI: {project.codigo_processo_sei || "N/A"}
                  </span>
                </div>
              </div>
            ))}

            {getFilteredProjects().filter((project) => {
              const isArchived = isProjectArchived(project, archiveDaysLimit);
              if (!showArchived && isArchived) return false;
              if (statusFilter) {
                if (statusFilter === "arquivado") return isArchived;
                return project.status === statusFilter && !isArchived;
              }
              return true;
            }).length === 0 && !loading && (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-center">
                <FolderOpen className="h-12 w-12 text-zinc-650" />
                <p className="mt-4 text-sm font-semibold text-zinc-400">Nenhum projeto encontrado</p>
                <p className="mt-1 text-xs text-zinc-500">Altere os filtros ou crie um novo projeto.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Projects Kanban Board Grid */
        <div 
          className="grid gap-6 items-start overflow-x-auto pb-4 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750"
          style={{ gridTemplateColumns: `repeat(${projectColumns.length}, minmax(220px, 1fr))` }}
        >
          {projectColumns.map((column) => {
            const colProjects = getColProjects(column.status);
            
            return (
              <div 
                key={column.status} 
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setActiveDragProjectColumn(column.status);
                }}
                onDragLeave={() => {
                  setActiveDragProjectColumn(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setActiveDragProjectColumn(null);
                  const projectId = e.dataTransfer.getData("text/plain") || draggedProjectId;
                  if (projectId) {
                    const project = projects.find((proj) => proj.id === projectId);
                    if (project && project.status !== column.status && canModifyProjectStatus(project)) {
                      handleMoveProjectStatus(project, column.status);
                    }
                  }
                }}
                className={`flex flex-col rounded-xl border transition-all duration-200 p-4 min-w-[220px] ${
                  activeDragProjectColumn === column.status
                    ? "border-blue-500/50 bg-blue-500/5 shadow-lg shadow-blue-500/5 scale-[1.01]"
                    : "border-zinc-800/80 bg-zinc-900/10"
                }`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-zinc-850/80 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{column.label}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-850 text-zinc-400">
                    {colProjects.length}
                  </span>
                </div>
 
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
                  {colProjects.map((project) => (
                    <div
                      key={project.id}
                      draggable={canModifyProjectStatus(project)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", project.id);
                        setDraggedProjectId(project.id);
                      }}
                      onDragEnd={() => {
                        setDraggedProjectId(null);
                      }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
                          return;
                        }
                        handleOpenEditModal(project);
                      }}
                      className={`relative group rounded-lg border p-4 transition-all duration-200 ${
                        canModifyProjectStatus(project) 
                          ? "cursor-grab active:cursor-grabbing" 
                          : "cursor-default"
                      } ${
                        draggedProjectId === project.id 
                          ? "border-zinc-750 bg-zinc-900/20 opacity-40 scale-95" 
                          : "border-zinc-850 bg-zinc-950/40 hover:border-zinc-750 hover:shadow-lg hover:shadow-black/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${getPriorityColor(project.priority)}`}>
                          {project.priority.toUpperCase()}
                        </span>
                        {/* Indicador de ação (Visualizar ou Editar) no hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-zinc-555 flex items-center gap-1.5">
                          {canEditProject(project) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveProjectStatus(project, project.status === "arquivado" ? "em_andamento" : "arquivado");
                              }}
                              className="text-zinc-450 hover:text-white transition-colors cursor-pointer"
                              title={project.status === "arquivado" ? "Reativar Projeto" : "Arquivar Projeto"}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canEditProject(project) ? (
                            <span title="Editar Projeto">
                              <Pencil className="h-3 w-3 text-zinc-400" />
                            </span>
                          ) : (
                            <span title="Ver Detalhes">
                              <Eye className="h-3 w-3 text-zinc-500" />
                            </span>
                          )}
                        </div>
                      </div>
 
                      <h4 className="mt-3 text-sm font-bold text-white leading-snug group-hover:text-emerald-450 transition-colors">
                        {project.name}
                      </h4>
 
                      <p className="mt-2 text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                        {project.description}
                      </p>
 
                      {/* Progress bar */}
                      <div className="mt-4">
                        <div className="flex justify-between text-[10px] text-zinc-400 font-semibold mb-1">
                          <span>Progresso</span>
                          <span>{project.progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>
 
                      <div className="mt-4 flex items-center justify-between text-[10px] text-zinc-550 border-t border-zinc-850/60 pt-3">
                        <span className="truncate max-w-[100px]" title={project.responsible_name}>
                          Resp: {project.responsible_name}
                        </span>
                        <span>{project.executed_hours.toFixed(1)}h</span>
                      </div>
                    </div>
                  ))}
 
                  {colProjects.length === 0 && (
                    <div className="py-12 border border-dashed border-zinc-850 rounded-lg text-center flex flex-col items-center justify-center">
                      <FolderKanban className="h-6 w-6 text-zinc-700" />
                      <span className="mt-2 text-[10px] text-zinc-550 font-semibold uppercase">Vazio</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Load More Button */}
      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => loadMoreProjects()}
            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 hover:text-white px-5 py-2.5 text-xs font-semibold text-zinc-450 transition-all cursor-pointer"
          >
            Carregar Mais Projetos
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* NEW PROJECT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-emerald-400" />
              Novo Projeto
            </h2>
            <form onSubmit={handleCreateProject} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Nome do Projeto
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Nome identificador do projeto da carteira estratégica (ex: Novo Portal NGD).
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                    placeholder="Ex: Novo Portal NGD"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Descrição</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-20"
                    placeholder="Descrição detalhada dos objetivos do projeto..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Categoria
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Classificação temática do projeto de acordo com a área de atuação no NGD.
                      </div>
                    </div>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer"
                  >
                    {availableCategories.map((c) => (
                      <option key={c.id} value={(c as any).key || normalizeKey(c.name)} className="bg-zinc-950 text-white">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Prioridade</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Project["priority"])}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer"
                  >
                    <option value="baixa" className="bg-zinc-950 text-white">Baixa</option>
                    <option value="media" className="bg-zinc-950 text-white">Média</option>
                    <option value="alta" className="bg-zinc-950 text-white">Alta</option>
                    <option value="critica" className="bg-zinc-950 text-white">Crítica</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Responsável</label>
                  <select
                    value={responsibleId}
                    onChange={(e) => setResponsibleId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer"
                  >
                    {allProfiles.map((p) => (
                      <option key={p.id} value={p.id} className="bg-zinc-950 text-white">
                        {p.full_name} ({p.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Prazo (Deadline)</label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Horas Estimadas
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Total planejado de esforço em horas para conclusão de todo o projeto.
                      </div>
                    </div>
                  </label>
                  <input
                    type="number"
                    value={estimatedHours}
                    onChange={(e) => setEstimatedHours(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                    placeholder="Ex: 80"
                  />
                </div>

                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Processo SEI
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Identificador oficial do processo de tramitação na UEFS (formato sugerido: XXXXX.XXXXXX/AAAA-XX).
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    value={seiCode}
                    onChange={(e) => setSeiCode(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                    placeholder="00055-000213/2026-44"
                  />
                </div>

                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Origem da Demanda
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Indica o setor solicitante ou a motivação geradora do projeto (ex: NGD, Colegiados, Pró-Reitorias).
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    value={origem}
                    onChange={(e) => setOrigem(e.target.value)}
                    list="demand-sources-list"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                    placeholder="Ex: Reitoria / PGDP"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Tags (Separadas por vírgula)
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Palavras-chave separadas por vírgula para categorizar e facilitar a busca ou filtros rápidos no painel e relatórios.
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                    placeholder="Firebase, Nextjs, Serverless"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Observações</label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-14"
                    placeholder="Notas extras..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-2.5 text-xs font-semibold text-zinc-450 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 transition-all cursor-pointer"
                >
                  Criar Projeto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT STATUS MODAL */}
      {isEditStatusModalOpen && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsEditStatusModalOpen(false)} />
          <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold text-white mb-4">Atualizar Status do Projeto</h2>
            <p className="text-xs text-zinc-450 mb-6">
              Alterar o status de <strong className="text-white">&quot;{selectedProject.name}&quot;</strong> gerará um log automático na tabela de auditoria.
            </p>
            <form onSubmit={handleUpdateStatus} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Novo Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as Project["status"])}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer"
                >
                  <option value="planejamento">Planejamento</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="pausado">Pausado</option>
                  <option value="bloqueado">Bloqueado</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditStatusModalOpen(false)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-semibold text-zinc-450 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 transition-all cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT / VIEW PROJECT DETAILS MODAL */}
      {isEditModalOpen && editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => {
            setIsEditModalOpen(false);
            setEditingProject(null);
          }} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              {canEditProject(editingProject) ? (
                <>
                  <Pencil className="h-5 w-5 text-emerald-400" />
                  Editar Projeto
                </>
              ) : (
                <>
                  <Eye className="h-5 w-5 text-zinc-400" />
                  Detalhes do Projeto
                </>
              )}
            </h2>
            <form onSubmit={handleEditProject} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Nome do Projeto
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Nome identificador do projeto da carteira estratégica (ex: Novo Portal NGD).
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!canEditProject(editingProject)}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Ex: Novo Portal NGD"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Descrição</label>
                  <textarea
                    disabled={!canEditProject(editingProject)}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-20 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Descrição detalhada dos objetivos..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Categoria
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Classificação temática do projeto de acordo com a área de atuação no NGD.
                      </div>
                    </div>
                  </label>
                  <select
                    disabled={!canEditProject(editingProject)}
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {availableCategories.map((c) => (
                      <option key={c.id} value={(c as any).key || normalizeKey(c.name)} className="bg-zinc-950 text-white">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Prioridade</label>
                  <select
                    disabled={!canEditProject(editingProject)}
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as Project["priority"])}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="baixa" className="bg-zinc-950 text-white">Baixa</option>
                    <option value="media" className="bg-zinc-950 text-white">Média</option>
                    <option value="alta" className="bg-zinc-950 text-white">Alta</option>
                    <option value="critica" className="bg-zinc-950 text-white">Crítica</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Status</label>
                  <select
                    disabled={!canEditProject(editingProject)}
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as Project["status"])}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="planejamento" className="bg-zinc-950 text-white">Planejamento</option>
                    <option value="em_andamento" className="bg-zinc-950 text-white">Em Andamento</option>
                    <option value="pausado" className="bg-zinc-950 text-white">Pausado</option>
                    <option value="bloqueado" className="bg-zinc-950 text-white">Bloqueado</option>
                    <option value="concluido" className="bg-zinc-950 text-white">Concluído</option>
                    <option value="cancelado" className="bg-zinc-950 text-white">Cancelado</option>
                    <option value="arquivado" className="bg-zinc-950 text-white">Arquivado</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Responsável</label>
                  <select
                    disabled={!canEditProject(editingProject)}
                    value={editResponsibleId}
                    onChange={(e) => setEditResponsibleId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {allProfiles.map((p) => (
                      <option key={p.id} value={p.id} className="bg-zinc-950 text-white">
                        {p.full_name} ({p.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Prazo (Deadline)</label>
                  <input
                    type="date"
                    disabled={!canEditProject(editingProject)}
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Horas Estimadas
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Total planejado de effort em horas para conclusão de todo o projeto.
                      </div>
                    </div>
                  </label>
                  <input
                    type="number"
                    disabled={!canEditProject(editingProject)}
                    value={editEstimatedHours}
                    onChange={(e) => setEditEstimatedHours(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Ex: 80"
                  />
                </div>

                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Processo SEI
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Identificador oficial do processo de tramitação na UEFS (formato sugerido: XXXXX.XXXXXX/AAAA-XX).
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    disabled={!canEditProject(editingProject)}
                    value={editSeiCode}
                    onChange={(e) => setEditSeiCode(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="00055-000213/2026-44"
                  />
                </div>

                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Origem da Demanda
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Indica o setor solicitante ou a motivação geradora do projeto (ex: NGD, Colegiados, Pró-Reitorias).
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    disabled={!canEditProject(editingProject)}
                    value={editOrigem}
                    onChange={(e) => setEditOrigem(e.target.value)}
                    list="demand-sources-list"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Ex: Reitoria / PGDP"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    Tags (Separadas por vírgula)
                    <div className="group relative inline-block">
                      <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-help" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-950 p-2 text-xs font-normal text-zinc-300 shadow-xl border border-zinc-800 opacity-0 transition-opacity group-hover:opacity-100 whitespace-normal normal-case">
                        Palavras-chave separadas por vírgula para categorizar e facilitar a busca ou filtros rápidos no painel e relatórios.
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    disabled={!canEditProject(editingProject)}
                    value={editTagsInput}
                    onChange={(e) => setEditTagsInput(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Firebase, Nextjs, Serverless"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Observações</label>
                  <textarea
                    disabled={!canEditProject(editingProject)}
                    value={editObservations}
                    onChange={(e) => setEditObservations(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-14 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Notas extras..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                {canEditProject(editingProject) && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (editingProject) {
                        const targetStatus = editStatus === "arquivado" ? "em_andamento" : "arquivado";
                        setEditStatus(targetStatus);
                        await handleMoveProjectStatus(editingProject, targetStatus);
                        setIsEditModalOpen(false);
                        setEditingProject(null);
                      }
                    }}
                    className="mr-auto rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition-all hover:bg-zinc-800 cursor-pointer flex items-center gap-1.5"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {editStatus === "arquivado" ? "Desarquivar" : "Arquivar"}
                  </button>
                )}
                {canDeleteProject(editingProject) && (
                  <button
                    type="button"
                    onClick={handleDeleteProject}
                    className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-2.5 text-xs font-semibold text-red-400 hover:text-red-300 transition-all hover:bg-red-950/40 hover:border-red-800/80 cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingProject(null);
                  }}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-2.5 text-xs font-semibold text-zinc-450 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer"
                >
                  {canEditProject(editingProject) ? "Cancelar" : "Fechar"}
                </button>
                {canEditProject(editingProject) && (
                  <button
                    type="submit"
                    className="rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 transition-all cursor-pointer"
                  >
                    Salvar Alterações
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Datalist for Demand Sources Autocomplete */}
      <datalist id="demand-sources-list">
        {[...demandSources].sort((a, b) => a.localeCompare(b)).map((source) => (
          <option key={source} value={source} />
        ))}
      </datalist>
    </div>
  );
}
