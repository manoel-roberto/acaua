import { vi } from "vitest";

// Banco de dados em memória para simulação
let store: Record<string, Record<string, any>> = {};

// Autenticação mockada
let currentUser: any = null;
let authListeners: Array<(user: any) => void> = [];
let mockAuthUsers: Record<string, { email: string; pass: string; displayName?: string; uid: string }> = {};

export function clearMockDb() {
  store = {};
  currentUser = null;
  authListeners = [];
  mockAuthUsers = {};
}

export function mockCurrentUser(user: any) {
  currentUser = user;
}

export function registerMockAuthUser(email: string, pass: string, displayName?: string, uid?: string) {
  const newUid = uid || Math.random().toString(36).substring(7);
  mockAuthUsers[newUid] = { uid: newUid, email, pass, displayName };
  return newUid;
}

export function triggerAuthStateChange(user: any) {
  currentUser = user;
  authListeners.forEach((listener) => listener(user));
}

export function getMockCollectionData(collectionName: string) {
  return Object.values(store[collectionName] || {});
}

// Utilitário para simular increment e arrayUnion
function applySpecialOperators(existing: any, updates: any) {
  const result = { ...existing };
  Object.keys(updates).forEach((key) => {
    const val = updates[key];
    if (val && typeof val === "object" && val.type === "increment") {
      result[key] = (Number(result[key]) || 0) + val.value;
    } else if (val && typeof val === "object" && val.type === "arrayUnion") {
      const arr = Array.isArray(result[key]) ? [...result[key]] : [];
      val.values.forEach((v: any) => {
        if (!arr.includes(v)) {
          arr.push(v);
        }
      });
      result[key] = arr;
    } else {
      result[key] = val;
    }
  });
  return result;
}

export function setMockDoc(collectionName: string, id: string, data: any) {
  if (!store[collectionName]) store[collectionName] = {};
  const existing = store[collectionName][id] || {};
  store[collectionName][id] = applySpecialOperators(existing, { id, ...data });
}

// Mock da inicialização do Firebase e exports do @/lib/firebase/client
vi.mock("@/lib/firebase/client", () => {
  return {
    db: { type: "db" },
    auth: {
      get currentUser() {
        return currentUser;
      },
    },
    googleProvider: {
      setCustomParameters: vi.fn(),
    },
    storage: { type: "storage" },
    isEmulatorActive: false,
  };
});

// Mock do SDK firebase/firestore
vi.mock("firebase/firestore", () => {
  const collection = (db: any, path: string) => {
    return { type: "collection", path };
  };

  const doc = (parent: any, ...args: string[]) => {
    let collectionPath = "";
    let id = "";
    if (parent.type === "collection") {
      collectionPath = parent.path;
      id = args[0] || Math.random().toString(36).substring(7);
    } else {
      collectionPath = args[0];
      id = args[1] || Math.random().toString(36).substring(7);
    }
    return { type: "doc", collection: collectionPath, id };
  };

  const setDoc = async (docRef: any, data: any) => {
    setMockDoc(docRef.collection, docRef.id, data);
  };

  const deleteDoc = async (docRef: any) => {
    if (store[docRef.collection]) {
      delete store[docRef.collection][docRef.id];
    }
  };

  const updateDoc = async (docRef: any, data: any) => {
    if (!store[docRef.collection]) store[docRef.collection] = {};
    const existing = store[docRef.collection][docRef.id] || {};
    store[docRef.collection][docRef.id] = applySpecialOperators(existing, data);
  };

  const getDoc = async (docRef: any) => {
    if (docRef && docRef.id === "forcar_erro") {
      throw new Error("Erro simulado do Firestore");
    }
    const data = store[docRef.collection]?.[docRef.id];
    return {
      exists: () => !!data,
      id: docRef.id,
      data: () => data,
    };
  };

  const query = (collRef: any, ...queryConstraints: any[]) => {
    const previousConstraints = collRef.constraints || [];
    return {
      type: "query",
      path: collRef.path || collRef.collection,
      constraints: [...previousConstraints, ...queryConstraints],
    };
  };

  const where = (field: string, op: string, value: any) => {
    return { type: "where", field, op, value };
  };

  const orderBy = (field: string, direction: string = "asc") => {
    return { type: "orderBy", field, direction };
  };

  const limit = (n: number) => {
    return { type: "limit", value: n };
  };

  const startAfter = (docSnap: any) => {
    return { type: "startAfter", docSnap };
  };

  const getDocs = async (queryOrRef: any) => {
    const path = queryOrRef.path;
    let items = Object.values(store[path] || {});

    if (queryOrRef.constraints) {
      queryOrRef.constraints.forEach((c: any) => {
        if (c.type === "where") {
          items = items.filter((item: any) => {
            const itemVal = item[c.field];
            if (c.op === "==") return itemVal === c.value;
            if (c.op === "!=") return itemVal !== c.value;
            if (c.op === "array-contains") return Array.isArray(itemVal) && itemVal.includes(c.value);
            if (c.op === "in") return Array.isArray(c.value) && c.value.includes(itemVal);
            return true;
          });
        }
        if (c.type === "orderBy") {
          items.sort((a: any, b: any) => {
            const valA = a[c.field];
            const valB = b[c.field];
            if (valA < valB) return c.direction === "asc" ? -1 : 1;
            if (valA > valB) return c.direction === "asc" ? 1 : -1;
            return 0;
          });
        }
        if (c.type === "limit") {
          items = items.slice(0, c.value);
        }
      });
    }

    const docs = items.map((item) => ({
      id: item.id,
      ref: { collection: path, id: item.id },
      data: () => item,
    }));

    return {
      empty: docs.length === 0,
      docs,
      forEach: (callback: (doc: any) => void) => {
        docs.forEach(callback);
      },
    };
  };

  const writeBatch = (db: any) => {
    const operations: Array<() => void> = [];
    return {
      set: (docRef: any, data: any, options?: any) => {
        operations.push(() => {
          if (options && options.merge) {
            if (!store[docRef.collection]) store[docRef.collection] = {};
            const existing = store[docRef.collection][docRef.id] || {};
            store[docRef.collection][docRef.id] = applySpecialOperators(existing, { id: docRef.id, ...data });
          } else {
            setMockDoc(docRef.collection, docRef.id, data);
          }
        });
      },
      update: (docRef: any, data: any) => {
        operations.push(() => {
          if (!store[docRef.collection]) store[docRef.collection] = {};
          const existing = store[docRef.collection][docRef.id] || {};
          store[docRef.collection][docRef.id] = applySpecialOperators(existing, data);
        });
      },
      delete: (docRef: any) => {
        operations.push(() => {
          if (store[docRef.collection]) {
            delete store[docRef.collection][docRef.id];
          }
        });
      },
      commit: async () => {
        operations.forEach((op) => op());
      },
    };
  };

  const increment = (n: number) => {
    return { type: "increment", value: n };
  };

  const arrayUnion = (...values: any[]) => {
    return { type: "arrayUnion", values };
  };

  const addDoc = async (collRef: any, data: any) => {
    const id = Math.random().toString(36).substring(7);
    setMockDoc(collRef.path, id, data);
    return { id };
  };

  return {
    collection,
    doc,
    setDoc,
    addDoc,
    deleteDoc,
    updateDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    writeBatch,
    increment,
    arrayUnion,
  };
});

// Mock do SDK firebase/auth
vi.mock("firebase/auth", () => {
  const onAuthStateChanged = (auth: any, callback: (user: any) => void) => {
    authListeners.push(callback);
    callback(currentUser);
    return () => {
      authListeners = authListeners.filter((l) => l !== callback);
    };
  };

  const signOut = async (auth: any) => {
    triggerAuthStateChange(null);
  };

  const signInWithEmailAndPassword = async (auth: any, email: string, pass: string) => {
    const found = Object.values(mockAuthUsers).find((u) => u.email === email);
    if (!found || found.pass !== pass) {
      const err = new Error("auth/invalid-credential") as any;
      err.code = "auth/invalid-credential";
      throw err;
    }
    const userObj = { uid: found.uid, email: found.email, displayName: found.displayName };
    triggerAuthStateChange(userObj);
    return { user: userObj };
  };

  const createUserWithEmailAndPassword = async (auth: any, email: string, pass: string) => {
    const found = Object.values(mockAuthUsers).find((u) => u.email === email);
    if (found) {
      const err = new Error("auth/email-already-in-use") as any;
      err.code = "auth/email-already-in-use";
      throw err;
    }
    const uid = Math.random().toString(36).substring(7);
    mockAuthUsers[uid] = { uid, email, pass };
    const userObj = { uid, email, displayName: "" };
    triggerAuthStateChange(userObj);
    return { user: userObj };
  };

  const updateProfile = async (user: any, updates: { displayName?: string }) => {
    if (user) {
      user.displayName = updates.displayName;
      if (mockAuthUsers[user.uid]) {
        mockAuthUsers[user.uid].displayName = updates.displayName;
      }
      triggerAuthStateChange({ ...currentUser, displayName: updates.displayName });
    }
  };

  const signInWithPopup = async (auth: any, provider: any) => {
    const userObj = { uid: "google_user", email: "user@uefs.br", displayName: "Usuário Google" };
    triggerAuthStateChange(userObj);
    return { user: userObj };
  };

  return {
    getAuth: () => ({
      currentUser,
    }),
    signOut,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signInWithPopup,
    GoogleAuthProvider: class {},
  };
});
