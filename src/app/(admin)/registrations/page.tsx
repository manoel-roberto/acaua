"use client";

import React, { useEffect, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { 
  getSectors, 
  createSector, 
  deleteSector,
  getActivityTypes, 
  createActivityType, 
  deleteActivityType,
  initializeDefaultActivityTypes,
  getCategories, 
  createCategory, 
  deleteCategory,
  initializeDefaultCategories,
  cleanDuplicateRegistrations
} from "@/services/registrations";
import { Sector, ActivityType, Category } from "@/types";
import { 
  Sliders, 
  Building2, 
  ListTodo, 
  Tags, 
  Plus, 
  Trash2, 
  Loader2, 
  AlertTriangle, 
  Lock, 
  CheckCircle,
  HelpCircle,
  Sparkles
} from "lucide-react";

type Tab = "setores" | "categorias" | "tipos";

export default function RegistrationsPage() {
  const { hasPermission } = useAuthContext();
  const [activeTab, setActiveTab] = useState<Tab>("setores");
  
  // Estados de dados
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<ActivityType[]>([]);
  
  // Estados de carregamento
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  
  // Estados dos formulários
  const [newItemName, setNewItemName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inicialização e Carga Inicial de Dados
  useEffect(() => {
    if (!hasPermission("registrations", "read")) return;

    const loadData = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        setInitializing(true);
        // Inicializa dados padrões se as coleções estiverem vazias
        await Promise.all([
          initializeDefaultActivityTypes(),
          initializeDefaultCategories()
        ]);
        setInitializing(false);

        // Carrega dados
        const [sectorsData, categoriesData, typesData] = await Promise.all([
          getSectors(),
          getCategories(),
          getActivityTypes()
        ]);

        setSectors(sectorsData);
        setCategories(categoriesData);
        setTypes(typesData);
      } catch (err: any) {
        console.error("Erro ao carregar cadastros:", err);
        setErrorMsg("Não foi possível carregar os dados dos cadastros.");
      } finally {
        setLoading(false);
        setInitializing(false);
      }
    };

    loadData();
  }, [hasPermission]);

  // Limpa mensagens temporárias
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Se não tiver permissão de leitura, exibe tela de acesso negado
  if (!hasPermission("registrations", "read")) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
        <Lock className="h-16 w-16 text-red-500 animate-pulse" />
        <h2 className="text-xl font-bold text-white">Acesso Negado</h2>
        <p className="text-sm text-zinc-400 max-w-md">
          Você não tem permissão para visualizar o módulo de Cadastros Básicos.
        </p>
      </div>
    );
  }

  // Ações de criação
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    if (!hasPermission("registrations", "create")) {
      setErrorMsg("Você não tem permissão para criar novos cadastros.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (activeTab === "setores") {
        const created = await createSector(newItemName);
        setSectors((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setSuccessMsg(`Setor "${created.name}" adicionado com sucesso!`);
      } else if (activeTab === "categorias") {
        const created = await createCategory(newItemName);
        setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setSuccessMsg(`Categoria "${created.name}" adicionada com sucesso!`);
      } else if (activeTab === "tipos") {
        const created = await createActivityType(newItemName);
        setTypes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setSuccessMsg(`Tipo de Atividade "${created.name}" adicionado com sucesso!`);
      }
      setNewItemName("");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Ocorreu um erro ao salvar o registro.");
    } finally {
      setSubmitting(false);
    }
  };

  // Ações de exclusão
  const handleDelete = async (id: string, name: string, key?: string) => {
    if (!hasPermission("registrations", "delete")) {
      setErrorMsg("Você não tem permissão para excluir cadastros.");
      return;
    }

    if (!confirm(`Tem certeza de que deseja excluir o cadastro "${name}"?`)) {
      return;
    }

    setErrorMsg(null);
    try {
      if (activeTab === "setores") {
        await deleteSector(id, name);
        setSectors((prev) => prev.filter((item) => item.id !== id));
        setSuccessMsg(`Setor "${name}" excluído com sucesso!`);
      } else if (activeTab === "categorias") {
        await deleteCategory(id, key || "", name);
        setCategories((prev) => prev.filter((item) => item.id !== id));
        setSuccessMsg(`Categoria "${name}" excluída com sucesso!`);
      } else if (activeTab === "tipos") {
        await deleteActivityType(id, key || "", name);
        setTypes((prev) => prev.filter((item) => item.id !== id));
        setSuccessMsg(`Tipo de Atividade "${name}" excluído com sucesso!`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Erro ao excluir o registro.");
    }
  };
  
  // Ação de limpeza de duplicados
  const handleCleanDuplicates = async () => {
    if (!hasPermission("registrations", "delete")) {
      setErrorMsg("Você não tem permissão para remover cadastros.");
      return;
    }

    if (!confirm("Deseja realmente remover os registros duplicados de setores, categorias e tipos de atividades no banco? Esta operação é irreversível.")) {
      return;
    }

    setCleaning(true);
    setErrorMsg(null);
    try {
      const res = await cleanDuplicateRegistrations();
      const total = res.sectorsRemoved + res.categoriesRemoved + res.typesRemoved;
      
      if (total > 0) {
        setSuccessMsg(`Limpeza concluída! Removidos: ${res.sectorsRemoved} setores, ${res.categoriesRemoved} categorias e ${res.typesRemoved} tipos duplicados.`);
        
        // Atualiza os estados locais
        const [sectorsData, categoriesData, typesData] = await Promise.all([
          getSectors(),
          getCategories(),
          getActivityTypes()
        ]);
        setSectors(sectorsData);
        setCategories(categoriesData);
        setTypes(typesData);
      } else {
        setSuccessMsg("Nenhum registro duplicado foi encontrado no banco de dados.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Ocorreu um erro durante a limpeza dos duplicados.");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/60 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Sliders className="h-8 w-8 text-emerald-450" />
            Cadastros Auxiliares
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-xl">
            Gerencie os setores organizacionais, as categorias de projetos e os tipos de atividades que alimentam os fluxos do sistema.
          </p>
        </div>
        {hasPermission("registrations", "delete") && (
          <button
            onClick={handleCleanDuplicates}
            disabled={cleaning}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 hover:border-zinc-700 text-xs font-bold text-white px-4 py-2.5 transition-all cursor-pointer disabled:opacity-50"
            title="Remover registros duplicados por nome/chave normalizada"
          >
            {cleaning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-emerald-450" />
                Limpando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-emerald-450" />
                Remover Duplicados
              </>
            )}
          </button>
        )}
      </div>

      {/* Alertas Flutuantes de Feedback */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-semibold animate-in slide-in-from-top duration-250">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-semibold animate-in slide-in-from-top duration-250">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-red-300 block mb-0.5">Operação Impedida:</span>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => {
            setActiveTab("setores");
            setNewItemName("");
            setErrorMsg(null);
          }}
          className={`flex items-center gap-2 px-6 py-3.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === "setores"
              ? "border-emerald-500 text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Setores
        </button>
        <button
          onClick={() => {
            setActiveTab("categorias");
            setNewItemName("");
            setErrorMsg(null);
          }}
          className={`flex items-center gap-2 px-6 py-3.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === "categorias"
              ? "border-emerald-500 text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Tags className="h-4 w-4" />
          Categorias de Projeto
        </button>
        <button
          onClick={() => {
            setActiveTab("tipos");
            setNewItemName("");
            setErrorMsg(null);
          }}
          className={`flex items-center gap-2 px-6 py-3.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === "tipos"
              ? "border-emerald-500 text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <ListTodo className="h-4 w-4" />
          Tipos de Atividade
        </button>
      </div>

      {/* Layout Content */}
      <div className="grid gap-8 md:grid-cols-3">
        {/* Formulário de Cadastro Lateral */}
        <div className="md:col-span-1 rounded-2xl border border-zinc-850 bg-zinc-900/10 p-5 backdrop-blur-md self-start space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Plus className="h-4 w-4 text-emerald-450" />
              Adicionar Novo
            </h3>
            <p className="text-[11px] text-zinc-500 mt-1">
              {activeTab === "setores" && "Cadastre um setor único para vincular a usuários e projetos."}
              {activeTab === "categorias" && "Adicione uma categoria específica para classificar novos projetos."}
              {activeTab === "tipos" && "Insira um novo tipo de atividade de equipe para lançamentos e rotinas."}
            </p>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Nome do {activeTab === "setores" ? "Setor" : activeTab === "categorias" ? "Categoria" : "Tipo"}
              </label>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder={`Ex: ${
                  activeTab === "setores" ? "Recursos Humanos" : activeTab === "categorias" ? "Integração" : "Treinamento"
                }`}
                disabled={submitting}
                className="w-full mt-1.5 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 text-xs text-white placeholder-zinc-500 focus:border-zinc-700 focus:bg-zinc-950/80 focus:outline-none transition-all"
                required
              />
            </div>

            {hasPermission("registrations", "create") ? (
              <button
                type="submit"
                disabled={submitting || !newItemName.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-450 hover:to-teal-550 text-xs font-bold text-white py-2.5 transition-all shadow-md shadow-emerald-950/20 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Adicionar Registro
                  </>
                )}
              </button>
            ) : (
              <p className="text-[10px] text-yellow-500/80 italic font-medium text-center">
                Sem permissão para gravação.
              </p>
            )}
          </form>
        </div>

        {/* Lista de Registros */}
        <div className="md:col-span-2 space-y-4">
          {loading || initializing ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 text-emerald-450 animate-spin" />
              <p className="text-sm font-semibold text-zinc-500">
                {initializing ? "Inicializando dados padrão..." : "Carregando registros..."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-850 bg-zinc-900/10 backdrop-blur-md">
              <div className="p-4 border-b border-zinc-800 bg-zinc-950/30 flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Listagem de {activeTab === "setores" ? "Setores" : activeTab === "categorias" ? "Categorias" : "Tipos"}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  {activeTab === "setores" && `${sectors.length} itens`}
                  {activeTab === "categorias" && `${categories.length} itens`}
                  {activeTab === "tipos" && `${types.length} itens`}
                </span>
              </div>

              {/* Tabela de Itens */}
              <div className="divide-y divide-zinc-850 max-h-[500px] overflow-y-auto">
                {activeTab === "setores" && sectors.length === 0 && (
                  <div className="p-8 text-center text-zinc-500 text-xs">Nenhum setor cadastrado.</div>
                )}
                {activeTab === "categorias" && categories.length === 0 && (
                  <div className="p-8 text-center text-zinc-500 text-xs">Nenhuma categoria cadastrada.</div>
                )}
                {activeTab === "tipos" && types.length === 0 && (
                  <div className="p-8 text-center text-zinc-500 text-xs">Nenhum tipo de atividade cadastrado.</div>
                )}

                {activeTab === "setores" && sectors.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 hover:bg-zinc-900/30 transition-all">
                    <div>
                      <div className="text-xs font-bold text-white">{item.name}</div>
                      <div className="text-[9px] text-zinc-500 mt-0.5">Cadastrado em {new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    {hasPermission("registrations", "delete") && (
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer border border-transparent hover:border-red-500/20"
                        title="Excluir setor"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}

                {activeTab === "categorias" && categories.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-4 hover:bg-zinc-900/30 transition-all">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        {item.name}
                        <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                          {item.key}
                        </span>
                      </div>
                      <div className="text-[9px] text-zinc-500 mt-0.5">Cadastrado em {new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    {hasPermission("registrations", "delete") && (
                      <button
                        onClick={() => handleDelete(item.id, item.name, item.key)}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer border border-transparent hover:border-red-500/20"
                        title="Excluir categoria"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}

                {activeTab === "tipos" && types.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-4 hover:bg-zinc-900/30 transition-all">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        {item.name}
                        <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                          {item.key}
                        </span>
                      </div>
                      <div className="text-[9px] text-zinc-500 mt-0.5">Cadastrado em {new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    {hasPermission("registrations", "delete") && (
                      <button
                        onClick={() => handleDelete(item.id, item.name, item.key)}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer border border-transparent hover:border-red-500/20"
                        title="Excluir tipo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dica de Segurança */}
          <div className="flex gap-2.5 p-4 rounded-xl border border-zinc-850 bg-zinc-900/5 text-[11px] text-zinc-550">
            <HelpCircle className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <span className="font-bold text-zinc-400 block mb-0.5">Nota de Integridade:</span>
              Os cadastros de setores, categorias e tipos de atividades não podem ser excluídos se houver usuários, projetos, atividades ou rotinas ativas vinculadas a eles. Isso protege o histórico operacional e evita inconsistências nos painéis de relatórios.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
