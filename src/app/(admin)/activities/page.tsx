"use client";

import React, { useEffect, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { 
  getActivities, 
  createActivity, 
  updateActivityStatus,
  deleteActivity,
  updateActivity,
  duplicateActivity,
  deleteActivitiesBatch,
  importActivitiesBatch
} from "@/services/activities";
import { getProjects } from "@/services/projects";
import { getProfiles } from "@/services/profiles";
import { logHours, getTimeLogs, deleteTimeLog } from "@/services/timeLogs";
import { Activity, Project, ActivityType, TimeLog } from "@/types";
import { getActivityTypes, normalizeKey } from "@/services/registrations";
import { 
  Plus, 
  Clock, 
  AlertCircle, 
  Folder, 
  CheckCircle,
  Play,
  RotateCcw,
  Trash2,
  ListTodo,
  Pencil,
  Eye,
  Settings,
  Archive,
  Search,
  Lock,
  LayoutGrid,
  List,
  Calendar,
  CalendarDays,
  CalendarRange,
  Copy,
  Download,
  Upload,
  Filter,
  Printer,
  XCircle
} from "lucide-react";
import { db, auth } from "@/lib/firebase/client";
import { doc, onSnapshot } from "firebase/firestore";
import { updateArchiveDaysLimit } from "@/services/settings";
import { escapeHtml } from "@/utils/sanitize";

const applyDateMask = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
};

const isValidDateStr = (str: string): boolean => {
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  if (!regex.test(str)) return false;
  
  const [, dayStr, monthStr, yearStr] = str.match(regex) || [];
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);
  
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
};

const ddmmyyyyToYyyymmdd = (str: string): string => {
  const parts = str.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return "";
};

const yyyymmddToDdmmyyyy = (str: string): string => {
  if (!str) return "";
  const parts = str.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
};

const getDaysInMonthForCalendar = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const days: { day: number | null; dateStr: string }[] = [];
  
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ day: null, dateStr: "" });
  }
  
  const totalDays = lastDay.getDate();
  for (let d = 1; d <= totalDays; d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    days.push({ day: d, dateStr: `${year}-${mm}-${dd}` });
  }
  
  return days;
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

export default function ActivitiesPage() {
  const { user, profile, hasPermission } = useAuthContext();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  
  // Filtros
  const [filterText, setFilterText] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterResponsible, setFilterResponsible] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterDateShortcut, setFilterDateShortcut] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterSector, setFilterSector] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modals
  const [isNewActivityOpen, setIsNewActivityOpen] = useState(false);
  const [isLogHoursOpen, setIsLogHoursOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  // Log Hours Form State
  const [hoursToLog, setHoursToLog] = useState("");
  const [logStartTimeExecuted, setLogStartTimeExecuted] = useState("");
  const [logEndTimeExecuted, setLogEndTimeExecuted] = useState("");
  const [logDescription, setLogDescription] = useState("");
  const [activityLogs, setActivityLogs] = useState<TimeLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Drag and Drop State
  const [draggedActivityId, setDraggedActivityId] = useState<string | null>(null);
  const [activeDragColumn, setActiveDragColumn] = useState<string | null>(null);
  const [activeDragDay, setActiveDragDay] = useState<string | null>(null);

  // New Activity Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<string>("projeto");
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [priority, setPriority] = useState<Activity["priority"]>("media");
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [hoursPlanned, setHoursPlanned] = useState("");
  const [startTimePlanned, setStartTimePlanned] = useState("");
  const [endTimePlanned, setEndTimePlanned] = useState("");
  const [startTimeExecuted, setStartTimeExecuted] = useState("");
  const [endTimeExecuted, setEndTimeExecuted] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [observations, setObservations] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list" | "day" | "week" | "month">("kanban");

  const getWeekRange = (dateStr: string) => {
    const baseDate = new Date(dateStr + "T12:00:00");
    const day = baseDate.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + diffToMonday);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const formatDate = (date: Date): string => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    
    return {
      start: formatDate(monday),
      end: formatDate(sunday)
    };
  };

  const handleSetViewMode = (mode: "kanban" | "list" | "day" | "week" | "month") => {
    setViewMode(mode);
    if (mode === "day") {
      const todayStr = new Date().toISOString().split("T")[0];
      const targetDate = filterStartDate || todayStr;
      setFilterDateShortcut("custom");
      setFilterStartDate(targetDate);
      setFilterEndDate(targetDate);
    } else if (mode === "week") {
      const todayStr = new Date().toISOString().split("T")[0];
      const targetDate = filterStartDate || todayStr;
      const weekRange = getWeekRange(targetDate);
      setFilterDateShortcut("custom");
      setFilterStartDate(weekRange.start);
      setFilterEndDate(weekRange.end);
    } else if (mode === "month") {
      const todayStr = new Date().toISOString().split("T")[0];
      const targetDate = filterStartDate || todayStr;
      const [year, month] = targetDate.split("-").map(Number);
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setFilterDateShortcut("custom");
      setFilterStartDate(start);
      setFilterEndDate(end);
    }
  };

  const handleNavigateDay = (direction: "prev" | "next" | "today") => {
    const today = new Date();
    
    if (viewMode === "week") {
      let currentDate = filterStartDate ? new Date(filterStartDate + "T12:00:00") : today;
      if (direction === "prev") {
        currentDate.setDate(currentDate.getDate() - 7);
      } else if (direction === "next") {
        currentDate.setDate(currentDate.getDate() + 7);
      } else {
        currentDate = today;
      }
      
      const formatDate = (date: Date): string => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };
      
      const weekRange = getWeekRange(formatDate(currentDate));
      setFilterDateShortcut("custom");
      setFilterStartDate(weekRange.start);
      setFilterEndDate(weekRange.end);
      return;
    }

    if (viewMode === "month") {
      let currentDate = filterStartDate ? new Date(filterStartDate + "T12:00:00") : today;
      if (direction === "prev") {
        currentDate.setMonth(currentDate.getMonth() - 1);
      } else if (direction === "next") {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else {
        currentDate = today;
      }
      
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const start = `${yyyy}-${mm}-01`;
      const lastDay = new Date(yyyy, currentDate.getMonth() + 1, 0).getDate();
      const end = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;
      
      setFilterDateShortcut("custom");
      setFilterStartDate(start);
      setFilterEndDate(end);
      return;
    }

    let currentDate = filterStartDate ? new Date(filterStartDate + "T12:00:00") : today;
    
    if (direction === "prev") {
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (direction === "next") {
      currentDate.setDate(currentDate.getDate() + 1);
    } else {
      currentDate = today;
    }
    
    const formatDate = (date: Date): string => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    
    const newDateStr = formatDate(currentDate);
    setFilterDateShortcut("custom");
    setFilterStartDate(newDateStr);
    setFilterEndDate(newDateStr);
  };

  const getWeekDays = () => {
    if (!filterStartDate) return [];
    const monday = new Date(filterStartDate + "T12:00:00");
    const days = [];
    const dayNames = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      days.push({
        dateStr,
        label: dayNames[i],
        formattedLabel: `${dayNames[i]}, ${dd}/${mm}`
      });
    }
    return days;
  };

  const getMonthDays = () => {
    if (!filterStartDate) return [];
    const [year, month] = filterStartDate.split("-").map(Number);
    const firstDayOfMonth = new Date(year, month - 1, 1);
    
    // Dia da semana do primeiro dia (0 = Domingo, 1 = Segunda, etc.)
    let startDayOfWeek = firstDayOfMonth.getDay();
    // Tratando Segunda-feira como início da semana (0 = Segunda, 6 = Domingo)
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(firstDayOfMonth.getDate() - startDayOfWeek);
    
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      days.push({
        dateStr,
        dayNum: d.getDate(),
        isCurrentMonth: d.getMonth() === month - 1
      });
    }
    return days;
  };

  const getMonthLabel = () => {
    if (!filterStartDate) return "";
    const [year, month] = filterStartDate.split("-").map(Number);
    const date = new Date(year, month - 1, 15);
    const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
  };

  const timeToFloat = (timeStr?: string) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(":").map(Number);
    return h + m / 60;
  };

  const formatTimeFromFloat = (val: number) => {
    const h = Math.floor(val);
    const m = Math.round((val - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const getOverlapStyle = (act: Activity, allActs: Activity[]) => {
    const tPlannedStart = timeToFloat(act.start_time_planned);
    const tPlannedEnd = timeToFloat(act.end_time_planned);
    const tExecutedStart = timeToFloat(act.start_time_executed);
    const tExecutedEnd = timeToFloat(act.end_time_executed);

    const tStart = tPlannedStart ?? tExecutedStart ?? 7.0;
    const tEnd = tPlannedEnd ?? tExecutedEnd ?? 8.0;

    const overlaps = allActs.filter((other) => {
      const oPlannedStart = timeToFloat(other.start_time_planned);
      const oPlannedEnd = timeToFloat(other.end_time_planned);
      const oExecutedStart = timeToFloat(other.start_time_executed);
      const oExecutedEnd = timeToFloat(other.end_time_executed);

      const oStart = oPlannedStart ?? oExecutedStart ?? 7.0;
      const oEnd = oPlannedEnd ?? oExecutedEnd ?? 8.0;

      return oStart < tEnd && oEnd > tStart;
    });

    overlaps.sort((a, b) => {
      const aPlannedStart = timeToFloat(a.start_time_planned);
      const aExecutedStart = timeToFloat(a.start_time_executed);
      const aStart = aPlannedStart ?? aExecutedStart ?? 7.0;

      const bPlannedStart = timeToFloat(b.start_time_planned);
      const bExecutedStart = timeToFloat(b.start_time_executed);
      const bStart = bPlannedStart ?? bExecutedStart ?? 7.0;

      if (aStart !== bStart) return aStart - bStart;
      return a.id.localeCompare(b.id);
    });

    const totalOverlap = overlaps.length || 1;
    const indexInOverlap = overlaps.findIndex((o) => o.id === act.id);

    const widthPct = 100 / totalOverlap;
    const leftPct = indexInOverlap * widthPct;

    return {
      leftPct: leftPct + 0.5,
      widthPct: widthPct - 1.0,
    };
  };

  // Lista de perfis para seleção do responsável
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [responsibleId, setResponsibleId] = useState("");
  const [editResponsibleId, setEditResponsibleId] = useState("");

  // Modal de Edição Geral da Atividade
  const [isEditActivityOpen, setIsEditActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ successCount: number; errors: number[]; total: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Estados dos campos de Edição de Atividade
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editType, setEditType] = useState<string>("projeto");
  const [editPriority, setEditPriority] = useState<Activity["priority"]>("media");
  const [editDate, setEditDate] = useState("");
  const [editDateError, setEditDateError] = useState("");
  const [isEditCalendarOpen, setIsEditCalendarOpen] = useState(false);
  const [editCalendarMonth, setEditCalendarMonth] = useState(new Date());
  const [editHoursPlanned, setEditHoursPlanned] = useState("");
  const [editStartTimePlanned, setEditStartTimePlanned] = useState("");
  const [editEndTimePlanned, setEditEndTimePlanned] = useState("");
  const [editStartTimeExecuted, setEditStartTimeExecuted] = useState("");
  const [editEndTimeExecuted, setEditEndTimeExecuted] = useState("");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editObservations, setEditObservations] = useState("");
  const [editStatus, setEditStatus] = useState<Activity["status"]>("pendente");

  const [resizingState, setResizingState] = useState<{
    activityId: string;
    type: "top" | "bottom";
    kind: "planned" | "executed";
    initialStart: string;
    initialEnd: string;
  } | null>(null);

  // Carrega os tipos de atividade do Firestore
  useEffect(() => {
    if (!user || !auth.currentUser) return;
    const fetchTypes = async () => {
      try {
        const data = await getActivityTypes();
        setActivityTypes(data);
      } catch (err) {
        console.error("Erro ao carregar tipos de atividade:", err);
      }
    };
    fetchTypes();
  }, [user]);

  // Atualiza automaticamente as horas planejadas na criação
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

  // Atualiza automaticamente as horas planejadas na edição
  useEffect(() => {
    if (editStartTimePlanned && editEndTimePlanned) {
      const calculated = calculateHoursBetween(editStartTimePlanned, editEndTimePlanned);
      if (calculated) {
        setEditHoursPlanned(calculated);
      } else {
        setEditHoursPlanned("");
      }
    } else {
      setEditHoursPlanned("");
    }
  }, [editStartTimePlanned, editEndTimePlanned]);

  // Atualiza automaticamente as horas trabalhadas ao lançar horas
  useEffect(() => {
    if (logStartTimeExecuted && logEndTimeExecuted) {
      const calculated = calculateHoursBetween(logStartTimeExecuted, logEndTimeExecuted);
      if (calculated) {
        setHoursToLog(calculated);
      } else {
        setHoursToLog("");
      }
    } else {
      setHoursToLog("");
    }
  }, [logStartTimeExecuted, logEndTimeExecuted]);

  useEffect(() => {
    if (!resizingState) return;

    const handleMouseUp = async () => {
      const finalAct = activities.find((a) => a.id === resizingState.activityId);
      if (finalAct) {
        const updates: any = {};
        if (resizingState.kind === "executed") {
          updates.start_time_executed = finalAct.start_time_executed || "";
          updates.end_time_executed = finalAct.end_time_executed || "";
        } else {
          updates.start_time_planned = finalAct.start_time_planned || "";
          updates.end_time_planned = finalAct.end_time_planned || "";
        }

        try {
          await updateActivity(resizingState.activityId, updates);
        } catch (error) {
          console.error("Erro ao salvar redimensionamento no Firestore:", error);
        }
      }
      setResizingState(null);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingState, activities]);

  const handleResizeHover = (hoverTimeVal: number) => {
    if (!resizingState) return;
    const { activityId, type, kind } = resizingState;

    setActivities((prev) =>
      prev.map((act) => {
        if (act.id !== activityId) return act;

        const updates: any = {};
        if (type === "top") {
          const limitEnd = timeToFloat(kind === "executed" ? act.end_time_executed : act.end_time_planned) || 22.0;
          const newStart = Math.min(hoverTimeVal, limitEnd - 0.5);

          if (kind === "executed") {
            updates.start_time_executed = formatTimeFromFloat(newStart);
          } else {
            updates.start_time_planned = formatTimeFromFloat(newStart);
          }
        } else {
          const limitStart = timeToFloat(kind === "executed" ? act.start_time_executed : act.start_time_planned) || 7.0;
          const newEnd = Math.max(hoverTimeVal + 0.5, limitStart + 0.5);

          if (kind === "executed") {
            updates.end_time_executed = formatTimeFromFloat(newEnd);
          } else {
            updates.end_time_planned = formatTimeFromFloat(newEnd);
          }
        }

        return {
          ...act,
          ...updates,
        };
      })
    );
  };

  // Configuração e Filtro de Arquivamento
  const [showArchived, setShowArchived] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);
  const [archiveDaysLimit, setArchiveDaysLimit] = useState<number>(30);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

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

  const isActivityArchived = (activity: Activity, limitDays: number) => {
    if (activity.status === "arquivado") return true;
    if (activity.status === "concluida" && activity.updated_at) {
      const diffTime = Math.abs(new Date().getTime() - new Date(activity.updated_at).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > limitDays;
    }
    return false;
  };

  const canEditActivity = (activity: Activity | null) => {
    if (!activity) return false;
    return hasPermission("activities", "update");
  };

  const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getPulseStyles = (activity: Activity) => {
    if (
      activity.status === "concluida" || 
      activity.status === "cancelada" || 
      activity.status === "arquivado" || 
      activity.archived
    ) {
      return "";
    }

    const todayStr = getLocalDateString();
    const actDateStr = activity.activity_date;

    if (!actDateStr) return "";

    if (actDateStr === todayStr) {
      return "animate-pulse-green border-emerald-500/80 bg-emerald-950/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]";
    }

    if (actDateStr < todayStr) {
      return "animate-pulse-red border-red-500/80 bg-red-950/10 shadow-[0_0_8px_rgba(239,68,68,0.2)]";
    }

    return "";
  };

  const handleOpenEditModal = (activity: Activity) => {
    setEditingActivity(activity);
    setEditTitle(activity.title || "");
    setEditDescription(activity.description || "");
    setEditProjectId(activity.project_id || "");
    setEditType(activity.type || "projeto");
    setEditPriority(activity.priority || "media");
    setEditDate(activity.activity_date ? yyyymmddToDdmmyyyy(activity.activity_date) : "");
    setEditDateError("");
    setEditCalendarMonth(activity.activity_date ? new Date(activity.activity_date + "T12:00:00") : new Date());
    setEditHoursPlanned(activity.hours_planned ? String(activity.hours_planned) : "");
    setEditTagsInput(activity.tags ? activity.tags.join(", ") : "");
    setEditObservations(activity.observations || "");
    setEditStatus(activity.status || "pendente");
    setEditResponsibleId(activity.responsible_id || "");
    setEditStartTimePlanned(activity.start_time_planned || "");
    setEditEndTimePlanned(activity.end_time_planned || "");
    setEditStartTimeExecuted(activity.start_time_executed || "");
    setEditEndTimeExecuted(activity.end_time_executed || "");
    setIsEditActivityOpen(true);
  };

  const handleEditActivitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingActivity || !user) return;

    if (!isValidDateStr(editDate)) {
      setEditDateError("Data inválida. Por favor informe no formato DD/MM/AAAA.");
      return;
    }

    try {
      const selectedProjectObj = projects.find((p) => p.id === editProjectId);
      const tags = editTagsInput.split(",").map((t) => t.trim()).filter((t) => t !== "");
      const hoursPlannedNum = Number(editHoursPlanned) || 0;

      let finalStartTimeExecuted = editStartTimeExecuted || "";
      let finalEndTimeExecuted = editEndTimeExecuted || "";
      let finalHoursExecuted = editingActivity.hours_executed || 0;

      if (editStatus === "concluida") {
        if (!finalStartTimeExecuted && editStartTimePlanned) {
          finalStartTimeExecuted = editStartTimePlanned;
        }
        if (!finalEndTimeExecuted && editEndTimePlanned) {
          finalEndTimeExecuted = editEndTimePlanned;
        }
        if (finalStartTimeExecuted && finalEndTimeExecuted) {
          const calcHours = calculateHoursBetween(finalStartTimeExecuted, finalEndTimeExecuted);
          if (calcHours) {
            finalHoursExecuted = Number(calcHours);
          }
        }
      }

      const statusChanged = editingActivity.status !== editStatus;
      let nextActivityObj: Activity | null = null;

      if (statusChanged) {
        const nextAct = await updateActivityStatus({
          activityId: editingActivity.id,
          oldStatus: editingActivity.status,
          newStatus: editStatus,
          userId: user.uid,
          userEmail: user.email || "",
        });
        if (nextAct) {
          nextActivityObj = nextAct;
        }
      }

      const selectedResp = allProfiles.find(p => p.id === editResponsibleId) || {
        id: editingActivity.responsible_id,
        full_name: editingActivity.responsible_name
      };

      const updates: Partial<Activity> = {
        title: editTitle,
        description: editDescription,
        project_id: editProjectId || null,
        project_name: selectedProjectObj ? selectedProjectObj.name : null,
        type: editType,
        priority: editPriority,
        activity_date: ddmmyyyyToYyyymmdd(editDate),
        hours_planned: hoursPlannedNum,
        observations: editObservations,
        tags,
        responsible_id: selectedResp.id,
        responsible_name: selectedResp.full_name,
        start_time_planned: editStartTimePlanned || "",
        end_time_planned: editEndTimePlanned || "",
        start_time_executed: finalStartTimeExecuted,
        end_time_executed: finalEndTimeExecuted,
        hours_executed: finalHoursExecuted,
      };

      const resultAct = await updateActivity(editingActivity.id, updates);
      if (resultAct) {
        nextActivityObj = resultAct;
      }

      setActivities((prev) => {
        let updatedList = prev.map((act) =>
          act.id === editingActivity.id
            ? {
                ...act,
                ...updates,
                status: editStatus,
                updated_at: new Date().toISOString(),
              }
            : act
        );
        if (nextActivityObj) {
          if (!updatedList.some(act => act.id === nextActivityObj.id)) {
            updatedList = [nextActivityObj, ...updatedList];
          }
        }
        return updatedList;
      });

      setIsEditActivityOpen(false);
      setEditingActivity(null);
    } catch (error) {
      console.error("Erro ao editar atividade:", error);
    }
  };


  useEffect(() => {
    if (!user || !auth.currentUser) return;
    let active = true;
    const loadData = async () => {
      try {
        const { activities: fetchedActivities } = await getActivities();
        const { projects: fetchedProjects } = await getProjects({ includeArchived: false });
        if (!active) return;
        setActivities(fetchedActivities);
        setProjects(fetchedProjects);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    const activeActivity = selectedActivity || editingActivity;
    const isOpen = isLogHoursOpen || isEditActivityOpen;

    if (isOpen && activeActivity) {
      setIsLoadingLogs(true);
      getTimeLogs({ activityId: activeActivity.id })
        .then(({ logs }) => {
          setActivityLogs(logs);
        })
        .catch((error) => {
          console.error("Erro ao carregar logs da atividade:", error);
        })
        .finally(() => {
          setIsLoadingLogs(false);
        });
    } else {
      setActivityLogs([]);
    }
  }, [isLogHoursOpen, isEditActivityOpen, selectedActivity, editingActivity]);

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    if (!isValidDateStr(date)) {
      setDateError("Data inválida. Por favor informe no formato DD/MM/AAAA.");
      return;
    }

    try {
      const selectedProjectObj = projects.find((p) => p.id === projectId);
      const tags = tagsInput.split(",").map((t) => t.trim()).filter((t) => t !== "");

      const selectedResp = allProfiles.find(p => p.id === responsibleId) || profile;

      const newAct = await createActivity({
        title,
        description,
        responsible_id: selectedResp.id || user.uid,
        responsible_name: selectedResp.full_name || profile.full_name,
        project_id: projectId || null,
        project_name: selectedProjectObj ? selectedProjectObj.name : null,
        type,
        status: "pendente",
        priority,
        activity_date: ddmmyyyyToYyyymmdd(date),
        hours_planned: Number(hoursPlanned) || 0,
        observations,
        tags,
        created_by: user.uid,
        start_time_planned: startTimePlanned || "",
        end_time_planned: endTimePlanned || "",
        start_time_executed: startTimeExecuted || "",
        end_time_executed: endTimeExecuted || "",
      });

      setActivities((prev) => [newAct, ...prev]);
      setIsNewActivityOpen(false);
      resetActivityForm();
    } catch (error) {
      console.error("Erro ao criar atividade:", error);
    }
  };

  const handleLogHoursSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity || !user || !profile) return;

    if (!logStartTimeExecuted || !logEndTimeExecuted || !hoursToLog) {
      alert("Por favor, informe horários de início e fim válidos para a execução.");
      return;
    }

    try {
      await logHours({
        person_id: user.uid,
        person_name: profile.full_name,
        activity_id: selectedActivity.id,
        activity_title: selectedActivity.title,
        project_id: selectedActivity.project_id,
        project_name: selectedActivity.project_name,
        log_date: new Date().toISOString().split("T")[0],
        hours: Number(hoursToLog),
        description: logDescription,
        is_overtime: false,
      });

      // Update in memory executed hours for this activity
      setActivities((prev) =>
        prev.map((act) =>
          act.id === selectedActivity.id
            ? { ...act, hours_executed: act.hours_executed + Number(hoursToLog) }
            : act
        )
      );

      setIsLogHoursOpen(false);
      setSelectedActivity(null);
      setHoursToLog("");
      setLogStartTimeExecuted("");
      setLogEndTimeExecuted("");
      setLogDescription("");
    } catch (error) {
      console.error("Erro ao lançar horas:", error);
    }
  };

  const handleDeleteTimeLog = async (log: TimeLog) => {
    if (!user || !profile) return;

    const isOwner = log.person_id === user.uid;
    const isManagerOrAdmin = profile.role === "admin" || profile.role === "gestor";

    if (!isOwner && !isManagerOrAdmin) {
      alert("Você não tem permissão para excluir este lançamento.");
      return;
    }

    if (!confirm("Tem certeza de que deseja excluir este lançamento de horas?")) {
      return;
    }

    try {
      await deleteTimeLog(log);

      const activeActivity = selectedActivity || editingActivity;
      if (activeActivity) {
        setActivities((prev) =>
          prev.map((act) =>
            act.id === activeActivity.id
              ? { ...act, hours_executed: Math.max(0, act.hours_executed - log.hours) }
              : act
          )
        );

        if (selectedActivity && selectedActivity.id === activeActivity.id) {
          setSelectedActivity((prev) => prev ? { ...prev, hours_executed: Math.max(0, prev.hours_executed - log.hours) } : null);
        }
        if (editingActivity && editingActivity.id === activeActivity.id) {
          setEditingActivity((prev) => prev ? { ...prev, hours_executed: Math.max(0, prev.hours_executed - log.hours) } : null);
        }
      }

      setActivityLogs((prev) => prev.filter((l) => l.id !== log.id));
    } catch (error) {
      console.error("Erro ao excluir lançamento de horas:", error);
      alert("Erro ao excluir lançamento de horas. Por favor, tente novamente.");
    }
  };

  const handleMoveStatus = async (activity: Activity, status: Activity["status"]) => {
    if (!user) return;
    try {
      let finalStartTimeExecuted = activity.start_time_executed || "";
      let finalEndTimeExecuted = activity.end_time_executed || "";
      let finalHoursExecuted = activity.hours_executed || 0;

      if (status === "concluida") {
        if (!finalStartTimeExecuted && activity.start_time_planned) {
          finalStartTimeExecuted = activity.start_time_planned;
        }
        if (!finalEndTimeExecuted && activity.end_time_planned) {
          finalEndTimeExecuted = activity.end_time_planned;
        }
        if (finalStartTimeExecuted && finalEndTimeExecuted) {
          const calcHours = calculateHoursBetween(finalStartTimeExecuted, finalEndTimeExecuted);
          if (calcHours) {
            finalHoursExecuted = Number(calcHours);
          }
        }
      }

      const nextAct = await updateActivityStatus({
        activityId: activity.id,
        oldStatus: activity.status,
        newStatus: status,
        userId: user.uid,
        userEmail: user.email || "",
      });

      // Sincroniza a flag archived com o status no banco de dados para retrocompatibilidade
      await updateActivity(activity.id, { archived: status === "arquivado" });

      setActivities((prev) => {
        let updatedList = prev.map((act) =>
          act.id === activity.id
            ? { 
                ...act, 
                status, 
                archived: status === "arquivado", 
                start_time_executed: finalStartTimeExecuted,
                end_time_executed: finalEndTimeExecuted,
                hours_executed: finalHoursExecuted,
                updated_at: new Date().toISOString() 
              }
            : act
        );
        if (nextAct) {
          if (!updatedList.some(act => act.id === nextAct.id)) {
            updatedList = [nextAct, ...updatedList];
          }
        }
        return updatedList;
      });
    } catch (error) {
      console.error("Erro ao mover status:", error);
    }
  };

  const handleMoveDay = async (activity: Activity, newDate: string) => {
    if (!user) return;
    try {
      // Optimistic update
      setActivities((prev) =>
        prev.map((act) =>
          act.id === activity.id
            ? { ...act, activity_date: newDate, updated_at: new Date().toISOString() }
            : act
        )
      );

      await updateActivity(activity.id, { activity_date: newDate });
    } catch (error) {
      console.error("Erro ao alterar data da atividade via drag-and-drop:", error);
      // Revert if error occurs
      setActivities((prev) =>
        prev.map((act) =>
          act.id === activity.id
            ? { ...act, activity_date: activity.activity_date }
            : act
        )
      );
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta atividade?")) return;
    try {
      await deleteActivity(id);
      setActivities((prev) => prev.filter((act) => act.id !== id));
    } catch (error) {
      console.error("Erro ao deletar atividade:", error);
    }
  };

  const handleDuplicateActivity = async (activity: Activity) => {
    if (!user) return;
    if (!hasPermission("activities", "create")) {
      alert("Você não tem permissão para duplicar atividades.");
      return;
    }
    if (!confirm(`Tem certeza que deseja duplicar a atividade "${activity.title}"?`)) return;
    try {
      const newAct = await duplicateActivity(activity, user.uid);
      setActivities((prev) => [newAct, ...prev]);
    } catch (error) {
      console.error("Erro ao duplicar atividade:", error);
      alert("Ocorreu um erro ao duplicar a atividade.");
    }
  };

  const handleToggleSelectActivity = (id: string) => {
    setSelectedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllOnPage = (filteredActivities: Activity[]) => {
    const pageIds = filteredActivities.map((act) => act.id);
    const allSelectedOnPage = pageIds.length > 0 && pageIds.every((id) => selectedActivityIds.includes(id));
    if (allSelectedOnPage) {
      setSelectedActivityIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedActivityIds((prev) => {
        const unique = new Set([...prev, ...pageIds]);
        return Array.from(unique);
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedActivityIds.length === 0) return;
    if (!hasPermission("activities", "delete")) {
      alert("Você não tem permissão para excluir atividades.");
      return;
    }
    if (!confirm(`Tem certeza que deseja excluir as ${selectedActivityIds.length} atividades selecionadas?`)) return;
    try {
      await deleteActivitiesBatch(selectedActivityIds);
      setActivities((prev) => prev.filter((act) => !selectedActivityIds.includes(act.id)));
      setSelectedActivityIds([]);
    } catch (error) {
      console.error("Erro ao deletar atividades em lote:", error);
      alert("Ocorreu um erro ao excluir as atividades selecionadas.");
    }
  };

  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let row: string[] = [];
    let inQuotes = false;
    let currentValue = "";
    
    const cleanText = text.startsWith("\uFEFF") ? text.slice(1) : text;
    
    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentValue += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ';' && !inQuotes) {
        row.push(currentValue.trim());
        currentValue = "";
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(currentValue.trim());
        if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
          lines.push(row);
        }
        row = [];
        currentValue = "";
      } else {
        currentValue += char;
      }
    }
    
    if (currentValue !== "" || row.length > 0) {
      row.push(currentValue.trim());
      if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
        lines.push(row);
      }
    }
    
    return lines;
  };

  const handleExportCSV = (onlySelected: boolean) => {
    const targets = onlySelected 
      ? activities.filter((act) => selectedActivityIds.includes(act.id))
      : listActivitiesFiltered;

    if (targets.length === 0) {
      alert("Nenhuma atividade para exportar.");
      return;
    }

    const headers = [
      "Título",
      "Descrição",
      "Projeto",
      "Tipo",
      "Prioridade",
      "Data",
      "Horário Planejado Início",
      "Horário Planejado Fim",
      "Horário Executado Início",
      "Horário Executado Fim",
      "Horas Planejadas",
      "Horas Executadas",
      "Responsável",
      "Status",
      "Observações",
      "Tags"
    ];

    const escapeCSVField = (val: any): string => {
      if (val === null || val === undefined) return "";
      let str = String(val);
      if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        str = '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const rows = targets.map((act) => [
      escapeCSVField(act.title),
      escapeCSVField(act.description || ""),
      escapeCSVField(act.project_name || ""),
      escapeCSVField(act.type),
      escapeCSVField(act.priority),
      escapeCSVField(act.activity_date),
      escapeCSVField(act.start_time_planned || ""),
      escapeCSVField(act.end_time_planned || ""),
      escapeCSVField(act.start_time_executed || ""),
      escapeCSVField(act.end_time_executed || ""),
      escapeCSVField(act.hours_planned),
      escapeCSVField(act.hours_executed || 0),
      escapeCSVField(act.responsible_name || ""),
      escapeCSVField(act.status),
      escapeCSVField(act.observations || ""),
      escapeCSVField((act.tags || []).join(","))
    ]);

    const BOM = "\uFEFF";
    const csvContent = BOM + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `atividades_exportadas_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintActivities = () => {
    const targets = getFilteredActivities();
    const kanbanColsCount = 4 + (showCanceled ? 1 : 0) + (showArchived ? 1 : 0);

    if (targets.length === 0) {
      alert("Nenhuma atividade encontrada com os filtros selecionados para imprimir.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("O bloqueador de pop-ups impediu a abertura da janela de impressão. Por favor, permita pop-ups para este site.");
      return;
    }

    const totalActCount = targets.length;
    const totalHoursPlanned = targets.reduce((sum, a) => sum + (Number(a.hours_planned) || 0), 0);
    const totalHoursExecuted = targets.reduce((sum, a) => sum + (Number(a.hours_executed) || 0), 0);

    const projectName = filterProject 
      ? (projects.find(p => p.id === filterProject)?.name || filterProject)
      : "Todos os Projetos";
    
    const responsibleName = filterResponsible
      ? (allProfiles.find(p => p.id === filterResponsible)?.full_name || filterResponsible)
      : "Todos os Responsáveis";

    const periodStr = (filterStartDate || filterEndDate)
      ? `${filterStartDate ? yyyymmddToDdmmyyyy(filterStartDate) : ""} a ${filterEndDate ? yyyymmddToDdmmyyyy(filterEndDate) : ""}`
      : "Todo o período";

    const cssStyles = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #1f2937;
        background-color: #ffffff;
        padding: 10px;
        font-size: 11px;
        line-height: 1.4;
      }
      .print-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid #e5e7eb;
        padding-bottom: 12px;
        margin-bottom: 20px;
      }
      .header-left { display: flex; align-items: center; gap: 12px; }
      .logo {
        background-color: #09090b;
        color: #ffffff;
        font-weight: 800;
        font-size: 16px;
        padding: 6px 10px;
        border-radius: 6px;
        letter-spacing: -0.05em;
      }
      .title-container h1 { font-size: 14px; font-weight: 700; color: #111827; }
      .title-container h2 { font-size: 11px; font-weight: 500; color: #6b7280; margin-top: 2px; }
      .header-right { text-align: right; font-size: 10px; color: #4b5563; }
      .header-right p { margin-bottom: 2px; }
      
      .filter-summary {
        background-color: #f9fafb;
        border: 1px solid #f3f4f6;
        border-radius: 8px;
        padding: 10px 14px;
        margin-bottom: 20px;
      }
      .filter-summary h3 {
        font-size: 10px;
        font-weight: 600;
        color: #374151;
        text-transform: uppercase;
        margin-bottom: 6px;
        letter-spacing: 0.05em;
      }
      .filter-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 6px;
        font-size: 10px;
        color: #4b5563;
      }

      .totals-summary { display: flex; gap: 15px; margin-bottom: 20px; }
      .total-card {
        flex: 1;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .total-card .value { font-size: 16px; font-weight: 700; color: #0f172a; }
      .total-card .label { font-size: 9px; font-weight: 500; color: #6b7280; margin-top: 2px; }

      .kanban-print-board {
        display: grid;
        grid-template-columns: repeat(${kanbanColsCount}, 1fr);
        gap: 6px;
        align-items: start;
      }
      .kanban-print-col {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 6px;
        min-height: 400px;
      }
      .col-header { padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; text-align: center; }
      .col-header h3 { font-size: 10px; font-weight: 700; color: #0f172a; }
      .col-pendente { background-color: #f1f5f9; border: 1px solid #cbd5e1; }
      .col-em_andamento { background-color: #eff6ff; border: 1px solid #bfdbfe; }
      .col-concluida { background-color: #ecfdf5; border: 1px solid #a7f3d0; }
      .col-bloqueada { background-color: #fef2f2; border: 1px solid #fecaca; }
      .col-cancelada { background-color: #f3f4f6; border: 1px solid #e5e7eb; }
      .col-arquivado { background-color: #f4f4f5; border: 1px solid #d4d4d8; }
      .kanban-print-card {
        background-color: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 6px;
        margin-bottom: 6px;
        page-break-inside: avoid;
        box-shadow: 0 1px 2px rgba(0,0,0,0.02);
      }
      .kanban-print-card.priority-alta { border-left: 3px solid #ef4444; }
      .kanban-print-card.priority-media { border-left: 3px solid #eab308; }
      .kanban-print-card.priority-baixa { border-left: 3px solid #3b82f6; }
      .card-title { font-size: 10px; font-weight: 600; color: #0f172a; margin-bottom: 4px; }
      .card-project { font-size: 8px; color: #64748b; margin-bottom: 6px; font-weight: 500; }
      .card-meta { display: flex; justify-content: space-between; font-size: 8px; color: #64748b; margin-bottom: 6px; }
      .card-hours {
        display: flex;
        justify-content: space-between;
        font-size: 8px;
        background-color: #f8fafc;
        padding: 4px 6px;
        border-radius: 4px;
        color: #334155;
        margin-bottom: 6px;
      }
      .card-tags { display: flex; flex-wrap: wrap; gap: 2px; }
      .tag {
        font-size: 7px;
        background-color: #f1f5f9;
        color: #475569;
        padding: 1px 4px;
        border-radius: 3px;
        border: 1px solid #e2e8f0;
      }
      .empty-col { text-align: center; font-size: 9px; color: #94a3b8; padding: 12px 0; font-style: italic; }

      .list-print-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .list-print-table th, .list-print-table td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
      .list-print-table th { background-color: #f8fafc; font-weight: 700; color: #334155; font-size: 10px; }
      .list-print-table tr { page-break-inside: avoid; }
      .list-print-table tbody tr:nth-child(even) { background-color: #f8fafc; }
      .list-title { font-weight: 600; color: #0f172a; }
      .list-desc { font-size: 9px; color: #64748b; margin-top: 2px; }
      .center { text-align: center !important; }
      .right { text-align: right !important; }
      .nowrap { white-space: nowrap; }
      .font-bold { font-weight: 700; }
      .text-lg { font-size: 12px; }
      
      .badge-priority { font-size: 8px; font-weight: 600; padding: 2px 6px; border-radius: 9999px; text-transform: uppercase; }
      .badge-priority.priority-alta { background-color: #fee2e2; color: #ef4444; }
      .badge-priority.priority-media { background-color: #fef9c3; color: #ca8a04; }
      .badge-priority.priority-baixa { background-color: #dbeafe; color: #3b82f6; }
      
      .badge-status { font-size: 8px; font-weight: 600; padding: 2px 6px; border-radius: 9999px; text-transform: uppercase; }
      .badge-status.status-pendente { background-color: #e2e8f0; color: #475569; }
      .badge-status.status-em_andamento { background-color: #dbeafe; color: #2563eb; }
      .badge-status.status-concluida { background-color: #d1fae5; color: #059669; }
      .badge-status.status-bloqueada { background-color: #fee2e2; color: #dc2626; }
      .badge-status.status-cancelada { background-color: #f3f4f6; color: #9ca3af; }

      .day-subtitle { font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 12px; border-left: 3px solid #10b981; padding-left: 8px; }
      .timeline-container { display: flex; flex-direction: column; gap: 12px; margin-top: 15px; }
      .timeline-item { display: flex; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; page-break-inside: avoid; }
      .timeline-time {
        width: 100px; padding: 12px; background-color: #f8fafc; border-right: 1px solid #e2e8f0;
        display: flex; align-items: center; justify-content: center; font-weight: 700; color: #334155; text-align: center;
      }
      .timeline-content { flex: 1; padding: 12px; }
      .timeline-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
      .timeline-title { font-size: 12px; font-weight: 700; color: #0f172a; }
      .timeline-meta {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px;
        font-size: 9px; color: #64748b; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #e2e8f0;
      }
      .timeline-desc, .timeline-obs { font-size: 9px; color: #334155; margin-top: 4px; }
      .border-left-pendente { border-left: 4px solid #94a3b8; }
      .border-left-em_andamento { border-left: 4px solid #3b82f6; }
      .border-left-concluida { border-left: 4px solid #10b981; }
      .border-left-bloqueada { border-left: 4px solid #ef4444; }
      .border-left-cancelada { border-left: 4px solid #d1d5db; }

      .week-print-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; align-items: start; }
      .week-print-col { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; min-height: 400px; }
      .week-col-header { padding: 6px; background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; margin-bottom: 8px; }
      .week-col-header h4 { font-size: 10px; font-weight: 700; color: #334155; }
      .day-hours-sum { font-size: 8px; color: #64748b; display: block; margin-top: 1px; }
      .week-col-acts { display: flex; flex-direction: column; gap: 6px; }
      .week-act-card { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; page-break-inside: avoid; }
      .week-act-card.priority-alta { border-left: 3px solid #ef4444; }
      .week-act-card.priority-media { border-left: 3px solid #eab308; }
      .week-act-card.priority-baixa { border-left: 3px solid #3b82f6; }
      .week-act-time { font-size: 8px; font-weight: 700; color: #64748b; margin-bottom: 2px; }
      .week-act-title { font-size: 9px; font-weight: 600; color: #0f172a; margin-bottom: 2px; }
      .week-act-project { font-size: 7px; color: #94a3b8; font-weight: 500; }
      .week-act-responsible { font-size: 7px; color: #64748b; text-align: right; margin-top: 2px; }
      .week-empty { text-align: center; font-size: 8px; color: #94a3b8; padding: 10px 0; font-style: italic; }

      .month-print-container { display: flex; flex-direction: column; }
      .month-print-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 12px; text-align: center; }
      .month-print-grid { display: grid; grid-template-columns: repeat(7, 1fr); border-top: 1px solid #cbd5e1; border-left: 1px solid #cbd5e1; }
      .month-header-cell { background-color: #f1f5f9; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: 700; color: #475569; font-size: 10px; }
      .month-day-cell { height: 80px; background-color: #ffffff; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 4px; display: flex; flex-direction: column; align-items: stretch; }
      .month-day-cell.other-month { background-color: #f8fafc; }
      .month-day-cell .day-num { font-size: 9px; font-weight: 700; color: #64748b; margin-bottom: 4px; align-self: flex-end; }
      .month-day-cell.other-month .day-num { color: #cbd5e1; }
      .month-day-acts { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
      .month-act-line { font-size: 7px; padding: 1px 3px; border-radius: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 2px; }
      .month-act-line.status-pendente { background-color: #f1f5f9; color: #475569; border-left: 2px solid #94a3b8; }
      .month-act-line.status-em_andamento { background-color: #eff6ff; color: #1d4ed8; border-left: 2px solid #3b82f6; }
      .month-act-line.status-concluida { background-color: #ecfdf5; color: #047857; border-left: 2px solid #10b981; }
      .month-act-line.status-bloqueada { background-color: #fef2f2; color: #b91c1c; border-left: 2px solid #ef4444; }
      .month-act-line.status-cancelada { background-color: #f3f4f6; color: #4b5563; border-left: 2px solid #9ca3af; }
      .act-time-compact { font-weight: 700; }
      .act-title-compact { flex: 1; overflow: hidden; text-overflow: ellipsis; }

      @media print {
        body { padding: 0; }
        .no-print { display: none !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `;

    const headerHtml = `
      <header class="print-header">
        <div class="header-left">
          <div class="logo">NGD</div>
          <div class="title-container">
            <h1>Núcleo de Gestão de Dados (NGD) · UEFS</h1>
            <h2>Relatório de Atividades — Sistema Acauã</h2>
          </div>
        </div>
        <div class="header-right">
          <p><strong>Gerado em:</strong> ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}</p>
          <p><strong>Visualização:</strong> ${viewMode === "kanban" ? "Quadro Kanban" : viewMode === "list" ? "Lista" : viewMode === "day" ? "Diária" : viewMode === "week" ? "Semanal" : "Mensal"}</p>
        </div>
      </header>

      <div class="filter-summary">
        <h3>Filtros Aplicados</h3>
        <div class="filter-grid">
          <div><strong>Projeto:</strong> ${escapeHtml(projectName)}</div>
          <div><strong>Responsável:</strong> ${escapeHtml(responsibleName)}</div>
          ${filterSector ? `<div><strong>Setor:</strong> ${escapeHtml(filterSector)}</div>` : ""}
          ${filterPriority ? `<div><strong>Prioridade:</strong> ${escapeHtml(filterPriority)}</div>` : ""}
          ${filterType ? `<div><strong>Tipo:</strong> ${escapeHtml(filterType)}</div>` : ""}
          ${filterStatus ? `<div><strong>Status:</strong> ${escapeHtml(filterStatus)}</div>` : ""}
          <div><strong>Período:</strong> ${escapeHtml(periodStr)}</div>
          ${filterText ? `<div><strong>Busca:</strong> "${escapeHtml(filterText)}"</div>` : ""}
        </div>
      </div>

      <div class="totals-summary">
        <div class="total-card">
          <span class="value">${totalActCount}</span>
          <span class="label">Atividades</span>
        </div>
        <div class="total-card">
          <span class="value">${totalHoursPlanned.toFixed(1)}h</span>
          <span class="label">Horas Planejadas</span>
        </div>
        <div class="total-card">
          <span class="value">${totalHoursExecuted.toFixed(1)}h</span>
          <span class="label">Horas Executadas</span>
        </div>
      </div>
    `;

    let contentHtml = "";
    let isLandscape = false;

    if (viewMode === "kanban") {
      isLandscape = true;
      
      const kanbanCols = ["pendente", "em_andamento", "concluida", "bloqueada"];
      if (showCanceled) {
        kanbanCols.push("cancelada");
      }
      if (showArchived) {
        kanbanCols.push("arquivado");
      }

      const colLabels: Record<string, string> = {
        pendente: "Pendente",
        em_andamento: "Em Andamento",
        concluida: "Concluída",
        bloqueada: "Bloqueada",
        cancelada: "Cancelada",
        arquivado: "Arquivada"
      };

      const columnsHtml = kanbanCols.map(status => {
        const colActs = status === "arquivado"
          ? targets.filter(act => isActivityArchived(act, archiveDaysLimit))
          : targets.filter(act => act.status === status && !isActivityArchived(act, archiveDaysLimit));

        const cards = colActs.map(act => `
          <div class="kanban-print-card priority-${escapeHtml(act.priority)}">
            <div class="card-title">${escapeHtml(act.title)}</div>
            ${act.project_name ? `<div class="card-project">📂 ${escapeHtml(act.project_name)}</div>` : ""}
            <div class="card-meta">
              <span>👤 ${escapeHtml(act.responsible_name || "Sem atribuição")}</span>
              <span>📅 ${escapeHtml(yyyymmddToDdmmyyyy(act.activity_date))}</span>
            </div>
            <div class="card-hours">
              <span>Plan: <strong>${escapeHtml(act.hours_planned)}h</strong></span>
              <span>Exec: <strong>${escapeHtml(act.hours_executed || 0)}h</strong></span>
            </div>
            ${act.tags && act.tags.length > 0 ? `
              <div class="card-tags">
                ${act.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
              </div>
            ` : ""}
          </div>
        `).join("");

        return `
          <div class="kanban-print-col">
            <div class="col-header col-${status}">
              <h3>${colLabels[status]} (${colActs.length})</h3>
            </div>
            <div class="col-cards">
              ${cards}
              ${colActs.length === 0 ? `<div class="empty-col">Nenhuma atividade</div>` : ""}
            </div>
          </div>
        `;
      }).join("");

      contentHtml = `<div class="kanban-print-board">${columnsHtml}</div>`;

    } else if (viewMode === "list") {
      const rowsHtml = targets.map(act => `
        <tr>
          <td class="nowrap">${escapeHtml(yyyymmddToDdmmyyyy(act.activity_date))}</td>
          <td>
            <div class="list-title">${escapeHtml(act.title)}</div>
            ${act.description ? `<div class="list-desc">${escapeHtml(act.description)}</div>` : ""}
          </td>
          <td>${escapeHtml(act.project_name || "—")}</td>
          <td>${escapeHtml(act.responsible_name || "—")}</td>
          <td><span class="badge-priority priority-${escapeHtml(act.priority)}">${escapeHtml(act.priority)}</span></td>
          <td><span class="badge-status status-${escapeHtml(act.status)}">${escapeHtml(act.status)}</span></td>
          <td class="center font-bold">${escapeHtml(act.hours_planned)}h</td>
          <td class="center font-bold">${escapeHtml(act.hours_executed || 0)}h</td>
        </tr>
      `).join("");

      contentHtml = `
        <table class="list-print-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Título / Descrição</th>
              <th>Projeto</th>
              <th>Responsável</th>
              <th>Prioridade</th>
              <th>Status</th>
              <th>Horas Plan.</th>
              <th>Horas Exec.</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="6" class="right font-bold text-lg">Total Acumulado:</td>
              <td class="center font-bold text-lg text-emerald-700 bg-emerald-50">${totalHoursPlanned.toFixed(1)}h</td>
              <td class="center font-bold text-lg text-emerald-700 bg-emerald-50">${totalHoursExecuted.toFixed(1)}h</td>
            </tr>
          </tfoot>
        </table>
      `;

    } else if (viewMode === "day") {
      const dayTargetStr = filterStartDate ? yyyymmddToDdmmyyyy(filterStartDate) : yyyymmddToDdmmyyyy(getLocalDateString());
      
      const sortedDailyActs = [...targets].sort((a, b) => {
        const timeA = a.start_time_planned || "23:59";
        const timeB = b.start_time_planned || "23:59";
        return timeA.localeCompare(timeB);
      });

      const timelineItemsHtml = sortedDailyActs.map(act => {
        const timeRange = act.start_time_planned 
          ? `${act.start_time_planned} - ${act.end_time_planned || "—"}`
          : "Horário não definido";
        return `
          <div class="timeline-item border-left-${escapeHtml(act.status)}">
            <div class="timeline-time">${escapeHtml(timeRange)}</div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-title">${escapeHtml(act.title)}</span>
                <span class="badge-status status-${escapeHtml(act.status)}">${escapeHtml(act.status)}</span>
              </div>
              <div class="timeline-meta">
                <span>📂 <strong>Projeto:</strong> ${escapeHtml(act.project_name || "Avulso")}</span>
                <span>👤 <strong>Responsável:</strong> ${escapeHtml(act.responsible_name || "—")}</span>
                <span>⚡ <strong>Prioridade:</strong> ${escapeHtml(act.priority)}</span>
                <span>⏱️ <strong>Esforço:</strong> Plan: ${escapeHtml(act.hours_planned)}h | Exec: ${escapeHtml(act.hours_executed || 0)}h</span>
              </div>
              ${act.description ? `<div class="timeline-desc"><strong>Descrição:</strong> ${escapeHtml(act.description)}</div>` : ""}
              ${act.observations ? `<div class="timeline-obs"><strong>Observações:</strong> ${escapeHtml(act.observations)}</div>` : ""}
            </div>
          </div>
        `;
      }).join("");

      contentHtml = `
        <div class="day-print-container">
          <h3 class="day-subtitle">Atividades Agendadas para o Dia: ${escapeHtml(dayTargetStr)}</h3>
          <div class="timeline-container">
            ${timelineItemsHtml}
            ${sortedDailyActs.length === 0 ? `<div class="empty-col text-center py-8">Nenhuma atividade registrada para este dia.</div>` : ""}
          </div>
        </div>
      `;

    } else if (viewMode === "week") {
      isLandscape = true;
      const weekDaysList = getWeekDays();
      
      const colsHtml = weekDaysList.map(wd => {
        const dayActs = targets.filter(a => a.activity_date === wd.dateStr);
        const sortedDayActs = [...dayActs].sort((a, b) => {
          const timeA = a.start_time_planned || "23:59";
          const timeB = b.start_time_planned || "23:59";
          return timeA.localeCompare(timeB);
        });

        const dayActsHtml = sortedDayActs.map(act => `
          <div class="week-act-card status-${escapeHtml(act.status)} priority-${escapeHtml(act.priority)}">
            <div class="week-act-time">
              ${escapeHtml(act.start_time_planned || "Todo o dia")} 
              ${act.hours_planned ? `(${escapeHtml(act.hours_planned)}h)` : ""}
            </div>
            <div class="week-act-title">${escapeHtml(act.title)}</div>
            <div class="week-act-project">${escapeHtml(act.project_name || "Avulso")}</div>
            <div class="week-act-responsible">${escapeHtml(act.responsible_name || "—")}</div>
          </div>
        `).join("");

        const dayHoursSum = dayActs.reduce((sum, a) => sum + (Number(a.hours_planned) || 0), 0);

        return `
          <div class="week-print-col">
            <div class="week-col-header">
              <h4>${escapeHtml(wd.formattedLabel)}</h4>
              <span class="day-hours-sum">${dayHoursSum.toFixed(1)}h plan</span>
            </div>
            <div class="week-col-acts">
              ${dayActsHtml}
              ${dayActs.length === 0 ? `<div class="week-empty">Sem atividades</div>` : ""}
            </div>
          </div>
        `;
      }).join("");

      contentHtml = `<div class="week-print-grid">${colsHtml}</div>`;

    } else if (viewMode === "month") {
      isLandscape = true;
      const monthDaysList = getMonthDays();
      const monthLabel = getMonthLabel();

      const daysCellsHtml = monthDaysList.map(md => {
        const dayActs = targets.filter(a => a.activity_date === md.dateStr);
        const sortedDayActs = [...dayActs].sort((a, b) => {
          const timeA = a.start_time_planned || "23:59";
          const timeB = b.start_time_planned || "23:59";
          return timeA.localeCompare(timeB);
        });

        const dayActsHtml = sortedDayActs.map(act => `
          <div class="month-act-line status-${escapeHtml(act.status)}" title="${escapeHtml(act.title)}">
            <span class="act-time-compact">${escapeHtml(act.start_time_planned || "")}</span>
            <span class="act-title-compact">${escapeHtml(act.title)}</span>
          </div>
        `).join("");

        return `
          <div class="month-day-cell ${md.isCurrentMonth ? "" : "other-month"}">
            <span class="day-num">${md.dayNum}</span>
            <div class="month-day-acts">
              ${dayActsHtml}
            </div>
          </div>
        `;
      }).join("");

      contentHtml = `
        <div class="month-print-container">
          <h3 class="month-print-title">${escapeHtml(monthLabel)}</h3>
          <div class="month-print-grid">
            <div class="month-header-cell">Segunda</div>
            <div class="month-header-cell">Terça</div>
            <div class="month-header-cell">Quarta</div>
            <div class="month-header-cell">Quinta</div>
            <div class="month-header-cell">Sexta</div>
            <div class="month-header-cell text-zinc-400">Sábado</div>
            <div class="month-header-cell text-zinc-400">Domingo</div>
            ${daysCellsHtml}
          </div>
        </div>
      `;
    }

    const pageOrientationStyle = isLandscape 
      ? `@page { size: landscape; margin: 0.4cm; }` 
      : `@page { size: portrait; margin: 0.5cm; }`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório de Atividades — Acauã</title>
          <meta charset="utf-8" />
          <style>
            ${cssStyles}
            ${pageOrientationStyle}
          </style>
        </head>
        <body class="${isLandscape ? 'landscape-view' : ''}">
          ${headerHtml}
          <main>
            ${contentHtml}
          </main>
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
                window.close();
              }, 300);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const parsedRows = parseCSV(text);
        if (parsedRows.length <= 1) {
          alert("A planilha importada está vazia ou não possui cabeçalhos.");
          return;
        }

        const headers = parsedRows[0].map(h => h.toLowerCase().trim());
        const titleIdx = headers.findIndex(h => h.includes("título") || h.includes("titulo"));
        const descIdx = headers.findIndex(h => h.includes("descrição") || h.includes("descricao"));
        const projectIdx = headers.findIndex(h => h.includes("projeto"));
        const typeIdx = headers.findIndex(h => h.includes("tipo"));
        const priorityIdx = headers.findIndex(h => h.includes("prioridade"));
        const dateIdx = headers.findIndex(h => h.includes("data"));
        const startTimePlannedIdx = headers.findIndex(h => h.includes("planejado início") || h.includes("planejado inicio") || h.includes("plan início") || h.includes("plan inicio") || h.includes("horário planejado início"));
        const endTimePlannedIdx = headers.findIndex(h => h.includes("planejado fim") || h.includes("plan fim") || h.includes("horário planejado fim"));
        const startTimeExecutedIdx = headers.findIndex(h => h.includes("executado início") || h.includes("executado inicio") || h.includes("exec início") || h.includes("exec inicio") || h.includes("horário executado início"));
        const endTimeExecutedIdx = headers.findIndex(h => h.includes("executado fim") || h.includes("exec fim") || h.includes("horário executado fim"));
        const hoursPlannedIdx = headers.findIndex(h => h.includes("horas planejadas") || h.includes("horas plan"));
        const hoursExecutedIdx = headers.findIndex(h => h.includes("horas executadas") || h.includes("horas exec"));
        const responsibleIdx = headers.findIndex(h => h.includes("responsável") || h.includes("responsavel"));
        const statusIdx = headers.findIndex(h => h.includes("status"));
        const obsIdx = headers.findIndex(h => h.includes("observações") || h.includes("observacoes"));
        const tagsIdx = headers.findIndex(h => h.includes("tags"));

        if (titleIdx === -1) {
          alert("Coluna obrigatória 'Título' não identificada na primeira linha do CSV.");
          return;
        }

        const validActivities: Omit<Activity, "id" | "created_at" | "updated_at">[] = [];
        const errors: number[] = [];

        for (let i = 1; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          const physicalLineNum = i + 1;

          if (row.length === 0 || !row[titleIdx]) {
            errors.push(physicalLineNum);
            continue;
          }

          const title = row[titleIdx].trim();
          if (!title) {
            errors.push(physicalLineNum);
            continue;
          }

          const description = descIdx !== -1 && row[descIdx] ? row[descIdx].trim() : "";
          
          const projVal = projectIdx !== -1 && row[projectIdx] ? row[projectIdx].trim() : "";
          const foundProject = projVal ? projects.find(p => p.name.toLowerCase() === projVal.toLowerCase()) : null;
          const project_id = foundProject ? foundProject.id : null;
          const project_name = foundProject ? foundProject.name : null;

          const respVal = responsibleIdx !== -1 && row[responsibleIdx] ? row[responsibleIdx].trim() : "";
          const foundProfile = respVal ? allProfiles.find(p => p.full_name.toLowerCase() === respVal.toLowerCase() || p.email.toLowerCase() === respVal.toLowerCase()) : null;
          const responsible_id = foundProfile ? foundProfile.id : "";
          const responsible_name = foundProfile ? foundProfile.full_name : "";

          let typeVal = typeIdx !== -1 && row[typeIdx] ? row[typeIdx].toLowerCase().trim() : "projeto";
          const dbTypes = activityTypes.map((t) => (t as any).key || normalizeKey(t.name));
          const validTypes = [...dbTypes, "licenca_medica", "ausente"];
          if (!validTypes.includes(typeVal)) {
            typeVal = "projeto";
          }

          let prioVal = priorityIdx !== -1 && row[priorityIdx] ? row[priorityIdx].toLowerCase().trim() : "media";
          const validPriorities = ["baixa", "media", "alta", "critica"];
          if (!validPriorities.includes(prioVal)) {
            prioVal = "media";
          }

          let dateVal = dateIdx !== -1 && row[dateIdx] ? row[dateIdx].trim() : "";
          if (dateVal.includes("/")) {
            const parts = dateVal.split("/");
            if (parts.length === 3) {
              dateVal = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
          if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
            dateVal = new Date().toISOString().split("T")[0];
          }

          const start_time_planned = startTimePlannedIdx !== -1 && row[startTimePlannedIdx] ? row[startTimePlannedIdx].trim() : "";
          const end_time_planned = endTimePlannedIdx !== -1 && row[endTimePlannedIdx] ? row[endTimePlannedIdx].trim() : "";
          const start_time_executed = startTimeExecutedIdx !== -1 && row[startTimeExecutedIdx] ? row[startTimeExecutedIdx].trim() : "";
          const end_time_executed = endTimeExecutedIdx !== -1 && row[endTimeExecutedIdx] ? row[endTimeExecutedIdx].trim() : "";

          let hoursPlanned = hoursPlannedIdx !== -1 && row[hoursPlannedIdx] ? parseFloat(row[hoursPlannedIdx].replace(",", ".")) : 0;
          if (isNaN(hoursPlanned)) hoursPlanned = 0;

          let hoursExecuted = hoursExecutedIdx !== -1 && row[hoursExecutedIdx] ? parseFloat(row[hoursExecutedIdx].replace(",", ".")) : 0;
          if (isNaN(hoursExecuted)) hoursExecuted = 0;

          let statusVal = statusIdx !== -1 && row[statusIdx] ? row[statusIdx].toLowerCase().trim() : "pendente";
          if (statusVal === "concluída" || statusVal === "concluida") statusVal = "concluida";
          else if (statusVal === "em andamento" || statusVal === "em_andamento") statusVal = "em_andamento";
          else if (statusVal === "bloqueada") statusVal = "bloqueada";
          else if (statusVal === "pendente") statusVal = "pendente";
          else if (statusVal === "cancelada") statusVal = "cancelada";
          else if (statusVal === "arquivado") statusVal = "arquivado";

          const validStatuses = ["pendente", "em_andamento", "concluida", "cancelada", "bloqueada", "arquivado"];
          if (!validStatuses.includes(statusVal)) {
            statusVal = "pendente";
          }

          const observations = obsIdx !== -1 && row[obsIdx] ? row[obsIdx].trim() : "";
          const tagsVal = tagsIdx !== -1 && row[tagsIdx] ? row[tagsIdx].trim() : "";
          const tags = tagsVal ? tagsVal.split(",").map(t => t.trim()).filter(Boolean) : [];

          validActivities.push({
            title,
            description,
            project_id,
            project_name,
            responsible_id,
            responsible_name,
            type: typeVal as Activity["type"],
            priority: prioVal as Activity["priority"],
            activity_date: dateVal,
            start_time_planned,
            end_time_planned,
            start_time_executed,
            end_time_executed,
            hours_planned: hoursPlanned,
            hours_executed: hoursExecuted,
            status: statusVal as Activity["status"],
            observations,
            tags,
            archived: statusVal === "arquivado",
            created_by: user?.uid || ""
          });
        }

        if (validActivities.length > 200) {
          alert(`Erro: A planilha contém ${validActivities.length} atividades válidas, o que excede o limite máximo permitido de 200 registros por lote. Por favor, fragmente o arquivo.`);
          return;
        }

        if (validActivities.length === 0) {
          setImportResult({
            successCount: 0,
            errors: errors,
            total: parsedRows.length - 1
          });
          return;
        }

        await importActivitiesBatch(validActivities);

        const { activities: fetchedActivities } = await getActivities();
        setActivities(fetchedActivities);

        setImportResult({
          successCount: validActivities.length,
          errors: errors,
          total: parsedRows.length - 1
        });
      } catch (err) {
        console.error("Erro ao analisar arquivo de importação CSV:", err);
        alert("Ocorreu um erro ao processar o arquivo CSV. Verifique a formatação do arquivo.");
      }
    };

    reader.readAsText(file, "UTF-8");
  };

  const resetActivityForm = () => {
    setTitle("");
    setDescription("");
    setProjectId("");
    setType("projeto");
    setPriority("media");
    setDate(yyyymmddToDdmmyyyy(new Date().toISOString().split("T")[0]));
    setDateError("");
    setHoursPlanned("");
    setTagsInput("");
    setObservations("");
    setStartTimePlanned("");
    setEndTimePlanned("");
    setStartTimeExecuted("");
    setEndTimeExecuted("");
  };

  const columns: { label: string; status: Activity["status"]; color: string }[] = [
    { label: "Pendente", status: "pendente", color: "border-zinc-800 bg-zinc-900/10 text-zinc-400" },
    { label: "Em Andamento", status: "em_andamento", color: "border-blue-500/20 bg-blue-500/5 text-blue-400" },
    { label: "Bloqueada", status: "bloqueada", color: "border-red-500/20 bg-red-500/5 text-red-400" },
    { label: "Concluída", status: "concluida", color: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" },
  ];

  if (showCanceled) {
    columns.push({ label: "Cancelada", status: "cancelada", color: "border-zinc-800/80 bg-zinc-900/20 text-zinc-500" });
  }

  if (showArchived) {
    columns.push({ label: "Arquivada", status: "arquivado", color: "border-zinc-800/80 bg-zinc-900/20 text-zinc-500" });
  }

  const getColActivities = (status: Activity["status"]) => {
    let baseActivities = activities;
    if (profile?.role === "colaborador" && user) {
      baseActivities = activities.filter((act) => act.created_by === user.uid);
    }

    let filtered = status === "arquivado"
      ? baseActivities.filter((act) => isActivityArchived(act, archiveDaysLimit))
      : baseActivities.filter((act) => act.status === status && !isActivityArchived(act, archiveDaysLimit));

    // Filtro de Busca Textual (Título, Descrição e Tags)
    if (filterText.trim()) {
      const searchVal = filterText.toLowerCase();
      filtered = filtered.filter(
        (act) =>
          act.title.toLowerCase().includes(searchVal) ||
          (act.description && act.description.toLowerCase().includes(searchVal)) ||
          act.tags.some((tag) => tag.toLowerCase().includes(searchVal))
      );
    }

    // Filtro por Projeto
    if (filterProject) {
      if (filterProject === "none") {
        filtered = filtered.filter((act) => !act.project_id);
      } else {
        filtered = filtered.filter((act) => act.project_id === filterProject);
      }
    }

    // Filtro por Responsável
    if (filterResponsible) {
      filtered = filtered.filter((act) => act.responsible_id === filterResponsible);
    }

    // Filtro por Prioridade
    if (filterPriority) {
      filtered = filtered.filter((act) => act.priority === filterPriority);
    }

    // Filtro por Tipo de Atividade
    if (filterType) {
      filtered = filtered.filter((act) => act.type === filterType);
    }

    // Filtro por Status
    if (filterStatus) {
      filtered = filtered.filter((act) => act.status === filterStatus);
    }

    // Filtro por Tag
    if (filterTag) {
      filtered = filtered.filter((act) => act.tags && act.tags.includes(filterTag));
    }

    // Filtro por Data de Execução (Intervalo ou Atalho)
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
      filtered = filtered.filter((act) => act.activity_date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((act) => act.activity_date <= endDate);
    }

    return filtered;
  };

  const getFilteredActivities = () => {
    let baseActivities = activities;
    if (profile?.role === "colaborador" && user) {
      baseActivities = activities.filter((act) => act.created_by === user.uid);
    }

    let filtered = showArchived
      ? baseActivities
      : baseActivities.filter((act) => !isActivityArchived(act, archiveDaysLimit));

    if (!showCanceled && filterStatus !== "cancelada") {
      filtered = filtered.filter((act) => act.status !== "cancelada");
    }

    if (filterText.trim()) {
      const searchVal = filterText.toLowerCase();
      filtered = filtered.filter(
        (act) =>
          act.title.toLowerCase().includes(searchVal) ||
          (act.description && act.description.toLowerCase().includes(searchVal)) ||
          act.tags.some((tag) => tag.toLowerCase().includes(searchVal))
      );
    }

    if (filterProject) {
      if (filterProject === "none") {
        filtered = filtered.filter((act) => !act.project_id);
      } else {
        filtered = filtered.filter((act) => act.project_id === filterProject);
      }
    }

    if (filterResponsible) {
      filtered = filtered.filter((act) => act.responsible_id === filterResponsible);
    }

    if (filterSector) {
      filtered = filtered.filter((act) => {
        if (!act.responsible_id) return false;
        const respProfile = allProfiles.find((p) => p.id === act.responsible_id);
        return respProfile && respProfile.setor === filterSector;
      });
    }

    if (filterPriority) {
      filtered = filtered.filter((act) => act.priority === filterPriority);
    }

    // Filtro por Tipo de Atividade
    if (filterType) {
      filtered = filtered.filter((act) => act.type === filterType);
    }

    // Filtro por Status
    if (filterStatus) {
      filtered = filtered.filter((act) => act.status === filterStatus);
    }

    // Filtro por Tag
    if (filterTag) {
      filtered = filtered.filter((act) => act.tags && act.tags.includes(filterTag));
    }

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
      filtered = filtered.filter((act) => act.activity_date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((act) => act.activity_date <= endDate);
    }

    return filtered.sort((a, b) => b.activity_date.localeCompare(a.activity_date));
  };

  const getActivityTypeStyle = (t: Activity["type"]) => {
    switch (t) {
      case "rotina":
        return "text-purple-400 bg-purple-500/10 border-purple-500/20";
      case "projeto":
        return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "planejamento":
        return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
      case "capacitacao":
        return "text-teal-400 bg-teal-500/10 border-teal-500/20";
      case "reuniao":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "atendimento":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "suporte":
        return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "licenca_medica":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      case "ausente":
        return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
      default:
        return "text-zinc-400 bg-zinc-800 border-zinc-700";
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "--/--/----";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getPriorityColor = (p: Activity["priority"]) => {
    switch (p) {
      case "critica":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      case "alta":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "media":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      default:
        return "text-zinc-400 bg-zinc-800 border-zinc-700";
    }
  };

  const allUniqueTags = Array.from(
    new Set(activities.flatMap((act) => act.tags || []))
  ).sort();

  const allUniqueSectors = Array.from(
    new Set(allProfiles.map((p) => p.setor).filter(Boolean))
  ).sort();

  const hasActiveFilters = 
    filterProject !== "" ||
    filterResponsible !== "" ||
    filterPriority !== "" ||
    filterType !== "" ||
    filterStatus !== "" ||
    filterTag !== "" ||
    filterSector !== "" ||
    filterDateShortcut !== "";

  const listActivitiesFiltered = getFilteredActivities();
  const listPageIds = listActivitiesFiltered.map((act) => act.id);
  const allSelectedOnPage = listPageIds.length > 0 && listPageIds.every((id) => selectedActivityIds.includes(id));
  const someSelectedOnPage = listPageIds.some((id) => selectedActivityIds.includes(id)) && !allSelectedOnPage;

  if (!hasPermission("activities", "read")) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-center p-6 bg-zinc-950">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500 mb-4 border border-red-500/20">
          <Lock className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Acesso Restrito</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          Você não tem permissão para visualizar a página de Atividades.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Atividades</h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            Quadro Kanban para controle operacional de rotinas e tarefas dos projetos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Configuração de Dias (Apenas Admin/Analista) */}
          {hasPermission("activities", "update") ? (
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
          ) : null}

          {/* Toggle de Cancelados */}
          <button
            onClick={() => setShowCanceled(!showCanceled)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
              showCanceled
                ? "bg-zinc-800 border-zinc-750 text-white"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            <XCircle className="h-4 w-4" />
            {showCanceled ? "Ocultar Canceladas" : "Mostrar Canceladas"}
          </button>

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
            {showArchived ? "Ocultar Arquivadas" : "Mostrar Arquivadas"}
          </button>

          {/* Seletor de Modo de Visualização */}
          <div className="flex items-center gap-1 rounded-xl border border-zinc-850 bg-zinc-900/40 p-1">
            <button
              onClick={() => handleSetViewMode("kanban")}
              title="Visualizar em Quadro Kanban"
              className={`flex items-center justify-center p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "kanban"
                  ? "bg-zinc-800 text-white shadow-md"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleSetViewMode("list")}
              title="Visualizar em Lista"
              className={`flex items-center justify-center p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-zinc-800 text-white shadow-md"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleSetViewMode("day")}
              title="Visualizar em Dia"
              className={`flex items-center justify-center p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "day"
                  ? "bg-zinc-800 text-white shadow-md"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Calendar className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleSetViewMode("week")}
              title="Visualizar em Semana"
              className={`flex items-center justify-center p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "week"
                  ? "bg-zinc-800 text-white shadow-md"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <CalendarDays className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleSetViewMode("month")}
              title="Visualizar em Mês"
              className={`flex items-center justify-center p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "month"
                  ? "bg-zinc-800 text-white shadow-md"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <CalendarRange className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImportCSV} 
              accept=".csv" 
              className="hidden" 
            />

            <button
              onClick={handlePrintActivities}
              title="Imprimir Visão Atual (PDF)"
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3.5 py-2.5 text-xs font-semibold text-zinc-350 hover:bg-zinc-950/80 hover:text-white transition-all active:scale-95 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            
            <button
              onClick={() => handleExportCSV(false)}
              title="Exportar Atividades Filtradas (CSV)"
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3.5 py-2.5 text-xs font-semibold text-zinc-350 hover:bg-zinc-950/80 hover:text-white transition-all active:scale-95 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>

            {hasPermission("activities", "create") && (
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Importar Atividades (CSV)"
                className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3.5 py-2.5 text-xs font-semibold text-zinc-350 hover:bg-zinc-950/80 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                Importar
              </button>
            )}

            {hasPermission("activities", "create") && (
              <button
                onClick={() => setIsNewActivityOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:bg-zinc-100 hover:shadow-lg active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Nova Atividade
              </button>
            )}
          </div>
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
              placeholder="Buscar por título, descrição, tag..."
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
              <div className="pointer-events-none absolute right-3 bottom-2 text.5 text-[10px] text-zinc-550">▼</div>
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
                {Array.from(new Set(
                  (profile?.role === "colaborador" ? activities.filter((a) => a.created_by === user?.uid) : activities)
                    .map(a => JSON.stringify({id: a.responsible_id, name: a.responsible_name}))
                 ))
                  .map(str => JSON.parse(str) as {id: string, name: string})
                  .filter(r => r.id && r.name)
                  .map((resp) => (
                    <option key={resp.id} value={resp.id} className="bg-zinc-950">{resp.name}</option>
                  ))
                }
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2 text.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Setor do Responsável */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Setor do Resp.</label>
              <select
                value={filterSector}
                onChange={(e) => setFilterSector(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todos os Setores</option>
                {allUniqueSectors.map((sector) => (
                  <option key={sector} value={sector} className="bg-zinc-950">{sector}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Tipo de Atividade */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Tipo de Atividade</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todos os Tipos</option>
                {activityTypes.map((t) => {
                  const key = (t as any).key || normalizeKey(t.name);
                  return (
                    <option key={key} value={key} className="bg-zinc-950">{t.name}</option>
                  );
                })}
                <option value="licenca_medica" className="bg-zinc-950">Licença Médica</option>
                <option value="ausente" className="bg-zinc-950">Ausente</option>
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2 text.5 text-[10px] text-zinc-550">▼</div>
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
                <option value="pendente" className="bg-zinc-950">Pendente</option>
                <option value="em_andamento" className="bg-zinc-950">Em Andamento</option>
                <option value="bloqueada" className="bg-zinc-950">Bloqueada</option>
                <option value="concluida" className="bg-zinc-950">Concluída</option>
                <option value="cancelada" className="bg-zinc-950">Cancelada</option>
                <option value="arquivado" className="bg-zinc-950">Arquivada</option>
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2 text.5 text-[10px] text-zinc-550">▼</div>
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
              <div className="pointer-events-none absolute right-3 bottom-2 text.5 text-[10px] text-zinc-550">▼</div>
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
              <div className="pointer-events-none absolute right-3 bottom-2 text.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Período */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Período</label>
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
              <div className="pointer-events-none absolute right-3 bottom-2 text.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Data Inicial (Condicional) */}
            {filterDateShortcut === "custom" && (
              <div className="relative">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Data Inicial</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full pl-3 pr-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all cursor-pointer block"
                  title="Data de execução a partir de"
                />
              </div>
            )}

            {/* Filtrar por Data Final (Condicional) */}
            {filterDateShortcut === "custom" && (
              <div className="relative">
                <label className="block text-[10px] font-bold text-zinc-550 uppercase tracking-wider mb-1.5">Data Final</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full pl-3 pr-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all cursor-pointer block"
                  title="Data de execução até"
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

            {filterResponsible && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Responsável: {allProfiles.find(p => p.id === filterResponsible)?.full_name || filterResponsible}</span>
                <button onClick={() => setFilterResponsible("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterSector && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Setor do Resp.: {filterSector}</span>
                <button onClick={() => setFilterSector("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterType && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Tipo: {activityTypes.find(t => ((t as any).key || normalizeKey(t.name)) === filterType)?.name || filterType}</span>
                <button onClick={() => setFilterType("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterStatus && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Status: {{
                  pendente: "Pendente",
                  em_andamento: "Em Andamento",
                  bloqueada: "Bloqueada",
                  concluida: "Concluída",
                  arquivado: "Arquivada"
                }[filterStatus] || filterStatus}</span>
                <button onClick={() => setFilterStatus("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
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

            {filterDateShortcut && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>
                  Período: {
                    filterDateShortcut === "custom" 
                      ? `${filterStartDate ? formatDate(filterStartDate) : ""} a ${filterEndDate ? formatDate(filterEndDate) : ""}`
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
                setFilterResponsible("");
                setFilterSector("");
                setFilterPriority("");
                setFilterType("");
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

      {viewMode === "kanban" && (
        <div 
          className="grid gap-6 items-start overflow-x-auto pb-4 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}
        >
          {columns.map((column) => {
            const colActivities = getColActivities(column.status);
            
            return (
              <div 
                key={column.status} 
                onDragOver={(e) => {
                  if (!hasPermission("activities", "update")) return;
                  e.preventDefault();
                }}
                onDragEnter={(e) => {
                  if (!hasPermission("activities", "update")) return;
                  e.preventDefault();
                  setActiveDragColumn(column.status);
                }}
                onDragLeave={() => {
                  if (!hasPermission("activities", "update")) return;
                  setActiveDragColumn(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!hasPermission("activities", "update")) return;
                  setActiveDragColumn(null);
                  const activityId = e.dataTransfer.getData("text/plain") || draggedActivityId;
                  if (activityId) {
                    const activity = activities.find((act) => act.id === activityId);
                    if (activity && activity.status !== column.status) {
                      handleMoveStatus(activity, column.status);
                    }
                  }
                }}
                className={`flex flex-col rounded-xl border transition-all duration-200 p-4 min-w-[220px] ${
                  activeDragColumn === column.status
                    ? "border-blue-500/50 bg-blue-500/5 shadow-lg shadow-blue-500/5 scale-[1.01]"
                    : "border-zinc-800/80 bg-zinc-900/10"
                }`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-zinc-850/80 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{column.label}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-850 text-zinc-400">
                    {colActivities.length}
                  </span>
                </div>

                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
                  {colActivities.map((activity) => (
                    <div
                      key={activity.id}
                      draggable={hasPermission("activities", "update")}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", activity.id);
                        setDraggedActivityId(activity.id);
                      }}
                      onDragEnd={() => {
                        setDraggedActivityId(null);
                      }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
                          return;
                        }
                        handleOpenEditModal(activity);
                      }}
                      className={`relative group rounded-lg border p-4 transition-all duration-200 ${
                        hasPermission("activities", "update") 
                          ? "cursor-grab active:cursor-grabbing" 
                          : "cursor-default"
                      } ${
                        draggedActivityId === activity.id
                          ? "border-zinc-750 bg-zinc-900/20 opacity-40 scale-95"
                          : getPulseStyles(activity) || "border-zinc-850 bg-zinc-950/40 hover:border-zinc-750 hover:shadow-lg hover:shadow-black/20"
                      }`}
                    >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${getPriorityColor(activity.priority)}`}>
                        {activity.priority.toUpperCase()}
                      </span>
                      
                      <div className="flex items-center gap-1.5">
                        {/* Indicador de ação (Visualizar ou Editar) no hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-zinc-555 flex items-center gap-1.5">
                          {canEditActivity(activity) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveStatus(activity, activity.status === "arquivado" ? "pendente" : "arquivado");
                              }}
                              className="text-zinc-450 hover:text-white transition-colors cursor-pointer"
                              title={activity.status === "arquivado" ? "Reativar Atividade" : "Arquivar Atividade"}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {hasPermission("activities", "create") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateActivity(activity);
                              }}
                              className="text-zinc-450 hover:text-white transition-colors cursor-pointer"
                              title="Duplicar Atividade"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canEditActivity(activity) ? (
                            <span title="Editar Atividade">
                              <Pencil className="h-3 w-3 text-zinc-400" />
                            </span>
                          ) : (
                            <span title="Ver Detalhes">
                              <Eye className="h-3 w-3 text-zinc-500" />
                            </span>
                          )}
                        </div>

                        {/* Trash action */}
                        {canEditActivity(activity) && (
                          <button
                            onClick={() => handleDeleteActivity(activity.id)}
                            className="text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <h4 className="mt-3 text-sm font-bold text-white leading-snug">
                      {activity.title}
                    </h4>

                    {activity.project_name && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-550">
                        <Folder className="h-3 w-3 text-zinc-650" />
                        <span className="truncate">{activity.project_name}</span>
                      </div>
                    )}

                    <div className="mt-2.5 flex flex-col gap-1.5">
                      {(activity.start_time_planned || activity.end_time_planned) && (
                        <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 bg-zinc-950/30 border border-zinc-850/50 px-2 py-0.5 rounded w-fit">
                          <Clock className="h-3 w-3 text-zinc-550" />
                          <span>
                            Plan: {activity.start_time_planned || "--:--"} às {activity.end_time_planned || "--:--"}
                          </span>
                        </div>
                      )}
                      {(activity.start_time_executed || activity.end_time_executed) && (
                        <div className="flex items-center gap-1.5 text-[9px] text-emerald-400 bg-emerald-950/10 border border-emerald-900/30 px-2 py-0.5 rounded w-fit">
                          <CheckCircle className="h-3 w-3 text-emerald-550" />
                          <span>
                            Exec: {activity.start_time_executed || "--:--"} às {activity.end_time_executed || "--:--"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between text-[10px] text-zinc-550 border-t border-zinc-850/60 pt-3">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{activity.hours_executed.toFixed(1)}h / {activity.hours_planned}h</span>
                      </div>
                      <span className="text-zinc-500 font-semibold">{activity.responsible_name}</span>
                    </div>

                    {/* Move controls and hours launch panel */}
                    {hasPermission("activities", "update") && (
                      <div className="mt-4 pt-3 border-t border-zinc-850/60 flex items-center justify-between gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedActivity(activity);
                            setIsLogHoursOpen(true);
                          }}
                          className="flex items-center gap-1 text-[10px] font-semibold text-emerald-450 hover:underline cursor-pointer"
                        >
                          <Clock className="h-3 w-3" />
                          Lançar Horas
                        </button>
                        
                        {/* Transition button arrows */}
                        <div className="flex gap-1">
                          {column.status !== "pendente" && (
                            <button
                              onClick={() => handleMoveStatus(activity, "pendente")}
                              title="Voltar para Pendente"
                              className="p-1 rounded bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                          {column.status !== "em_andamento" && (
                            <button
                              onClick={() => handleMoveStatus(activity, "em_andamento")}
                              title="Iniciar Atividade"
                              className="p-1 rounded bg-zinc-900 text-blue-450 hover:text-blue-400 cursor-pointer"
                            >
                              <Play className="h-3 w-3" />
                            </button>
                          )}
                          {column.status !== "concluida" && (
                            <button
                              onClick={() => handleMoveStatus(activity, "concluida")}
                              title="Concluir Atividade"
                              className="p-1 rounded bg-zinc-900 text-emerald-455 hover:text-emerald-400 cursor-pointer"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </button>
                          )}
                          {column.status !== "bloqueada" && (
                            <button
                              onClick={() => handleMoveStatus(activity, "bloqueada")}
                              title="Bloquear Atividade"
                              className="p-1 rounded bg-zinc-900 text-red-450 hover:text-red-400 cursor-pointer"
                            >
                              <AlertCircle className="h-3 w-3" />
                            </button>
                          )}
                          {column.status !== "cancelada" && (
                            <button
                              onClick={() => handleMoveStatus(activity, "cancelada")}
                              title="Cancelar Atividade"
                              className="p-1 rounded bg-zinc-900 text-zinc-500 hover:text-zinc-400 cursor-pointer"
                            >
                              <XCircle className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {colActivities.length === 0 && (
                  <div className="py-12 border border-dashed border-zinc-850 rounded-lg text-center flex flex-col items-center justify-center">
                    <ListTodo className="h-6 w-6 text-zinc-700" />
                    <span className="mt-2 text-[10px] text-zinc-550 font-semibold uppercase">Vazio</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {viewMode === "list" && (
        <div className="rounded-xl border border-zinc-850/80 bg-zinc-900/10 backdrop-blur-md overflow-hidden">
          {selectedActivityIds.length > 0 && (
            <div className="bg-emerald-950/20 border-b border-zinc-850/60 px-6 py-3 flex items-center justify-between animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-400">
                  {selectedActivityIds.length} {selectedActivityIds.length === 1 ? "atividade selecionada" : "atividades selecionadas"}
                </span>
                <button
                  onClick={() => setSelectedActivityIds([])}
                  className="text-xs text-zinc-450 hover:text-zinc-350 transition-colors ml-2 font-medium"
                >
                  Limpar seleção
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleExportCSV(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-900/30 hover:text-emerald-300 transition-all cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar Selecionadas
                </button>
                {hasPermission("activities", "delete") && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-1.5 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-all cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir Selecionadas
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="overflow-x-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
            <table className="w-full border-collapse text-left text-sm text-zinc-300 min-w-[1000px]">
              <thead className="bg-zinc-950/60 border-b border-zinc-850/60 text-xs font-bold text-zinc-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-4 py-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = someSelectedOnPage;
                        }
                      }}
                      onChange={() => handleSelectAllOnPage(listActivitiesFiltered)}
                      className="rounded border-zinc-800 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer h-4 w-4"
                    />
                  </th>
                  <th className="px-6 py-4">Atividade</th>
                  <th className="px-6 py-4">Projeto</th>
                  <th className="px-6 py-4 text-center font-bold">Tipo</th>
                  <th className="px-6 py-4 text-center font-bold">Prioridade</th>
                  <th className="px-6 py-4 text-center font-bold">Data</th>
                  <th className="px-6 py-4">Horários</th>
                  <th className="px-6 py-4 text-center font-bold">Horas</th>
                  <th className="px-6 py-4">Responsável</th>
                  <th className="px-6 py-4 text-center font-bold">Status</th>
                  <th className="px-6 py-4 text-right font-bold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850/40">
                {getFilteredActivities().map((activity) => {
                  const hasEditPerm = canEditActivity(activity);
                  const isSelected = selectedActivityIds.includes(activity.id);
                  return (
                    <tr key={activity.id} className={`hover:bg-zinc-900/20 transition-all duration-150 ${isSelected ? 'bg-emerald-950/5' : ''}`}>
                      <td className="px-4 py-4 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectActivity(activity.id)}
                          className="rounded border-zinc-800 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer h-4 w-4"
                        />
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <div className="font-bold text-white truncate" title={activity.title}>{activity.title}</div>
                        {activity.description && (
                          <div className="text-xs text-zinc-550 line-clamp-1 mt-0.5" title={activity.description}>{activity.description}</div>
                        )}
                        {activity.tags && activity.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {activity.tags.map((tag) => (
                              <span key={tag} className="text-[9px] bg-zinc-850 text-zinc-400 border border-zinc-800 px-1.5 py-0.5 rounded font-semibold">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-zinc-400 max-w-[180px]">
                        {activity.project_name ? (
                          <span className="flex items-center gap-1.5 truncate" title={activity.project_name}>
                            <Folder className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                            <span className="truncate">{activity.project_name}</span>
                          </span>
                        ) : (
                          <span className="text-zinc-655 italic">Sem projeto</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold border ${getActivityTypeStyle(activity.type)}`}>
                          {activity.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold border ${getPriorityColor(activity.priority)}`}>
                          {activity.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-semibold text-zinc-400">
                        {formatDate(activity.activity_date)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {(activity.start_time_planned || activity.end_time_planned) && (
                            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                              <span className="font-bold text-zinc-400">Plan:</span>
                              {activity.start_time_planned || "--:--"} às {activity.end_time_planned || "--:--"}
                            </span>
                          )}
                          {(activity.start_time_executed || activity.end_time_executed) && (
                            <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                              <span className="font-bold text-emerald-600">Exec:</span>
                              {activity.start_time_executed || "--:--"} às {activity.end_time_executed || "--:--"}
                            </span>
                          )}
                          {!activity.start_time_planned && !activity.end_time_planned && !activity.start_time_executed && !activity.end_time_executed && (
                            <span className="text-[10px] text-zinc-650 italic">Nenhum</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-bold">
                        <span className="text-zinc-300">{activity.hours_executed.toFixed(1)}h</span>
                        <span className="text-zinc-600 mx-1">/</span>
                        <span className="text-zinc-500">{activity.hours_planned}h</span>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-zinc-400 max-w-[120px] truncate" title={activity.responsible_name}>
                        {activity.responsible_name}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                          activity.status === "pendente" ? "border-zinc-800 bg-zinc-900 text-zinc-400" :
                          activity.status === "em_andamento" ? "border-blue-500/20 bg-blue-500/5 text-blue-400" :
                          activity.status === "bloqueada" ? "border-red-500/20 bg-red-500/5 text-red-400" :
                          activity.status === "concluida" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" :
                          "border-zinc-800 bg-zinc-900 text-zinc-500"
                        }`}>
                          {activity.status === "pendente" ? "Pendente" :
                           activity.status === "em_andamento" ? "Em Andamento" :
                           activity.status === "bloqueada" ? "Bloqueada" :
                           activity.status === "concluida" ? "Concluída" :
                           activity.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Lançar horas */}
                          {hasPermission("activities", "update") && (
                            <button
                              onClick={() => {
                                setSelectedActivity(activity);
                                setIsLogHoursOpen(true);
                              }}
                              title="Lançar Horas"
                              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all cursor-pointer"
                            >
                              <Clock className="h-4 w-4" />
                            </button>
                          )}

                           {/* Visualizar / Editar */}
                          <button
                            onClick={() => handleOpenEditModal(activity)}
                            title={hasEditPerm ? "Editar" : "Visualizar"}
                            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-850 transition-all cursor-pointer"
                          >
                            {hasEditPerm ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>

                          {/* Duplicar */}
                          {hasPermission("activities", "create") && (
                            <button
                              onClick={() => handleDuplicateActivity(activity)}
                              title="Duplicar"
                              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all cursor-pointer"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          )}

                          {/* Excluir */}
                          {canEditActivity(activity) && (
                            <button
                              onClick={() => handleDeleteActivity(activity.id)}
                              title="Excluir"
                              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-red-400/80 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-all cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {getFilteredActivities().length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <ListTodo className="h-8 w-8 text-zinc-700 mb-2" />
                        <span className="text-sm text-zinc-550 font-semibold uppercase tracking-wider">Nenhuma atividade encontrada</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === "day" && (
        <div className="grid gap-6 md:grid-cols-4 items-start">
          {/* Timeline de Horários */}
          <div className="md:col-span-3 rounded-xl border border-zinc-850/80 bg-zinc-900/10 backdrop-blur-md p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-850/60">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-emerald-450" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cronograma do Dia</h3>
              </div>
              
              {/* Navegação de Dia */}
              <div className="flex items-center gap-1.5 bg-zinc-950/60 border border-zinc-850 p-1 rounded-xl">
                <button
                  onClick={() => handleNavigateDay("prev")}
                  className="px-2.5 py-1 text-xs rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-850 transition-all cursor-pointer font-bold"
                >
                  &larr; Anterior
                </button>
                <button
                  onClick={() => handleNavigateDay("today")}
                  className="px-2.5 py-1 text-xs rounded-lg bg-zinc-800 text-white font-bold hover:bg-zinc-750 transition-all cursor-pointer"
                >
                  Hoje
                </button>
                <button
                  onClick={() => handleNavigateDay("next")}
                  className="px-2.5 py-1 text-xs rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-850 transition-all cursor-pointer font-bold"
                >
                  Próximo &rarr;
                </button>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750 flex gap-4">
              {(() => {
                const slots = [];
                for (let hour = 7; hour <= 21; hour++) {
                  slots.push({ hour, minutes: 0, label: `${String(hour).padStart(2, "0")}:00` });
                  slots.push({ hour, minutes: 30, label: `${String(hour).padStart(2, "0")}:30` });
                }

                const dayActivities = getFilteredActivities();
                const activitiesWithTime = dayActivities.filter((act) => {
                  const tPlannedStart = timeToFloat(act.start_time_planned);
                  const tPlannedEnd = timeToFloat(act.end_time_planned);
                  const tExecutedStart = timeToFloat(act.start_time_executed);
                  const tExecutedEnd = timeToFloat(act.end_time_executed);

                  return (tPlannedStart !== null && tPlannedEnd !== null) || (tExecutedStart !== null && tExecutedEnd !== null);
                });

                return (
                  <>
                    {/* Lado esquerdo: Marcações de hora */}
                    <div className="w-12 flex flex-col select-none pt-[6px]">
                      {slots.map((slot) => (
                        <div key={`label-${slot.label}`} className="h-12 text-[10px] font-bold text-zinc-550 pt-1">
                          {slot.label}
                        </div>
                      ))}
                    </div>

                    {/* Lado direito: Grade de cronograma com posicionamento absoluto */}
                    <div className="flex-1 relative h-[1440px] bg-zinc-950/20 rounded-lg border border-zinc-900/30 overflow-hidden">
                      {/* Linhas de fundo e drop targets */}
                      {slots.map((slot, index) => {
                        const slotTimeVal = slot.hour + slot.minutes / 60;
                        return (
                          <div
                            key={`line-${slot.label}`}
                            style={{ top: `${index * 48}px`, height: "48px" }}
                            className="absolute left-0 right-0 border-b border-zinc-900/30 flex items-center px-3 z-0"
                            onDragOver={(e) => e.preventDefault()}
                            onMouseEnter={() => {
                              if (resizingState) {
                                handleResizeHover(slotTimeVal);
                              }
                            }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              const activityId = e.dataTransfer.getData("text/plain");
                              const source = e.dataTransfer.getData("source");
                              if (!activityId) return;
                              
                              const act = activities.find(a => a.id === activityId);
                              if (!act) return;
                              
                              const start_time_planned = slot.label;
                              let end_time_planned = "";
                              
                              if (source === "sidebar") {
                                end_time_planned = formatTimeFromFloat(Math.min(22, slotTimeVal + 1.0));
                              } else {
                                const currentDur = (timeToFloat(act.end_time_planned) || 0) - (timeToFloat(act.start_time_planned) || 0);
                                const dur = currentDur > 0 ? currentDur : 1.0;
                                end_time_planned = formatTimeFromFloat(Math.min(22, slotTimeVal + dur));
                              }
                              
                              const updates = {
                                activity_date: filterStartDate || new Date().toISOString().split("T")[0],
                                start_time_planned,
                                end_time_planned
                              };
                              
                              setActivities((prev) =>
                                prev.map((a) =>
                                  a.id === activityId
                                    ? {
                                        ...a,
                                        ...updates
                                      }
                                    : a
                                )
                              );
                              
                              try {
                                await updateActivity(activityId, updates);
                              } catch (error) {
                                console.error("Erro ao atualizar horário da atividade:", error);
                              }
                            }}
                          />
                        );
                      })}

                      {/* Atividades com horário posicionadas de forma absoluta */}
                      {activitiesWithTime.map((activity) => {
                        const hasEditPerm = canEditActivity(activity);
                        const tPlannedStart = timeToFloat(activity.start_time_planned);
                        const tPlannedEnd = timeToFloat(activity.end_time_planned);
                        const tExecutedStart = timeToFloat(activity.start_time_executed);
                        const tExecutedEnd = timeToFloat(activity.end_time_executed);

                        const startVal = tPlannedStart ?? tExecutedStart ?? 7.0;
                        const endVal = tPlannedEnd ?? tExecutedEnd ?? 8.0;

                        const clampedStart = Math.max(7.0, Math.min(22.0, startVal));
                        const clampedEnd = Math.max(7.0, Math.min(22.0, endVal));
                        
                        if (clampedStart >= clampedEnd) return null;

                        const topPx = (clampedStart - 7.0) * 2 * 48;
                        const heightPx = (clampedEnd - clampedStart) * 2 * 48;
                        
                        const { leftPct, widthPct } = getOverlapStyle(activity, activitiesWithTime);
                        const isExecuted = tExecutedStart !== null && tExecutedEnd !== null;

                        return (
                          <div
                            key={activity.id}
                            style={{
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                            }}
                            className="absolute p-0.5 z-10 transition-all duration-75"
                          >
                            <div
                              onClick={() => handleOpenEditModal(activity)}
                              draggable={hasEditPerm ? "true" : "false"}
                              onDragStart={(e) => {
                                if (resizingState) {
                                  e.preventDefault();
                                  return;
                                }
                                e.dataTransfer.setData("text/plain", activity.id);
                                e.dataTransfer.setData("source", "timeline");
                              }}
                              className={`h-full w-full rounded-lg border p-2.5 bg-zinc-950/90 hover:bg-zinc-950 hover:border-zinc-700 transition-all relative group/card cursor-grab active:cursor-grabbing border-l-4 flex flex-col justify-between overflow-hidden shadow-lg ${
                                isExecuted 
                                  ? "border-l-emerald-500 border-zinc-850" 
                                  : "border-l-blue-500 border-zinc-850"
                              }`}
                            >
                              {/* Handles de redimensionamento */}
                              {hasEditPerm && (
                                <div 
                                  className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize bg-zinc-400/20 hover:bg-emerald-555/40 opacity-0 group-hover/card:opacity-100 transition-opacity z-20"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setResizingState({
                                      activityId: activity.id,
                                      type: "top",
                                      kind: isExecuted ? "executed" : "planned",
                                      initialStart: isExecuted ? (activity.start_time_executed || "") : (activity.start_time_planned || ""),
                                      initialEnd: isExecuted ? (activity.end_time_executed || "") : (activity.end_time_planned || "")
                                    });
                                  }}
                                />
                              )}

                              {hasEditPerm && (
                                <div 
                                  className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-zinc-400/20 hover:bg-emerald-555/40 opacity-0 group-hover/card:opacity-100 transition-opacity z-20"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setResizingState({
                                      activityId: activity.id,
                                      type: "bottom",
                                      kind: isExecuted ? "executed" : "planned",
                                      initialStart: isExecuted ? (activity.start_time_executed || "") : (activity.start_time_planned || ""),
                                      initialEnd: isExecuted ? (activity.end_time_executed || "") : (activity.end_time_planned || "")
                                    });
                                  }}
                                />
                              )}

                              <div className="min-h-0 flex flex-col">
                                {/* Ações rápidas */}
                                <div className="absolute right-2 top-2 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150 flex items-center gap-1 bg-zinc-950/80 pl-1.5 rounded-l z-10">
                                  {hasPermission("activities", "update") && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedActivity(activity);
                                        setIsLogHoursOpen(true);
                                      }}
                                      title="Lançar Horas"
                                      className="p-1 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900 rounded"
                                    >
                                      <Clock className="h-3 w-3" />
                                    </button>
                                  )}
                                  {hasEditPerm && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditModal(activity);
                                      }}
                                      title="Editar"
                                      className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>

                                <div className="font-bold text-xs text-white truncate pr-10" title={activity.title}>
                                  {activity.title}
                                </div>
                                
                                <div className="flex items-center gap-2 mt-1 text-[9px] font-semibold text-zinc-450">
                                  <span className={`px-1.5 py-0.2 rounded border ${getPriorityColor(activity.priority)}`}>
                                    {activity.priority.toUpperCase()}
                                  </span>
                                  <span className="truncate max-w-[80px] text-zinc-550">
                                    {activity.responsible_name.split(" ")[0]}
                                  </span>
                                </div>
                              </div>

                              {/* Detalhe de Horários da Atividade */}
                              <div className="mt-1 pt-1 border-t border-zinc-900/60 flex flex-col gap-0.5 text-[9px] text-zinc-500">
                                {activity.start_time_planned && (
                                  <span className="flex items-center gap-1">
                                    <span className="font-bold text-zinc-400">Plan:</span>
                                    {activity.start_time_planned} - {activity.end_time_planned}
                                  </span>
                                )}
                                {activity.start_time_executed && (
                                  <span className="text-emerald-500 flex items-center gap-1">
                                    <span className="font-bold text-emerald-650">Exec:</span>
                                    {activity.start_time_executed} - {activity.end_time_executed}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Mensagem se não houver tarefas com horário */}
                      {activitiesWithTime.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                          <div className="text-zinc-650 text-xs italic font-medium bg-zinc-950/80 px-4 py-2 rounded-xl border border-zinc-900/40">
                            Arraste atividades sem horário aqui para agendar
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Painel Lateral: Atividades Sem Horário */}
          <div className="rounded-xl border border-zinc-850/80 bg-zinc-900/10 backdrop-blur-md p-5 space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider pb-3 border-b border-zinc-850/60 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-zinc-500" />
              Sem Horário Definido
            </h4>

            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {getFilteredActivities().filter((act) => !act.start_time_planned && !act.start_time_executed).map((activity) => {
                return (
                  <div 
                    key={activity.id}
                    onClick={() => handleOpenEditModal(activity)}
                    draggable="true"
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", activity.id);
                      e.dataTransfer.setData("source", "sidebar");
                    }}
                    className="group border border-zinc-850 bg-zinc-950/40 hover:bg-zinc-950 hover:border-zinc-750 transition-all p-3 rounded-lg cursor-grab active:cursor-grabbing relative"
                  >
                    {/* Ações rápidas */}
                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 bg-zinc-950/85 pl-1 rounded-l">
                      {hasPermission("activities", "update") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedActivity(activity);
                            setIsLogHoursOpen(true);
                          }}
                          title="Lançar Horas"
                          className="p-1 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900 rounded"
                        >
                          <Clock className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <div className="font-bold text-xs text-white truncate pr-6" title={activity.title}>
                      {activity.title}
                    </div>
                    {activity.project_name && (
                      <div className="mt-1 text-[9px] text-zinc-500 flex items-center gap-1 truncate" title={activity.project_name}>
                        <Folder className="h-2.5 w-2.5" />
                        <span className="truncate">{activity.project_name}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-zinc-900/60 text-[9px]">
                      <span className={`px-1.5 py-0.2 rounded border ${getPriorityColor(activity.priority)}`}>
                        {activity.priority.toUpperCase()}
                      </span>
                      <span className="text-zinc-500 font-semibold truncate max-w-[80px]">
                        {activity.responsible_name.split(" ")[0]}
                      </span>
                    </div>
                  </div>
                );
              })}

              {getFilteredActivities().filter((act) => !act.start_time_planned && !act.start_time_executed).length === 0 && (
                <div className="py-8 text-center text-xs text-zinc-650 italic">
                  Tudo organizado!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === "week" && (
        <div className="space-y-6">
          {/* Cabeçalho da Semana com Navegação */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-zinc-850/80 bg-zinc-900/10 backdrop-blur-md p-5">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-emerald-450" />
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cronograma Semanal</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Visualização de {filterStartDate ? formatDate(filterStartDate) : ""} a {filterEndDate ? formatDate(filterEndDate) : ""}
                </p>
              </div>
            </div>
            
            {/* Navegação de Semana */}
            <div className="flex items-center gap-1.5 bg-zinc-950/60 border border-zinc-850 p-1 rounded-xl self-start sm:self-auto">
              <button
                onClick={() => handleNavigateDay("prev")}
                className="px-2.5 py-1 text-xs rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-850 transition-all cursor-pointer font-bold"
              >
                &larr; Anterior
              </button>
              <button
                onClick={() => handleNavigateDay("today")}
                className="px-2.5 py-1 text-xs rounded-lg bg-zinc-800 text-white font-bold hover:bg-zinc-750 transition-all cursor-pointer"
              >
                Hoje
              </button>
              <button
                onClick={() => handleNavigateDay("next")}
                className="px-2.5 py-1 text-xs rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-850 transition-all cursor-pointer font-bold"
              >
                Próximo &rarr;
              </button>
            </div>
          </div>

          {/* Grade de 7 Colunas */}
          <div 
            className="grid gap-4 items-start overflow-x-auto pb-4 scrollbar-thin"
            style={{ gridTemplateColumns: "repeat(7, minmax(200px, 1fr))" }}
          >
            {getWeekDays().map((day) => {
              const dayActivities = getFilteredActivities().filter(
                (act) => act.activity_date === day.dateStr
              );
              const isToday = day.dateStr === new Date().toISOString().split("T")[0];

              return (
                <div 
                  key={day.dateStr}
                  onDragOver={(e) => {
                    if (!hasPermission("activities", "update")) return;
                    e.preventDefault();
                  }}
                  onDragEnter={(e) => {
                    if (!hasPermission("activities", "update")) return;
                    e.preventDefault();
                    setActiveDragDay(day.dateStr);
                  }}
                  onDragLeave={() => {
                    if (!hasPermission("activities", "update")) return;
                    setActiveDragDay(null);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    if (!hasPermission("activities", "update")) return;
                    setActiveDragDay(null);
                    const activityId = e.dataTransfer.getData("text/plain") || draggedActivityId;
                    if (activityId) {
                      const activity = activities.find((act) => act.id === activityId);
                      if (activity && activity.activity_date !== day.dateStr) {
                        await handleMoveDay(activity, day.dateStr);
                      }
                    }
                  }}
                  className={`rounded-xl border p-4 space-y-3 transition-all min-h-[400px] ${
                    activeDragDay === day.dateStr
                      ? "border-emerald-500 bg-emerald-500/5 shadow-lg shadow-emerald-500/5 scale-[1.01]"
                      : isToday 
                        ? "border-emerald-500/30 bg-emerald-500/5 backdrop-blur-md shadow-md shadow-emerald-950/5" 
                        : "border-zinc-850/80 bg-zinc-900/10 backdrop-blur-md"
                  }`}
                >
                  {/* Título do Dia */}
                  <div className="flex items-center justify-between border-b border-zinc-850/60 pb-2">
                    <span className={`text-xs font-bold uppercase tracking-wider ${isToday ? "text-emerald-400 font-extrabold" : "text-white"}`}>
                      {day.label}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-500">
                      {day.dateStr.split("-")[2]}/{day.dateStr.split("-")[1]}
                    </span>
                  </div>

                  {/* Lista de Atividades do Dia */}
                  <div className="space-y-3">
                    {dayActivities.map((activity) => {
                      const hasEditPerm = canEditActivity(activity);
                      
                      return (
                        <div
                          key={activity.id}
                          draggable={hasPermission("activities", "update")}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", activity.id);
                            setDraggedActivityId(activity.id);
                          }}
                          onDragEnd={() => {
                            setDraggedActivityId(null);
                          }}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
                              return;
                            }
                            handleOpenEditModal(activity);
                          }}
                          className={`group border border-zinc-850 bg-zinc-950/40 hover:bg-zinc-950 hover:border-zinc-750 transition-all p-3 rounded-lg cursor-pointer relative ${
                            draggedActivityId === activity.id ? "opacity-40" : ""
                          }`}
                        >
                          {/* Ações rápidas */}
                          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 bg-zinc-950/85 pl-1 rounded-l">
                            {hasPermission("activities", "update") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedActivity(activity);
                                  setIsLogHoursOpen(true);
                                }}
                                title="Lançar Horas"
                                className="p-1 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900 rounded"
                              >
                                <Clock className="h-3 w-3" />
                              </button>
                            )}
                          </div>

                          <div className="font-bold text-xs text-white truncate pr-6" title={activity.title}>
                            {activity.title}
                          </div>
                          
                          {activity.project_name && (
                            <div className="mt-1 text-[9px] text-zinc-550 flex items-center gap-1 truncate" title={activity.project_name}>
                              <Folder className="h-2.5 w-2.5" />
                              <span className="truncate">{activity.project_name}</span>
                            </div>
                          )}

                          {/* Detalhes de Horários da Atividade na Semana */}
                          {(activity.start_time_planned || activity.start_time_executed) && (
                            <div className="mt-2 pt-1.5 border-t border-zinc-900/60 flex flex-col gap-0.5 text-[9px]">
                              {activity.start_time_planned && (
                                <span className="text-zinc-500 flex items-center gap-1">
                                  <span className="font-bold text-zinc-400">Plan:</span>
                                  {activity.start_time_planned} - {activity.end_time_planned}
                                </span>
                              )}
                              {activity.start_time_executed && (
                                <span className="text-emerald-500 flex items-center gap-1">
                                  <span className="font-bold text-emerald-650">Exec:</span>
                                  {activity.start_time_executed} - {activity.end_time_executed}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-zinc-900/60 text-[9px]">
                            <span className={`px-1.5 py-0.2 rounded border ${getPriorityColor(activity.priority)}`}>
                              {activity.priority.toUpperCase()}
                            </span>
                            <span className="text-zinc-500 font-semibold truncate max-w-[80px]">
                              {activity.responsible_name.split(" ")[0]}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {dayActivities.length === 0 && (
                      <div className="py-8 text-center text-xs text-zinc-650 italic">
                        Sem atividades
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "month" && (
        <div className="space-y-4">
          {/* Header da Visão Mensal */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/10 border border-zinc-850/80 p-4 rounded-xl backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cronograma Mensal</h3>
                <p className="text-xs text-emerald-450 font-semibold mt-0.5">
                  {getMonthLabel()}
                </p>
              </div>
            </div>
            
            {/* Navegação de Mês */}
            <div className="flex items-center gap-1.5 bg-zinc-950/60 border border-zinc-850 p-1 rounded-xl self-start sm:self-auto">
              <button
                onClick={() => handleNavigateDay("prev")}
                className="px-2.5 py-1 text-xs rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-850 transition-all cursor-pointer font-bold"
              >
                &larr; Anterior
              </button>
              <button
                onClick={() => handleNavigateDay("today")}
                className="px-2.5 py-1 text-xs rounded-lg bg-zinc-800 text-white font-bold hover:bg-zinc-750 transition-all cursor-pointer"
              >
                Hoje
              </button>
              <button
                onClick={() => handleNavigateDay("next")}
                className="px-2.5 py-1 text-xs rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-850 transition-all cursor-pointer font-bold"
              >
                Próximo &rarr;
              </button>
            </div>
          </div>

          {/* Grade Calendário Mensal */}
          <div className="rounded-xl border border-zinc-850 bg-zinc-900/10 backdrop-blur-md p-4 overflow-x-auto scrollbar-thin">
            <div className="min-w-[700px]">
              {/* Dias da Semana */}
              <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-850/60">
                <div>Seg</div>
                <div>Ter</div>
                <div>Qua</div>
                <div>Qui</div>
                <div>Sex</div>
                <div>Sáb</div>
                <div>Dom</div>
              </div>

              {/* Dias do Mês */}
              <div className="grid grid-cols-7 gap-2">
                {getMonthDays().map((day, idx) => {
                  const dayActivities = getFilteredActivities().filter(
                    (act) => act.activity_date === day.dateStr
                  );
                  const isToday = day.dateStr === new Date().toISOString().split("T")[0];
                  
                  return (
                    <div
                      key={`${day.dateStr}-${idx}`}
                      onDragOver={(e) => {
                        if (!hasPermission("activities", "update")) return;
                        e.preventDefault();
                      }}
                      onDragEnter={(e) => {
                        if (!hasPermission("activities", "update")) return;
                        e.preventDefault();
                        setActiveDragDay(day.dateStr);
                      }}
                      onDragLeave={() => {
                        if (!hasPermission("activities", "update")) return;
                        setActiveDragDay(null);
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        if (!hasPermission("activities", "update")) return;
                        setActiveDragDay(null);
                        const activityId = e.dataTransfer.getData("text/plain") || draggedActivityId;
                        if (activityId) {
                          const activity = activities.find((act) => act.id === activityId);
                          if (activity && activity.activity_date !== day.dateStr) {
                            await handleMoveDay(activity, day.dateStr);
                          }
                        }
                      }}
                      className={`min-h-[110px] md:min-h-[135px] border rounded-lg p-2 flex flex-col space-y-1.5 transition-all group relative ${
                        activeDragDay === day.dateStr
                          ? "border-emerald-500 bg-emerald-500/5 shadow-lg shadow-emerald-500/5 scale-[1.01]"
                          : day.isCurrentMonth
                            ? isToday
                              ? "border-emerald-500/40 bg-emerald-500/5 shadow-md shadow-emerald-950/5"
                              : "border-zinc-850/70 bg-zinc-950/20 hover:border-zinc-750"
                            : "border-zinc-900 bg-zinc-950/5 opacity-35 hover:opacity-60"
                      }`}
                    >
                      {/* Cabeçalho do Dia */}
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-bold ${isToday ? "text-emerald-400 font-extrabold" : "text-zinc-400"}`}>
                          {day.dayNum}
                        </span>
                        
                        {/* Botão rápido para adicionar atividade neste dia */}
                        {hasPermission("activities", "create") && (
                          <button
                            onClick={() => {
                              setDate(yyyymmddToDdmmyyyy(day.dateStr));
                              setDateError("");
                              setIsNewActivityOpen(true);
                            }}
                            title="Nova atividade para este dia"
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 text-zinc-500 hover:text-emerald-450 hover:bg-zinc-850 rounded"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Lista de Atividades */}
                      <div className="flex-1 overflow-y-auto space-y-1 max-h-[80px] md:max-h-[95px] pr-0.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-track]:bg-transparent">
                        {dayActivities.map((activity) => (
                          <div
                            key={activity.id}
                            draggable={hasPermission("activities", "update")}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", activity.id);
                              setDraggedActivityId(activity.id);
                            }}
                            onDragEnd={() => {
                              setDraggedActivityId(null);
                            }}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
                                return;
                              }
                              handleOpenEditModal(activity);
                            }}
                            className={`px-1.5 py-0.5 text-[10px] text-white font-semibold rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850/80 cursor-pointer truncate flex items-center gap-1 ${
                              draggedActivityId === activity.id ? "opacity-40" : ""
                            }`}
                            title={`${activity.title} (${activity.priority.toUpperCase()})`}
                          >
                            <span className={`w-1 h-1 rounded-full shrink-0 ${
                              activity.priority === "alta"
                                ? "bg-red-500"
                                : activity.priority === "media"
                                  ? "bg-yellow-500"
                                  : "bg-blue-500"
                            }`} />
                            <span className="truncate">{activity.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW ACTIVITY MODAL */}
      {isNewActivityOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsNewActivityOpen(false)} />
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-emerald-450" />
              Nova Atividade
            </h2>
            <form onSubmit={handleCreateActivity} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Título</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                    placeholder="Ex: Mapear fluxos de dados"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Descrição</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-16"
                    placeholder="Descreva o que será feito..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Projeto Vinculado</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-zinc-950 text-white">-- Sem vínculo (Rotina) --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id} className="bg-zinc-950 text-white">{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tipo</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer"
                  >
                    {activityTypes.map((t) => (
                      <option key={t.id} value={(t as any).key || normalizeKey(t.name)} className="bg-zinc-950 text-white">
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Prioridade</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Activity["priority"])}
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

                <div className="space-y-2 relative">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Data da Atividade</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="DD/MM/AAAA"
                      value={date}
                      onChange={(e) => {
                        const masked = applyDateMask(e.target.value);
                        setDate(masked);
                        if (masked.length === 10) {
                          if (!isValidDateStr(masked)) {
                            setDateError("Data inválida. Use o formato DD/MM/AAAA.");
                          } else {
                            setDateError("");
                          }
                        } else {
                          setDateError("");
                        }
                      }}
                      onBlur={() => {
                        if (date && !isValidDateStr(date)) {
                          setDateError("Data inválida. Use o formato DD/MM/AAAA.");
                        }
                      }}
                      className={`flex-1 rounded-lg border bg-zinc-950 p-2.5 text-sm text-white focus:outline-none ${
                        dateError ? "border-red-500/80 focus:border-red-500" : "border-zinc-800 focus:border-emerald-500/50"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                      className="px-3 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer flex items-center justify-center"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {dateError && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      {dateError}
                    </p>
                  )}

                  {isCalendarOpen && (
                    <div className="absolute right-0 mt-1.5 w-64 bg-zinc-950 border border-zinc-850 rounded-xl p-3 shadow-2xl z-50">
                      {/* Cabeçalho do popover */}
                      <div className="flex items-center justify-between mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            const prev = new Date(calendarMonth);
                            prev.setMonth(prev.getMonth() - 1);
                            setCalendarMonth(prev);
                          }}
                          className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-white cursor-pointer"
                        >
                          &larr;
                        </button>
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          {calendarMonth.toLocaleString("pt-BR", { month: "long", year: "numeric" })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Date(calendarMonth);
                            next.setMonth(next.getMonth() + 1);
                            setCalendarMonth(next);
                          }}
                          className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-white cursor-pointer"
                        >
                          &rarr;
                        </button>
                      </div>
                      
                      {/* Dias da semana */}
                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-zinc-500 mb-1">
                        <span>Dom</span>
                        <span>Seg</span>
                        <span>Ter</span>
                        <span>Qua</span>
                        <span>Qui</span>
                        <span>Sex</span>
                        <span>Sáb</span>
                      </div>
                      
                      {/* Dias do mês */}
                      <div className="grid grid-cols-7 gap-1">
                        {getDaysInMonthForCalendar(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((dayObj, index) => {
                          if (!dayObj.day) {
                            return <div key={`empty-${index}`} />;
                          }
                          const isSelected = ddmmyyyyToYyyymmdd(date) === dayObj.dateStr;
                          const isToday = new Date().toISOString().split("T")[0] === dayObj.dateStr;
                          
                          return (
                            <button
                              type="button"
                              key={`day-${dayObj.day}`}
                              onClick={() => {
                                const formatted = yyyymmddToDdmmyyyy(dayObj.dateStr);
                                setDate(formatted);
                                setDateError("");
                                setIsCalendarOpen(false);
                              }}
                              className={`h-7 w-7 text-xs font-semibold rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-emerald-500 text-white font-bold"
                                  : isToday
                                  ? "border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                                  : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                              }`}
                            >
                              {dayObj.day}
                            </button>
                          );
                        })}
                      </div>
                      
                      {/* Rodapé: Atalho para "Hoje" */}
                      <div className="border-t border-zinc-900/60 mt-2 pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const todayStr = yyyymmddToDdmmyyyy(new Date().toISOString().split("T")[0]);
                            setDate(todayStr);
                            setDateError("");
                            setCalendarMonth(new Date());
                            setIsCalendarOpen(false);
                          }}
                          className="text-[10px] font-bold text-emerald-450 hover:text-emerald-400 hover:underline cursor-pointer"
                        >
                          Hoje
                        </button>
                      </div>
                    </div>
                  )}
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
                    value={startTimePlanned}
                    onChange={(e) => setStartTimePlanned(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Hora de Fim (Planejado)</label>
                  <input
                    type="time"
                    value={endTimePlanned}
                    onChange={(e) => setEndTimePlanned(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-emerald-450 uppercase tracking-wider">Hora de Início (Executado)</label>
                  <input
                    type="time"
                    value={startTimeExecuted}
                    onChange={(e) => setStartTimeExecuted(e.target.value)}
                    className="w-full rounded-lg border border-emerald-950/40 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-emerald-450 uppercase tracking-wider">Hora de Fim (Executado)</label>
                  <input
                    type="time"
                    value={endTimeExecuted}
                    onChange={(e) => setEndTimeExecuted(e.target.value)}
                    className="w-full rounded-lg border border-emerald-950/40 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tags (separadas por vírgula)</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                    placeholder="Excel, Banco, Limpeza"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Observações</label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-14"
                    placeholder="Observações adicionais..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsNewActivityOpen(false)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-2.5 text-xs font-semibold text-zinc-450 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 transition-all cursor-pointer"
                >
                  Criar Atividade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LANÇAR HORAS MODAL */}
      {isLogHoursOpen && selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsLogHoursOpen(false)} />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
            <h2 className="text-lg font-bold text-white mb-4">Lançar Horas de Trabalho</h2>
            <p className="text-xs text-zinc-450 mb-6">
              Lançando progresso na atividade: <strong className="text-white">&quot;{selectedActivity.title}&quot;</strong>
            </p>
            <form onSubmit={handleLogHoursSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Hora de Início</label>
                  <input
                    type="time"
                    required
                    value={logStartTimeExecuted}
                    onChange={(e) => setLogStartTimeExecuted(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Hora de Fim</label>
                  <input
                    type="time"
                    required
                    value={logEndTimeExecuted}
                    onChange={(e) => setLogEndTimeExecuted(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Horas Trabalhadas</label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={hoursToLog}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 text-sm text-zinc-400 focus:outline-none cursor-not-allowed"
                  placeholder="Calculado automaticamente..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">O que foi feito?</label>
                <textarea
                  required
                  value={logDescription}
                  onChange={(e) => setLogDescription(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-20"
                  placeholder="Descrição das tarefas concluídas neste intervalo de tempo..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsLogHoursOpen(false)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-semibold text-zinc-450 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 transition-all cursor-pointer"
                >
                  Lançar
                </button>
              </div>
            </form>

            {/* Histórico de Lançamentos */}
            <div className="mt-8 pt-6 border-t border-zinc-800 space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-4 w-4 text-zinc-400" />
                Histórico de Lançamentos
              </h3>

              {isLoadingLogs ? (
                <div className="text-xs text-zinc-500 py-2 animate-pulse">Carregando lançamentos...</div>
              ) : activityLogs.length === 0 ? (
                <div className="text-xs text-zinc-500 py-2 italic">Nenhum lançamento registrado para esta atividade.</div>
              ) : (
                <div className="space-y-3">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="rounded-lg bg-zinc-950 p-3 border border-zinc-800/60 space-y-1 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-zinc-200">{log.person_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-350 font-bold">
                            {log.hours}h
                          </span>
                          {(log.person_id === user?.uid || profile?.role === "admin" || profile?.role === "gestor") && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTimeLog(log)}
                              className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-900 transition-colors cursor-pointer flex items-center justify-center"
                              title="Excluir lançamento"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {log.log_date && (
                        <div className="text-[10px] text-zinc-500">
                          Data do lançamento: {log.log_date}
                        </div>
                      )}
                      {log.description && (
                        <p className="text-zinc-400 leading-relaxed break-words">{log.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT / VIEW ACTIVITY DETAILS MODAL */}
      {isEditActivityOpen && editingActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => {
            setIsEditActivityOpen(false);
            setEditingActivity(null);
          }} />
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              {canEditActivity(editingActivity) ? (
                <>
                  <Pencil className="h-5 w-5 text-emerald-400" />
                  Editar Atividade
                </>
              ) : (
                <>
                  <Eye className="h-5 w-5 text-zinc-400" />
                  Detalhes da Atividade
                </>
              )}
            </h2>
            <form onSubmit={handleEditActivitySubmit} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Título</label>
                  <input
                    type="text"
                    required
                    disabled={!canEditActivity(editingActivity)}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Ex: Mapear fluxos de dados"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Descrição</label>
                  <textarea
                    disabled={!canEditActivity(editingActivity)}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-16 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Descreva o que será feito..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Projeto Vinculado</label>
                  <select
                    disabled={!canEditActivity(editingActivity)}
                    value={editProjectId}
                    onChange={(e) => setEditProjectId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="" className="bg-zinc-950 text-white">-- Sem vínculo (Rotina) --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id} className="bg-zinc-950 text-white">{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tipo</label>
                  <select
                    disabled={!canEditActivity(editingActivity)}
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {activityTypes.map((t) => (
                      <option key={t.id} value={(t as any).key || normalizeKey(t.name)} className="bg-zinc-950 text-white">
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Prioridade</label>
                  <select
                    disabled={!canEditActivity(editingActivity)}
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as Activity["priority"])}
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
                    disabled={!canEditActivity(editingActivity)}
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as Activity["status"])}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-955 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="pendente" className="bg-zinc-950 text-white">Pendente</option>
                    <option value="em_andamento" className="bg-zinc-950 text-white">Em Andamento</option>
                    <option value="bloqueada" className="bg-zinc-950 text-white">Bloqueada</option>
                    <option value="concluida" className="bg-zinc-950 text-white">Concluída</option>
                    <option value="cancelada" className="bg-zinc-950 text-white">Cancelada</option>
                    <option value="arquivado" className="bg-zinc-950 text-white">Arquivado</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Responsável</label>
                  <select
                    disabled={!canEditActivity(editingActivity)}
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

                <div className="space-y-2 relative">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Data da Atividade</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="DD/MM/AAAA"
                      disabled={!canEditActivity(editingActivity)}
                      value={editDate}
                      onChange={(e) => {
                        const masked = applyDateMask(e.target.value);
                        setEditDate(masked);
                        if (masked.length === 10) {
                          if (!isValidDateStr(masked)) {
                            setEditDateError("Data inválida. Use o formato DD/MM/AAAA.");
                          } else {
                            setEditDateError("");
                          }
                        } else {
                          setEditDateError("");
                        }
                      }}
                      onBlur={() => {
                        if (editDate && !isValidDateStr(editDate)) {
                          setEditDateError("Data inválida. Use o formato DD/MM/AAAA.");
                        }
                      }}
                      className={`flex-1 rounded-lg border bg-zinc-955 p-2.5 text-sm text-white focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed ${
                        editDateError ? "border-red-500/80 focus:border-red-500" : "border-zinc-800 focus:border-emerald-500/50"
                      }`}
                    />
                    <button
                      type="button"
                      disabled={!canEditActivity(editingActivity)}
                      onClick={() => setIsEditCalendarOpen(!isEditCalendarOpen)}
                      className="px-3 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {editDateError && (
                    <p className="text-[11px] font-semibold text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      {editDateError}
                    </p>
                  )}

                  {isEditCalendarOpen && (
                    <div className="absolute right-0 mt-1.5 w-64 bg-zinc-950 border border-zinc-850 rounded-xl p-3 shadow-2xl z-50">
                      {/* Cabeçalho do popover */}
                      <div className="flex items-center justify-between mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            const prev = new Date(editCalendarMonth);
                            prev.setMonth(prev.getMonth() - 1);
                            setEditCalendarMonth(prev);
                          }}
                          className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-white cursor-pointer"
                        >
                          &larr;
                        </button>
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          {editCalendarMonth.toLocaleString("pt-BR", { month: "long", year: "numeric" })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Date(editCalendarMonth);
                            next.setMonth(next.getMonth() + 1);
                            setEditCalendarMonth(next);
                          }}
                          className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-white cursor-pointer"
                        >
                          &rarr;
                        </button>
                      </div>
                      
                      {/* Dias da semana */}
                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-zinc-500 mb-1">
                        <span>Dom</span>
                        <span>Seg</span>
                        <span>Ter</span>
                        <span>Qua</span>
                        <span>Qui</span>
                        <span>Sex</span>
                        <span>Sáb</span>
                      </div>
                      
                      {/* Dias do mês */}
                      <div className="grid grid-cols-7 gap-1">
                        {getDaysInMonthForCalendar(editCalendarMonth.getFullYear(), editCalendarMonth.getMonth()).map((dayObj, index) => {
                          if (!dayObj.day) {
                            return <div key={`empty-${index}`} />;
                          }
                          const isSelected = ddmmyyyyToYyyymmdd(editDate) === dayObj.dateStr;
                          const isToday = new Date().toISOString().split("T")[0] === dayObj.dateStr;
                          
                          return (
                            <button
                              type="button"
                              key={`day-${dayObj.day}`}
                              onClick={() => {
                                const formatted = yyyymmddToDdmmyyyy(dayObj.dateStr);
                                setEditDate(formatted);
                                setEditDateError("");
                                setIsEditCalendarOpen(false);
                              }}
                              className={`h-7 w-7 text-xs font-semibold rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-emerald-500 text-white font-bold"
                                  : isToday
                                  ? "border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                                  : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                              }`}
                            >
                              {dayObj.day}
                            </button>
                          );
                        })}
                      </div>
                      
                      {/* Rodapé: Atalho para "Hoje" */}
                      <div className="border-t border-zinc-900/60 mt-2 pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const todayStr = yyyymmddToDdmmyyyy(new Date().toISOString().split("T")[0]);
                            setEditDate(todayStr);
                            setEditDateError("");
                            setEditCalendarMonth(new Date());
                            setIsEditCalendarOpen(false);
                          }}
                          className="text-[10px] font-bold text-emerald-450 hover:text-emerald-400 hover:underline cursor-pointer"
                        >
                          Hoje
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Horas Planejadas</label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={editHoursPlanned}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 text-sm text-zinc-400 focus:outline-none cursor-not-allowed"
                    placeholder="Calculado automaticamente..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Hora de Início (Planejado)</label>
                  <input
                    type="time"
                    disabled={!canEditActivity(editingActivity)}
                    value={editStartTimePlanned}
                    onChange={(e) => setEditStartTimePlanned(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Hora de Fim (Planejado)</label>
                  <input
                    type="time"
                    disabled={!canEditActivity(editingActivity)}
                    value={editEndTimePlanned}
                    onChange={(e) => setEditEndTimePlanned(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-emerald-450 uppercase tracking-wider">Hora de Início (Executado)</label>
                  <input
                    type="time"
                    disabled={!canEditActivity(editingActivity)}
                    value={editStartTimeExecuted}
                    onChange={(e) => setEditStartTimeExecuted(e.target.value)}
                    className="w-full rounded-lg border border-emerald-950/40 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-emerald-450 uppercase tracking-wider">Hora de Fim (Executado)</label>
                  <input
                    type="time"
                    disabled={!canEditActivity(editingActivity)}
                    value={editEndTimeExecuted}
                    onChange={(e) => setEditEndTimeExecuted(e.target.value)}
                    className="w-full rounded-lg border border-emerald-950/40 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2 text-white">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tags (separadas por vírgula)</label>
                  <input
                    type="text"
                    disabled={!canEditActivity(editingActivity)}
                    value={editTagsInput}
                    onChange={(e) => setEditTagsInput(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Excel, Banco, Limpeza"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Observações</label>
                  <textarea
                    disabled={!canEditActivity(editingActivity)}
                    value={editObservations}
                    onChange={(e) => setEditObservations(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none h-14 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Observações adicionais..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <div className="mr-auto flex gap-2">
                  {canEditActivity(editingActivity) && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (editingActivity) {
                          const targetStatus = editStatus === "arquivado" ? "pendente" : "arquivado";
                          setEditStatus(targetStatus);
                          await handleMoveStatus(editingActivity, targetStatus);
                          setIsEditActivityOpen(false);
                          setEditingActivity(null);
                        }
                      }}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition-all hover:bg-zinc-800 cursor-pointer flex items-center gap-1.5"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      {editStatus === "arquivado" ? "Desarquivar" : "Arquivar"}
                    </button>
                  )}
                  {hasPermission("activities", "create") && editingActivity && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (editingActivity) {
                          await handleDuplicateActivity(editingActivity);
                          setIsEditActivityOpen(false);
                          setEditingActivity(null);
                        }
                      }}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition-all hover:bg-zinc-800 cursor-pointer flex items-center gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Duplicar
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditActivityOpen(false);
                    setEditingActivity(null);
                  }}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-2.5 text-xs font-semibold text-zinc-450 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer"
                >
                  {canEditActivity(editingActivity) ? "Cancelar" : "Fechar"}
                </button>
                {canEditActivity(editingActivity) && (
                  <button
                    type="submit"
                    className="rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 transition-all cursor-pointer"
                  >
                    Salvar Alterações
                  </button>
                )}
              </div>
            </form>

            {/* Histórico de Lançamentos */}
            <div className="mt-8 pt-6 border-t border-zinc-800 space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-4 w-4 text-zinc-400" />
                Histórico de Lançamentos
              </h3>

              {isLoadingLogs ? (
                <div className="text-xs text-zinc-500 py-2 animate-pulse">Carregando lançamentos...</div>
              ) : activityLogs.length === 0 ? (
                <div className="text-xs text-zinc-500 py-2 italic">Nenhum lançamento registrado para esta atividade.</div>
              ) : (
                <div className="space-y-3">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="rounded-lg bg-zinc-950 p-3 border border-zinc-800/60 space-y-1 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-zinc-200">{log.person_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-350 font-bold">
                            {log.hours}h
                          </span>
                          {(log.person_id === user?.uid || profile?.role === "admin" || profile?.role === "gestor") && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTimeLog(log)}
                              className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-900 transition-colors cursor-pointer flex items-center justify-center"
                              title="Excluir lançamento"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {log.log_date && (
                        <div className="text-[10px] text-zinc-500">
                          Data do lançamento: {log.log_date}
                        </div>
                      )}
                      {log.description && (
                        <p className="text-zinc-400 leading-relaxed break-words">{log.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSV IMPORT RESULT MODAL */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setImportResult(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <AlertCircle className={`h-5 w-5 ${importResult.errors.length > 0 ? "text-amber-500" : "text-emerald-400"}`} />
              Resultado da Importação
            </h3>
            
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg p-3 text-center">
                <span className="block text-xs font-semibold text-zinc-400">Total</span>
                <span className="text-lg font-bold text-white">{importResult.total}</span>
              </div>
              <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-3 text-center">
                <span className="block text-xs font-semibold text-emerald-400">Sucessos</span>
                <span className="text-lg font-bold text-emerald-400">{importResult.successCount}</span>
              </div>
              <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3 text-center">
                <span className="block text-xs font-semibold text-red-400">Erros</span>
                <span className="text-lg font-bold text-red-400">{importResult.errors.length}</span>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="mb-6 space-y-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Linhas com erro (Título ausente):</span>
                <div className="max-h-32 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-750">
                  <p className="mb-1 text-zinc-550 leading-relaxed">As seguintes linhas foram ignoradas por não conterem um título válido na planilha:</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {importResult.errors.map((line) => (
                      <span key={line} className="px-2 py-0.5 rounded bg-red-950/40 border border-red-900/30 text-red-400 font-semibold font-mono text-[10px]">
                        Linha {line}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="w-full sm:w-auto rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 transition-all cursor-pointer text-center"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
