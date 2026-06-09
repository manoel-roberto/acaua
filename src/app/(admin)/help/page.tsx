"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  Search, 
  Target, 
  Calculator, 
  TrendingUp, 
  AlertTriangle, 
  BookOpen, 
  ChevronRight, 
  CheckCircle,
  HelpCircle,
  FolderKanban
} from "lucide-react";
import { ALL_INDICATORS, Indicator, getIndicatorDocumentation } from "@/constants/indicators";

// Tradução de categorias para exibição amigável
const CATEGORY_LABELS: Record<string, string> = {
  prazo_e_entrega: "Prazo e Entrega",
  esforco_e_capacidade: "Esforço e Capacidade",
  eficiencia: "Eficiência",
  qualidade_e_operacoes: "Qualidade e Operações",
  auditoria_e_controle: "Auditoria e Controle",
};

// Cores e estilos baseados nas categorias dos indicadores
const CATEGORY_COLORS: Record<string, { badge: string; border: string; glow: string; text: string }> = {
  prazo_e_entrega: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    border: "hover:border-emerald-500/30",
    glow: "group-hover:shadow-[0_0_15px_rgba(16,185,129,0.07)]",
    text: "text-emerald-400",
  },
  esforco_e_capacidade: {
    badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    border: "hover:border-indigo-500/30",
    glow: "group-hover:shadow-[0_0_15px_rgba(99,102,241,0.07)]",
    text: "text-indigo-400",
  },
  eficiencia: {
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    border: "hover:border-amber-500/30",
    glow: "group-hover:shadow-[0_0_15px_rgba(245,158,11,0.07)]",
    text: "text-amber-400",
  },
  qualidade_e_operacoes: {
    badge: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    border: "hover:border-pink-500/30",
    glow: "group-hover:shadow-[0_0_15px_rgba(236,72,153,0.07)]",
    text: "text-pink-400",
  },
  auditoria_e_controle: {
    badge: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    border: "hover:border-sky-500/30",
    glow: "group-hover:shadow-[0_0_15px_rgba(14,165,233,0.07)]",
    text: "text-sky-400",
  },
};

export default function HelpPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  
  // Elementos ref para dar scroll dinâmico no indicador focado
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Efeito para tratar focos via query string (?id=...)
  const focusedId = searchParams.get("id");

  useEffect(() => {
    document.title = "Glossário de Indicadores | Acauã";
  }, []);

  useEffect(() => {
    if (focusedId) {
      const indicator = ALL_INDICATORS.find(ind => ind.id === focusedId);
      if (indicator) {
        setSelectedCategory("all"); // Garante que a categoria não oculte o item
        setSearchTerm("");          // Reseta a busca para não ocultar o item
        
        // Pequeno timeout para garantir que o render ocorreu antes de rolar a página
        setTimeout(() => {
          const element = cardRefs.current[focusedId];
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("ring-2", "ring-emerald-500/50", "bg-zinc-900/90");
            setTimeout(() => {
              element.classList.remove("ring-2", "ring-emerald-500/50", "bg-zinc-900/90");
            }, 3000); // Remove o highlight após 3 segundos
          }
        }, 300);
      }
    }
  }, [focusedId]);

  // Filtragem dos indicadores
  const filteredIndicators = useMemo(() => {
    return ALL_INDICATORS.filter((ind) => {
      const matchesSearch = 
        ind.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ind.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ind.id.toLowerCase().includes(searchTerm.toLowerCase());
        
      const matchesCategory = selectedCategory === "all" || ind.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  return (
    <div className="w-full space-y-8 animate-fade-in pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/60 pb-6">
        <div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1.5">
            <BookOpen className="h-4 w-4 text-emerald-400" />
            <span>Documentação de Apoio</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-zinc-500">Ajuda e Glossário</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Glossário de Indicadores
          </h1>
          <p className="text-zinc-400 text-sm mt-1 max-w-2xl">
            Compreenda os objetivos, a lógica de cálculo, as metas ideais de benchmark e como realizar diagnósticos operacionais de todos os indicadores estratégicos da plataforma.
          </p>
        </div>
        {focusedId && (
          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedCategory("all");
              router.push("/help");
            }}
            className="self-start md:self-auto px-4 py-2 text-xs font-semibold bg-zinc-900 border border-zinc-850 hover:bg-zinc-850 hover:text-white rounded-lg text-zinc-400 transition-all cursor-pointer"
          >
            Limpar Foco e Ver Todos
          </button>
        )}
      </div>

      {/* Busca e Filtros */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Barra de Pesquisa */}
        <div className="lg:col-span-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Pesquisar por indicador, ID ou lógica..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-zinc-800/80 rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            id="search-indicator-input"
          />
        </div>

        {/* Filtro por Categoria */}
        <div className="lg:col-span-8 flex flex-wrap gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === "all"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                : "bg-zinc-900/20 border-zinc-850 text-zinc-400 hover:text-white hover:bg-zinc-900/60"
            }`}
          >
            Todos
          </button>
          {Object.entries(CATEGORY_LABELS).map(([catKey, label]) => {
            const isSelected = selectedCategory === catKey;
            return (
              <button
                key={catKey}
                onClick={() => setSelectedCategory(catKey)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? CATEGORY_COLORS[catKey].badge + " shadow-[0_0_15px_rgba(99,102,241,0.05)]"
                    : "bg-zinc-900/20 border-zinc-850 text-zinc-400 hover:text-white hover:bg-zinc-900/60"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de Cards de Indicadores */}
      {filteredIndicators.length > 0 ? (
        <div className="space-y-6">
          {filteredIndicators.map((indicator) => {
            const colors = CATEGORY_COLORS[indicator.category] || {
              badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
              border: "hover:border-zinc-800",
              glow: "",
              text: "text-zinc-400",
            };
            const docData = getIndicatorDocumentation(indicator);
            const isFocodo = focusedId === indicator.id;

            return (
              <div
                key={indicator.id}
                ref={(el) => { cardRefs.current[indicator.id] = el; }}
                className={`group border rounded-2xl bg-zinc-900/20 backdrop-blur-md transition-all duration-300 ${
                  isFocodo
                    ? "border-emerald-500/40 bg-zinc-900/60 shadow-[0_0_30px_rgba(16,185,129,0.08)]"
                    : `border-zinc-850 ${colors.border} ${colors.glow}`
                } p-6 md:p-8 space-y-6`}
              >
                {/* Cabeçalho do Card */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide border uppercase ${colors.badge}`}>
                        {CATEGORY_LABELS[indicator.category]}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        ID: {indicator.id}
                      </span>
                      {isFocodo && (
                        <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] px-2 py-0.5 rounded font-semibold font-mono animate-pulse">
                          Focalizado
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-white group-hover:text-zinc-50 transition-colors">
                      {indicator.title}
                    </h2>
                    <p className="text-zinc-400 text-sm max-w-4xl">
                      {indicator.description}
                    </p>
                  </div>

                  {/* Benchmark Widget */}
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5 flex items-center gap-3 shrink-0 self-start md:self-auto min-w-[200px]">
                    <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 font-mono uppercase font-bold tracking-wider">Benchmark Meta</p>
                      <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                        {indicator.target_benchmark.operator} {indicator.target_benchmark.value} {indicator.target_benchmark.unit}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Grid Explicativo com Design Glassmorphic */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Objetivo */}
                  <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-5 hover:border-zinc-800 transition-all duration-200">
                    <div className="flex items-center gap-2 mb-2 text-zinc-300 font-semibold text-sm">
                      <Target className={`h-4.5 w-4.5 ${colors.text} shrink-0`} />
                      <h3>Objetivo Principal</h3>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed">
                      {docData.objective}
                    </p>
                  </div>

                  {/* Cálculo */}
                  <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-5 hover:border-zinc-800 transition-all duration-200">
                    <div className="flex items-center gap-2 mb-2 text-zinc-300 font-semibold text-sm">
                      <Calculator className={`h-4.5 w-4.5 ${colors.text} shrink-0`} />
                      <h3>Como Funciona o Cálculo</h3>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed font-sans">
                      {docData.calculation}
                    </p>
                  </div>

                  {/* Interpretação */}
                  <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-5 hover:border-zinc-800 transition-all duration-200">
                    <div className="flex items-center gap-2 mb-2 text-zinc-300 font-semibold text-sm">
                      <TrendingUp className={`h-4.5 w-4.5 ${colors.text} shrink-0`} />
                      <h3>Interpretação e Gestão</h3>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed">
                      {docData.interpretation}
                    </p>
                  </div>

                  {/* Diagnóstico de problemas */}
                  <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-5 hover:border-zinc-800 transition-all duration-200">
                    <div className="flex items-center gap-2 mb-2 text-zinc-300 font-semibold text-sm">
                      <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                      <h3>Diagnóstico de Problemas</h3>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed">
                      {docData.troubleshooting}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Estado Vazio */
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/10">
          <HelpCircle className="h-10 w-10 text-zinc-600 mb-3" />
          <h3 className="text-lg font-semibold text-zinc-300">Nenhum indicador encontrado</h3>
          <p className="text-zinc-500 text-xs mt-1 max-w-sm">
            Nenhum resultado corresponde à busca "{searchTerm}" na categoria selecionada. Tente ajustar os termos ou selecionar outra aba.
          </p>
        </div>
      )}
    </div>
  );
}
