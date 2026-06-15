"use client";

import React, { useEffect, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { auth } from "@/lib/firebase/client";
import { 
  getProfiles, 
  createPreProfile, 
  updateProfile, 
  deleteProfile 
} from "@/services/profiles";
import { UserProfile, Sector } from "@/types";
import { getSectors } from "@/services/registrations";
import { 
  Users, 
  UserPlus, 
  Search, 
  Loader2, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  UserCog, 
  AlertCircle,
  Lock,
  Filter
} from "lucide-react";

export default function UsersPage() {
  const { profile: currentUserProfile, hasPermission, permissions } = useAuthContext();
  const [profiles, setProfiles] = useState<(UserProfile & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filterText, setFilterText] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterSector, setFilterSector] = useState("");
  const [filterCargo, setFilterCargo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modais e Estados de Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<(UserProfile & { id: string }) | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "gestor" | "colaborador" | "visualizador">("colaborador");
  const [cargo, setCargo] = useState("");
  const [funcao, setFuncao] = useState("");
  const [setor, setSetor] = useState("");
  const [cargaHoraria, setCargaHoraria] = useState(40);
  const [availableSectors, setAvailableSectors] = useState<Sector[]>([]);

  // Carrega os setores dinamicamente do banco de dados
  useEffect(() => {
    if (!auth.currentUser) return;
    const fetchSectors = async () => {
      try {
        const data = await getSectors();
        setAvailableSectors(data);
      } catch (err) {
        console.error("Erro ao carregar setores para dropdown:", err);
      }
    };
    fetchSectors();
  }, [currentUserProfile]);

  const fetchProfiles = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProfiles();
      setProfiles(data);
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
      setError("Não foi possível carregar a lista de usuários.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission("users", "read")) {
      fetchProfiles();
    }
  }, [currentUserProfile, permissions]);

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setRole("colaborador");
    setCargo("");
    setFuncao("");
    setSetor("");
    setCargaHoraria(40);
    setEditingProfile(null);
  };

  const handleEditClick = (prof: UserProfile & { id: string }) => {
    setEditingProfile(prof);
    setFullName(prof.full_name);
    setEmail(prof.email);
    setRole(prof.role);
    setCargo(prof.cargo);
    setFuncao(prof.funcao);
    setSetor(prof.setor);
    setCargaHoraria(prof.carga_horaria);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email) {
      alert("Por favor, preencha o Nome e o E-mail.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingProfile) {
        // Atualiza perfil existente
        await updateProfile(editingProfile.id, {
          full_name: fullName,
          role,
          cargo,
          funcao,
          setor,
          carga_horaria: Number(cargaHoraria)
        });
      } else {
        // Cria pré-cadastro
        await createPreProfile(email, {
          full_name: fullName,
          role,
          cargo,
          funcao,
          setor,
          carga_horaria: Number(cargaHoraria),
          active: true
        });
      }
      setIsModalOpen(false);
      resetForm();
      await fetchProfiles();
    } catch (err) {
      console.error("Erro ao salvar usuário:", err);
      alert("Ocorreu um erro ao salvar o usuário.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (id === currentUserProfile?.email || id === currentUserProfile?.role) {
      alert("Você não pode excluir o seu próprio perfil.");
      return;
    }

    if (confirm(`Tem certeza de que deseja remover o acesso do usuário "${name}"?`)) {
      try {
        await deleteProfile(id);
        await fetchProfiles();
      } catch (err) {
        console.error("Erro ao deletar perfil:", err);
        alert("Erro ao remover usuário.");
      }
    }
  };

  // Se não tiver permissão de leitura de usuários, exibe tela de acesso negado
  if (!hasPermission("users", "read")) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
        <Lock className="h-16 w-16 text-red-500 animate-pulse" />
        <h2 className="text-xl font-bold text-white">Acesso Negado</h2>
        <p className="text-sm text-zinc-400 max-w-md">
          Você não tem permissão para visualizar a página de Usuários.
        </p>
      </div>
    );
  }

  // Filtragem local
  const filteredProfiles = profiles.filter((prof) => {
    const matchesText = 
      prof.full_name.toLowerCase().includes(filterText.toLowerCase()) ||
      prof.email.toLowerCase().includes(filterText.toLowerCase()) ||
      (prof.cargo && prof.cargo.toLowerCase().includes(filterText.toLowerCase())) ||
      (prof.setor && prof.setor.toLowerCase().includes(filterText.toLowerCase()));

    const matchesRole = filterRole ? prof.role === filterRole : true;
    const matchesSector = filterSector ? prof.setor === filterSector : true;
    const matchesCargo = filterCargo ? prof.cargo === filterCargo : true;

    let matchesStatus = true;
    if (filterStatus) {
      const activeVal = filterStatus === "ativo";
      matchesStatus = prof.active === activeVal;
    }

    return matchesText && matchesRole && matchesSector && matchesCargo && matchesStatus;
  });

  const getRoleLabel = (r: string) => {
    switch (r) {
      case "admin": return "Administrador";
      case "gestor": return "Gestor";
      case "colaborador": return "Colaborador";
      case "visualizador": return "Visualizador";
      default: return r;
    }
  };

  const getRoleColor = (r: string) => {
    switch (r) {
      case "admin": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "gestor": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "colaborador": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "visualizador": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      default: return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  const allUniqueCargos = Array.from(
    new Set(profiles.map((p) => p.cargo).filter(Boolean))
  ).sort();

  const hasActiveFilters = 
    filterRole !== "" ||
    filterSector !== "" ||
    filterCargo !== "" ||
    filterStatus !== "";

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/60 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <UserCog className="h-8 w-8 text-emerald-400" />
            Gerenciamento de Usuários
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-xl">
            Gerencie os perfis de acesso do sistema, mude papéis e pré-cadastre novos analistas ou clientes para primeiro login.
          </p>
        </div>
        {hasPermission("users", "create") && (
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-450 hover:to-teal-550 text-xs font-bold text-white px-5 py-3 transition-all duration-200 shadow-lg shadow-emerald-950/20 hover:scale-[1.02] cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Pré-cadastrar Usuário
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
              placeholder="Buscar por nome, e-mail, cargo, setor..."
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
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 rounded-xl border border-zinc-850/80 bg-zinc-900/10 p-4 backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
            {/* Filtrar por Papel */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Papel de Acesso</label>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todos os Papéis</option>
                <option value="admin" className="bg-zinc-950">Administrador</option>
                <option value="gestor" className="bg-zinc-950">Gestor</option>
                <option value="colaborador" className="bg-zinc-950">Colaborador</option>
                <option value="visualizador" className="bg-zinc-950">Visualizador</option>
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Setor */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Setor</label>
              <select
                value={filterSector}
                onChange={(e) => setFilterSector(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todos os Setores</option>
                {availableSectors.map((s) => (
                  <option key={s.id} value={s.name} className="bg-zinc-950">{s.name}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>

            {/* Filtrar por Cargo */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Cargo</label>
              <select
                value={filterCargo}
                onChange={(e) => setFilterCargo(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-300 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-950">Todos os Cargos</option>
                {allUniqueCargos.map((cargo) => (
                  <option key={cargo} value={cargo} className="bg-zinc-950">{cargo}</option>
                ))}
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
                <option value="ativo" className="bg-zinc-950">Ativos</option>
                <option value="inativo" className="bg-zinc-950">Inativos</option>
              </select>
              <div className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-zinc-550">▼</div>
            </div>
          </div>
        )}

        {/* Badges de Filtros Ativos */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-in fade-in duration-200">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mr-1">Filtros ativos:</span>
            
            {filterRole && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Papel: {getRoleLabel(filterRole)}</span>
                <button onClick={() => setFilterRole("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterSector && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Setor: {filterSector}</span>
                <button onClick={() => setFilterSector("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterCargo && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Cargo: {filterCargo}</span>
                <button onClick={() => setFilterCargo("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            {filterStatus && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2.5 py-1">
                <span>Status: {filterStatus === "ativo" ? "Ativo" : "Inativo"}</span>
                <button onClick={() => setFilterStatus("")} className="hover:text-red-400 font-bold ml-0.5 text-[10px]">✕</button>
              </span>
            )}

            <button
              onClick={() => {
                setFilterRole("");
                setFilterSector("");
                setFilterCargo("");
                setFilterStatus("");
              }}
              className="text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors uppercase tracking-wider ml-1"
            >
              Limpar Todos
            </button>
          </div>
        )}
      </div>

      {/* Lista de Usuários */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 text-emerald-450 animate-spin" />
          <p className="text-sm font-semibold text-zinc-500">Carregando usuários...</p>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="py-20 border border-dashed border-zinc-850 rounded-2xl flex flex-col items-center justify-center text-center">
          <div className="h-14 w-14 rounded-full bg-zinc-900/50 flex items-center justify-center border border-zinc-800 mb-4">
            <Users className="h-7 w-7 text-zinc-550" />
          </div>
          <h3 className="text-base font-bold text-white">Nenhum usuário encontrado</h3>
          <p className="text-xs text-zinc-500 mt-1">Experimente alterar os filtros de busca.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-850 bg-zinc-900/10 backdrop-blur-md">
          <table className="w-full border-collapse text-left text-xs text-zinc-300">
            <thead className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Nome / E-mail</th>
                <th className="px-6 py-4">Cargo / Setor</th>
                <th className="px-6 py-4">Papel</th>
                <th className="px-6 py-4">Carga Horária</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850">
              {filteredProfiles.map((prof) => (
                <tr key={prof.id} className="hover:bg-zinc-900/30 transition-all duration-150">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {prof.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={prof.avatar_url} 
                          alt={prof.full_name} 
                          className="h-8 w-8 rounded-full border border-zinc-800 object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full border border-zinc-850 bg-zinc-900 flex items-center justify-center text-zinc-550 font-bold uppercase">
                          {prof.full_name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-white">{prof.full_name}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{prof.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-zinc-300">{prof.cargo || "Não Informado"}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{prof.setor || "Sem Setor"}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block text-[9px] font-mono px-2 py-0.5 rounded-full border ${getRoleColor(prof.role)}`}>
                      {getRoleLabel(prof.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-zinc-400">
                    {prof.carga_horaria}h / sem
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      prof.active 
                        ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20" 
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}>
                      {prof.active ? (
                        <>
                          <Check className="h-3 w-3" /> Ativo
                        </>
                      ) : (
                        <>
                          <X className="h-3 w-3" /> Inativo
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {hasPermission("users", "update") && (
                        <button
                          onClick={() => handleEditClick(prof)}
                          className="p-2 rounded-lg border border-zinc-800 bg-zinc-950/20 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all cursor-pointer"
                          title="Editar perfil"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {hasPermission("users", "delete") && (
                        <button
                          onClick={() => handleDelete(prof.id, prof.full_name)}
                          className="p-2 rounded-lg border border-zinc-800 bg-zinc-950/20 text-zinc-500 hover:text-red-400 hover:border-red-500/20 transition-all cursor-pointer"
                          title="Remover usuário"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Cadastro / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-md animate-in zoom-in duration-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <UserCog className="h-5 w-5 text-emerald-400" />
              {editingProfile ? "Editar Perfil do Usuário" : "Pré-cadastrar Novo Usuário"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* E-mail (Somente leitura ao editar) */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">E-mail Corporativo (@uefs.br)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!!editingProfile}
                  placeholder="usuario@uefs.br"
                  className="w-full rounded-lg border border-zinc-850 bg-zinc-900/60 p-2.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  required
                />
              </div>

              {/* Nome Completo */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nome Completo</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome do usuário"
                  className="w-full rounded-lg border border-zinc-850 bg-zinc-900/60 p-2.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
                  required
                />
              </div>

              {/* Papel / Permissões */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Papel do Sistema (Role)</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full rounded-lg border border-zinc-850 bg-zinc-900/60 p-2.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer"
                >
                  <option value="admin" className="bg-zinc-950 text-white">Administrador (Acesso Total)</option>
                  <option value="gestor" className="bg-zinc-950 text-white">Gestor (Gerencia Projetos/Equipes)</option>
                  <option value="colaborador" className="bg-zinc-950 text-white">Colaborador (Executa Atividades)</option>
                  <option value="visualizador" className="bg-zinc-950 text-white">Visualizador (Somente Leitura)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Cargo */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cargo</label>
                  <input
                    type="text"
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    placeholder="Ex: Gestor de Dados"
                    className="w-full rounded-lg border border-zinc-850 bg-zinc-900/60 p-2.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>

                {/* Função */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Função</label>
                  <input
                    type="text"
                    value={funcao}
                    onChange={(e) => setFuncao(e.target.value)}
                    placeholder="Ex: Scrum Master"
                    className="w-full rounded-lg border border-zinc-850 bg-zinc-900/60 p-2.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Setor */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Setor</label>
                  <select
                    value={setor}
                    onChange={(e) => setSetor(e.target.value)}
                    className="w-full mt-1.5 rounded-lg border border-zinc-850 bg-zinc-900/60 p-2.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-zinc-950 text-zinc-500">Sem Setor / Selecione</option>
                    {availableSectors.map((s) => (
                      <option key={s.id} value={s.name} className="bg-zinc-950 text-white">
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Carga Horária */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Carga Horária (horas/sem)</label>
                  <input
                    type="number"
                    value={cargaHoraria}
                    onChange={(e) => setCargaHoraria(Number(e.target.value))}
                    min={0}
                    className="w-full rounded-lg border border-zinc-850 bg-zinc-900/60 p-2.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-zinc-850 bg-zinc-900/60 hover:bg-zinc-900 px-5 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-450 hover:to-teal-550 px-5 py-2.5 text-xs font-bold text-white transition-all shadow-md shadow-emerald-950/20 cursor-pointer disabled:opacity-50 animate-in fade-in"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      {editingProfile ? "Salvar Alterações" : "Cadastrar Usuário"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
