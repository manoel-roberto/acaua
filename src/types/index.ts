export interface UserProfile {
  id?: string;
  full_name: string;
  email: string;
  cargo: string;
  funcao: string;
  setor: string;
  carga_horaria: number;
  avatar_url: string;
  role: "admin" | "analista" | "cliente";
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  profile_id: string;
  full_name: string;
  role_in_project: "responsavel" | "colaborador" | "observador";
  allocated_hours: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: "planejamento" | "em_andamento" | "pausado" | "bloqueado" | "concluido" | "cancelado" | "arquivado";
  category: string;
  priority: "baixa" | "media" | "alta" | "critica";
  progress: number;
  start_date: string;
  end_date: string | null;
  deadline: string;
  codigo_processo_sei: string;
  numero_sei?: string;
  origem_demanda: string;
  estimated_hours: number;
  executed_hours: number;
  observations: string;
  tags: string[];
  archived: boolean;
  responsible_id: string;
  responsible_name: string; // Desnormalizado
  members: ProjectMember[]; // Desnormalizado
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  responsible_id: string;
  responsible_name: string; // Desnormalizado
  project_id: string | null;
  project_name: string | null; // Desnormalizado
  routine_id?: string | null;
  type: string;
  status: "pendente" | "em_andamento" | "concluida" | "cancelada" | "bloqueada" | "arquivado";
  priority: "baixa" | "media" | "alta" | "critica";
  activity_date: string;
  start_time_planned?: string;
  end_time_planned?: string;
  start_time_executed?: string;
  end_time_executed?: string;
  hours_planned: number;
  hours_executed: number;
  observations: string;
  tags: string[];
  archived?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TimeLog {
  id: string;
  person_id: string;
  person_name: string; // Desnormalizado
  activity_id: string | null;
  activity_title: string | null; // Desnormalizado
  project_id: string | null;
  project_name: string | null; // Desnormalizado
  log_date: string;
  hours: number;
  description: string;
  is_overtime: boolean;
  created_at: string;
}

export interface GlobalMetrics {
  projects_active: number;
  projects_done: number;
  projects_paused: number;
  projects_blocked: number;
  avg_progress: number;
  total_hours_month: number;
  expected_hours_month: number;
  productivity_pct: number;
  idleness_pct: number;
  archive_days_limit?: number;
  last_updated: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  action: "INSERT" | "UPDATE_STATUS" | "DELETE";
  table_name: "projects" | "activities";
  record_id: string;
  old_status: string;
  new_status: string;
  created_at: string;
}

export interface RecurringRoutine {
  id: string;
  title: string;
  description: string;
  project_id: string | null;
  project_name: string | null;
  type: "rotina" | "projeto" | "planejamento" | "capacitacao" | "reuniao" | "atendimento" | "suporte";
  priority: "baixa" | "media" | "alta" | "critica";
  start_time_planned?: string;
  end_time_planned?: string;
  hours_planned: number;
  observations: string;
  tags: string[];
  frequency: "hora" | "dia" | "semana" | "mes" | "ano";
  interval: number;
  week_days: number[]; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  active: boolean;
  last_run: string | null;
  next_run: string; // YYYY-MM-DD
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ModulePermissions {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

export interface RolePermissions {
  projects: ModulePermissions;
  activities: ModulePermissions;
  routines: ModulePermissions;
  users: ModulePermissions;
  permissions: ModulePermissions;
  registrations: ModulePermissions;
}

export interface Sector {
  id: string;
  name: string;
  created_at: string;
}

export interface ActivityType {
  id: string;
  name: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  created_at: string;
}
