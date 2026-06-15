"use client";

import React, { useEffect, useState } from "react";
import { db, auth } from "@/lib/firebase/client";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuthContext } from "@/context/AuthContext";
import { RolePermissions, ModulePermissions } from "@/types";
import { DEFAULT_PERMISSIONS } from "@/constants/permissions";
import { 
  Shield, 
  Save, 
  Lock, 
  Check, 
  AlertCircle, 
  Info,
  RefreshCw,
  FolderKanban,
  KanbanSquare,
  CalendarClock,
  Users,
  ShieldCheck,
  Sliders
} from "lucide-react";

const MODULES_INFO = [
  { key: "projects" as keyof RolePermissions, name: "Projetos", icon: FolderKanban, description: "Gestão de projetos operacionais e estratégicos" },
  { key: "activities" as keyof RolePermissions, name: "Atividades", icon: KanbanSquare, description: "Lançamento de atividades diárias da equipe" },
  { key: "routines" as keyof RolePermissions, name: "Rotinas", icon: CalendarClock, description: "Configuração de rotinas recorrentes de trabalho" },
  { key: "users" as keyof RolePermissions, name: "Usuários", icon: Users, description: "Visualização e pré-cadastro de usuários do sistema" },
  { key: "permissions" as keyof RolePermissions, name: "Permissões", icon: ShieldCheck, description: "Configuração de permissões de papéis" },
  { key: "registrations" as keyof RolePermissions, name: "Cadastros", icon: Sliders, description: "Gestão de tabelas auxiliares e cadastros do sistema" }
];

const ROLES_INFO = [
  { key: "admin" as const, name: "Administrador", description: "Acesso total irrestrito a todos os módulos" },
  { key: "gestor" as const, name: "Gestor", description: "Gerencia projetos e equipes do NGD" },
  { key: "colaborador" as const, name: "Colaborador", description: "Criação e edição de dados operacionais próprios" },
  { key: "visualizador" as const, name: "Visualizador", description: "Apenas visualização e acompanhamento" }
];

export default function PermissionsPage() {
  const { profile } = useAuthContext();
  const [selectedRole, setSelectedRole] = useState<"admin" | "gestor" | "colaborador" | "visualizador">("colaborador");
  const [permissionsState, setPermissionsState] = useState<Record<"admin" | "gestor" | "colaborador" | "visualizador", RolePermissions>>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Carrega permissões do Firestore
  useEffect(() => {
    const loadAllPermissions = async () => {
      if (!profile || !auth.currentUser) return;
      setLoading(true);
      try {
        const loaded: Record<"admin" | "gestor" | "colaborador" | "visualizador", RolePermissions> = { ...DEFAULT_PERMISSIONS };
        
        for (const roleInfo of ROLES_INFO) {
          const docRef = doc(db, "permissions", roleInfo.key);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            loaded[roleInfo.key] = docSnap.data() as RolePermissions;
          }
        }
        setPermissionsState(loaded);
      } catch (err) {
        console.error("Erro ao carregar permissões:", err);
        showNotification("error", "Erro ao carregar permissões do banco de dados. Usando padrões.");
      } finally {
        setLoading(false);
      }
    };

    loadAllPermissions();
  }, [profile]);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Garante acesso apenas para Administradores
  if (profile?.role !== "admin") {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-center p-6 bg-zinc-950">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500 mb-4 border border-red-500/20">
          <Lock className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Acesso Restrito</h1>
        <p className="text-sm text-zinc-400 max-w-md">
          Esta página é restrita apenas a administradores do sistema Acauã. Se você acredita que isso é um erro, entre em contato com o suporte do NGD.
        </p>
      </div>
    );
  }

  const handleCheckboxChange = (
    moduleKey: keyof RolePermissions,
    actionKey: keyof ModulePermissions
  ) => {
    // Não permite alterar as permissões do Administrador (sempre true)
    if (selectedRole === "admin") return;

    setPermissionsState(prev => {
      const rolePerms = { ...prev[selectedRole] };
      const modulePerms = { ...rolePerms[moduleKey] };
      modulePerms[actionKey] = !modulePerms[actionKey];
      
      return {
        ...prev,
        [selectedRole]: {
          ...rolePerms,
          [moduleKey]: modulePerms
        }
      };
    });
  };

  const savePermissions = async () => {
    if (selectedRole === "admin") {
      showNotification("error", "As permissões de Administrador são fixas para garantir a segurança.");
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, "permissions", selectedRole);
      await setDoc(docRef, permissionsState[selectedRole]);
      showNotification("success", `Permissões do papel ${selectedRole.toUpperCase()} salvas com sucesso.`);
    } catch (err) {
      console.error("Erro ao salvar permissões:", err);
      showNotification("error", "Falha ao salvar as permissões no Firestore.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (selectedRole === "admin") return;
    setPermissionsState(prev => ({
      ...prev,
      [selectedRole]: DEFAULT_PERMISSIONS[selectedRole]
    }));
    showNotification("success", `Permissões restauradas para o padrão do papel ${selectedRole}. Lembre-se de salvar!`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <Shield className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Configuração do Sistema</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight sm:text-3xl">Permissões de Acesso</h1>
          <p className="text-sm text-zinc-400">
            Configure de forma visual as permissões de consultar, criar, alterar e excluir para cada papel.
          </p>
        </div>

        {selectedRole !== "admin" && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleResetToDefault}
              disabled={loading || saving}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Restaurar Padrão
            </button>
            <button
              onClick={savePermissions}
              disabled={loading || saving}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-xs font-semibold text-zinc-950 transition shadow-lg shadow-emerald-500/10 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent"></div>
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Salvar Alterações
            </button>
          </div>
        )}
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`flex items-center gap-3 rounded-lg border p-4 text-sm transition-all duration-300 ${
          notification.type === "success" 
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
            : "bg-red-500/10 text-red-400 border-red-500/20"
        }`}>
          {notification.type === "success" ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Role Selection Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {ROLES_INFO.map((roleInfo) => {
          const isActive = selectedRole === roleInfo.key;
          return (
            <button
              key={roleInfo.key}
              onClick={() => setSelectedRole(roleInfo.key)}
              className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border transition-all text-left cursor-pointer ${
                isActive
                  ? "bg-zinc-900 border-emerald-500/40 shadow-md shadow-emerald-500/5 text-white"
                  : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-semibold text-sm tracking-wide">
                  {roleInfo.name}
                </span>
                {roleInfo.key === "admin" && (
                  <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.2 rounded font-mono uppercase">
                    Fixo
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-500 line-clamp-1">
                {roleInfo.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Permissions Matrix */}
      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-emerald-500"></div>
          <p className="mt-4 text-xs font-semibold text-zinc-500 uppercase tracking-widest">
            Carregando matriz de permissões...
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md overflow-hidden">
          {selectedRole === "admin" && (
            <div className="flex items-center gap-2 bg-red-500/5 border-b border-zinc-800/80 px-6 py-3 text-xs text-red-400/90 font-medium">
              <Info className="h-4 w-4 shrink-0 text-red-400" />
              <span>O papel de Administrador possui permissão total e irrestrita como garantia de segurança para o sistema.</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider w-2/5">Módulo / Rotina</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center">Consultar</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center">Criar</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center">Alterar</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center">Excluir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {MODULES_INFO.map((mod) => {
                  const modPerms = permissionsState[selectedRole][mod.key] || { create: false, read: false, update: false, delete: false };
                  const Icon = mod.icon;

                  return (
                    <tr key={mod.key} className="hover:bg-zinc-900/20 transition-all">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-sm text-white">{mod.name}</span>
                            <p className="text-[11px] text-zinc-500">{mod.description}</p>
                          </div>
                        </div>
                      </td>

                      {/* Read Checkbox */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center">
                          <label className="relative flex items-center justify-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={modPerms.read}
                              disabled={selectedRole === "admin" || saving}
                              onChange={() => handleCheckboxChange(mod.key, "read")}
                              className="sr-only peer"
                            />
                            <div className="h-5 w-5 rounded border border-zinc-700 bg-zinc-900/60 transition-all peer-checked:bg-emerald-500 peer-checked:border-emerald-500 peer-disabled:opacity-40 flex items-center justify-center">
                              {modPerms.read && <Check className="h-3.5 w-3.5 text-zinc-950 stroke-[3]" />}
                            </div>
                          </label>
                        </div>
                      </td>

                      {/* Create Checkbox */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center">
                          <label className="relative flex items-center justify-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={modPerms.create}
                              disabled={selectedRole === "admin" || saving}
                              onChange={() => handleCheckboxChange(mod.key, "create")}
                              className="sr-only peer"
                            />
                            <div className="h-5 w-5 rounded border border-zinc-700 bg-zinc-900/60 transition-all peer-checked:bg-emerald-500 peer-checked:border-emerald-500 peer-disabled:opacity-40 flex items-center justify-center">
                              {modPerms.create && <Check className="h-3.5 w-3.5 text-zinc-950 stroke-[3]" />}
                            </div>
                          </label>
                        </div>
                      </td>

                      {/* Update Checkbox */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center">
                          <label className="relative flex items-center justify-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={modPerms.update}
                              disabled={selectedRole === "admin" || saving}
                              onChange={() => handleCheckboxChange(mod.key, "update")}
                              className="sr-only peer"
                            />
                            <div className="h-5 w-5 rounded border border-zinc-700 bg-zinc-900/60 transition-all peer-checked:bg-emerald-500 peer-checked:border-emerald-500 peer-disabled:opacity-40 flex items-center justify-center">
                              {modPerms.update && <Check className="h-3.5 w-3.5 text-zinc-950 stroke-[3]" />}
                            </div>
                          </label>
                        </div>
                      </td>

                      {/* Delete Checkbox */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center">
                          <label className="relative flex items-center justify-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={modPerms.delete}
                              disabled={selectedRole === "admin" || saving}
                              onChange={() => handleCheckboxChange(mod.key, "delete")}
                              className="sr-only peer"
                            />
                            <div className="h-5 w-5 rounded border border-zinc-700 bg-zinc-900/60 transition-all peer-checked:bg-emerald-500 peer-checked:border-emerald-500 peer-disabled:opacity-40 flex items-center justify-center">
                              {modPerms.delete && <Check className="h-3.5 w-3.5 text-zinc-950 stroke-[3]" />}
                            </div>
                          </label>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
