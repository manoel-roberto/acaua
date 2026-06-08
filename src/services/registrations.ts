import { db } from "@/lib/firebase/client";
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
  writeBatch
} from "firebase/firestore";
import { Sector, ActivityType, Category } from "@/types";

// Função para gerar chaves normalizadas compatíveis com o banco de dados (ex: "Capacitação" -> "capacitacao")
export function normalizeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_") // Substitui espaços por underline
    .replace(/[^a-z0-9_]/g, ""); // Remove caracteres especiais
}

/* ==========================================================================
   SETORES (/sectors)
   ========================================================================== */

// Lista setores ordenados por nome
export async function getSectors(): Promise<Sector[]> {
  const sectorsRef = collection(db, "sectors");
  const q = query(sectorsRef, orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  
  const sectors: Sector[] = [];
  querySnapshot.forEach((docSnap) => {
    sectors.push({ id: docSnap.id, ...docSnap.data() } as Sector);
  });
  return sectors;
}

// Cria setor
export async function createSector(name: string): Promise<Sector> {
  const sectorsRef = collection(db, "sectors");
  const trimmedName = name.trim();
  
  const normalizedNew = normalizeKey(trimmedName);
  
  // Busca todos os setores para validar unicidade de forma case-insensitive e sem acentos
  const existingSectors = await getSectors();
  const duplicate = existingSectors.find(
    (s) => normalizeKey(s.name) === normalizedNew
  );
  if (duplicate) {
    throw new Error(`O setor "${trimmedName}" já está cadastrado.`);
  }

  const sectorDocRef = doc(sectorsRef);
  const newSector: Sector = {
    id: sectorDocRef.id,
    name: trimmedName,
    created_at: new Date().toISOString(),
  };

  await setDoc(sectorDocRef, newSector);
  return newSector;
}

// Exclui setor com validação de segurança
export async function deleteSector(id: string, name: string): Promise<void> {
  // 1. Verificar se algum perfil (profile) usa este setor
  const profilesRef = collection(db, "profiles");
  const qProfiles = query(profilesRef, where("setor", "==", name), limit(1));
  const profilesSnapshot = await getDocs(qProfiles);
  if (!profilesSnapshot.empty) {
    throw new Error(
      `Não é possível excluir o setor "${name}" pois ele está sendo utilizado por um ou mais usuários.`
    );
  }

  // 2. Verificar se algum projeto usa este setor como origem da demanda
  const projectsRef = collection(db, "projects");
  const qProjects = query(projectsRef, where("origem_demanda", "==", name), limit(1));
  const projectsSnapshot = await getDocs(qProjects);
  if (!projectsSnapshot.empty) {
    throw new Error(
      `Não é possível excluir o setor "${name}" pois ele está vinculado à origem de demanda de um ou mais projetos.`
    );
  }

  // Se passou pelas validações, exclui
  const sectorRef = doc(db, "sectors", id);
  await deleteDoc(sectorRef);
}


/* ==========================================================================
   TIPOS DE ATIVIDADE (/activity_types)
   ========================================================================== */

// Lista tipos de atividade ordenados por nome
export async function getActivityTypes(): Promise<ActivityType[]> {
  const typesRef = collection(db, "activity_types");
  const q = query(typesRef, orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  
  const types: ActivityType[] = [];
  querySnapshot.forEach((docSnap) => {
    types.push({ id: docSnap.id, ...docSnap.data() } as ActivityType);
  });
  return types;
}

// Cria tipo de atividade
export async function createActivityType(name: string): Promise<ActivityType> {
  const typesRef = collection(db, "activity_types");
  const trimmedName = name.trim();
  const key = normalizeKey(trimmedName);

  // Busca todos os tipos de atividade para validar unicidade de forma case-insensitive e sem acentos
  const existingTypes = await getActivityTypes();
  const duplicate = existingTypes.find(
    (t) => normalizeKey(t.name) === key
  );
  if (duplicate) {
    throw new Error(`O tipo de atividade "${trimmedName}" já está cadastrado.`);
  }

  const typeDocRef = doc(typesRef);
  const newType = {
    id: typeDocRef.id,
    name: trimmedName,
    key,
    created_at: new Date().toISOString(),
  };

  await setDoc(typeDocRef, newType);
  return newType as unknown as ActivityType;
}

// Exclui tipo de atividade com validação de segurança
export async function deleteActivityType(id: string, key: string, name: string): Promise<void> {
  // 1. Verificar se alguma atividade possui este tipo
  const activitiesRef = collection(db, "activities");
  const qActivities = query(activitiesRef, where("type", "==", key), limit(1));
  const activitiesSnapshot = await getDocs(qActivities);
  if (!activitiesSnapshot.empty) {
    throw new Error(
      `Não é possível excluir o tipo de atividade "${name}" pois existem atividades vinculadas a ele.`
    );
  }

  // 2. Verificar se alguma rotina recorrente possui este tipo
  const routinesRef = collection(db, "recurring_routines");
  const qRoutines = query(routinesRef, where("type", "==", key), limit(1));
  const routinesSnapshot = await getDocs(qRoutines);
  if (!routinesSnapshot.empty) {
    throw new Error(
      `Não é possível excluir o tipo de atividade "${name}" pois existem rotinas de trabalho recorrentes vinculadas a ele.`
    );
  }

  const typeRef = doc(db, "activity_types", id);
  await deleteDoc(typeRef);
}

// Inicializa tipos de atividade padrão
export async function initializeDefaultActivityTypes(): Promise<void> {
  const defaultTypes = [
    "Rotina",
    "Projeto",
    "Planejamento",
    "Capacitação",
    "Reunião",
    "Atendimento",
    "Suporte"
  ];

  const typesRef = collection(db, "activity_types");
  const querySnapshot = await getDocs(query(typesRef, limit(1)));
  
  // Se a coleção já tiver algum dado, não faz nada (inicialização única)
  if (!querySnapshot.empty) return;

  const batch = writeBatch(db);
  defaultTypes.forEach((name) => {
    const docRef = doc(typesRef);
    batch.set(docRef, {
      id: docRef.id,
      name,
      key: normalizeKey(name),
      created_at: new Date().toISOString()
    });
  });

  await batch.commit();
}


/* ==========================================================================
   CATEGORIAS DE PROJETO (/categories)
   ========================================================================== */

// Lista categorias de projeto ordenadas por nome
export async function getCategories(): Promise<Category[]> {
  const categoriesRef = collection(db, "categories");
  const q = query(categoriesRef, orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  
  const categories: Category[] = [];
  querySnapshot.forEach((docSnap) => {
    categories.push({ id: docSnap.id, ...docSnap.data() } as Category);
  });
  return categories;
}

// Cria categoria de projeto
export async function createCategory(name: string): Promise<Category> {
  const categoriesRef = collection(db, "categories");
  const trimmedName = name.trim();
  const key = normalizeKey(trimmedName);

  // Busca todos os tipos de categorias para validar unicidade de forma case-insensitive e sem acentos
  const existingCategories = await getCategories();
  const duplicate = existingCategories.find(
    (c) => normalizeKey(c.name) === key
  );
  if (duplicate) {
    throw new Error(`A categoria de projeto "${trimmedName}" já está cadastrada.`);
  }

  const categoryDocRef = doc(categoriesRef);
  const newCategory = {
    id: categoryDocRef.id,
    name: trimmedName,
    key,
    created_at: new Date().toISOString(),
  };

  await setDoc(categoryDocRef, newCategory);
  return newCategory as unknown as Category;
}

// Exclui categoria de projeto com validação de segurança
export async function deleteCategory(id: string, key: string, name: string): Promise<void> {
  // 1. Verificar se algum projeto usa esta categoria
  const projectsRef = collection(db, "projects");
  const qProjects = query(projectsRef, where("category", "==", key), limit(1));
  const projectsSnapshot = await getDocs(qProjects);
  if (!projectsSnapshot.empty) {
    throw new Error(
      `Não é possível excluir a categoria "${name}" pois existem projetos vinculados a ela.`
    );
  }

  const categoryRef = doc(db, "categories", id);
  await deleteDoc(categoryRef);
}

// Inicializa categorias padrão
export async function initializeDefaultCategories(): Promise<void> {
  const defaultCategories = [
    "Automação",
    "Desenvolvimento",
    "Capacitação",
    "Infraestrutura",
    "Dados",
    "Relatório",
    "Sistema",
    "Suporte",
    "Inovação"
  ];

  const categoriesRef = collection(db, "categories");
  const querySnapshot = await getDocs(query(categoriesRef, limit(1)));
  
  // Se a coleção já tiver algum dado, não faz nada (inicialização única)
  if (!querySnapshot.empty) return;

  const batch = writeBatch(db);
  defaultCategories.forEach((name) => {
    const docRef = doc(categoriesRef);
    batch.set(docRef, {
      id: docRef.id,
      name,
      key: normalizeKey(name),
      created_at: new Date().toISOString()
    });
  });

  await batch.commit();
}

// Remove registros duplicados (mesma chave normalizada ou mesmo nome normalizado) no Firestore
export async function cleanDuplicateRegistrations(): Promise<{ sectorsRemoved: number; categoriesRemoved: number; typesRemoved: number }> {
  let sectorsRemoved = 0;
  let categoriesRemoved = 0;
  let typesRemoved = 0;

  const batch = writeBatch(db);

  // 1. Limpa setores duplicados (compara por normalizeKey do name)
  const sectors = await getSectors();
  const seenSectors = new Set<string>();
  sectors.forEach((s) => {
    const norm = normalizeKey(s.name);
    if (seenSectors.has(norm)) {
      // É duplicado, apaga do Firestore
      const docRef = doc(db, "sectors", s.id);
      batch.delete(docRef);
      sectorsRemoved++;
    } else {
      seenSectors.add(norm);
    }
  });

  // 2. Limpa categorias duplicadas (compara por key ou normalizeKey do name)
  const categories = await getCategories();
  const seenCategories = new Set<string>();
  categories.forEach((c) => {
    const key = (c as any).key || normalizeKey(c.name);
    if (seenCategories.has(key)) {
      const docRef = doc(db, "categories", c.id);
      batch.delete(docRef);
      categoriesRemoved++;
    } else {
      seenCategories.add(key);
    }
  });

  // 3. Limpa tipos de atividades duplicados (compara por key ou normalizeKey do name)
  const types = await getActivityTypes();
  const seenTypes = new Set<string>();
  types.forEach((t) => {
    const key = (t as any).key || normalizeKey(t.name);
    if (seenTypes.has(key)) {
      const docRef = doc(db, "activity_types", t.id);
      batch.delete(docRef);
      typesRemoved++;
    } else {
      seenTypes.add(key);
    }
  });

  if (sectorsRemoved > 0 || categoriesRemoved > 0 || typesRemoved > 0) {
    await batch.commit();
  }

  return { sectorsRemoved, categoriesRemoved, typesRemoved };
}
