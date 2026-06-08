import { db, auth } from "@/lib/firebase/client";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs, 
  doc, 
  writeBatch,
  increment,
  arrayUnion,
  DocumentSnapshot
} from "firebase/firestore";
import { Project } from "@/types";

// List projects with strict limit of 25 items and cursor pagination
export async function getProjects(options?: {
  status?: string;
  lastVisible?: DocumentSnapshot;
  includeArchived?: boolean;
}) {
  const projectsRef = collection(db, "projects");
  let q = query(projectsRef, orderBy("created_at", "desc"));

  if (options?.status) {
    q = query(q, where("status", "==", options.status));
  }
  
  if (!options?.includeArchived) {
    q = query(q, where("archived", "==", false));
  }

  if (options?.lastVisible) {
    q = query(q, startAfter(options.lastVisible));
  }

  q = query(q, limit(25));

  const querySnapshot = await getDocs(q);
  const projects: Project[] = [];
  
  querySnapshot.forEach((docSnap) => {
    projects.push({ id: docSnap.id, ...docSnap.data() } as unknown as Project);
  });

  const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

  return { projects, lastDoc };
}

// Create a project
export async function createProject(
  project: Omit<Project, "id" | "created_at" | "updated_at" | "executed_hours" | "progress">
): Promise<Project> {
  const now = new Date().toISOString();
  const projectRef = doc(collection(db, "projects"));
  const batch = writeBatch(db);
  
  const projectData = {
    ...project,
    progress: 0,
    executed_hours: 0,
    created_at: now,
    updated_at: now,
  };
  
  batch.set(projectRef, projectData);
  
  // Register the demand source in the global metrics dynamically
  if (project.origem_demanda && project.origem_demanda.trim()) {
    const globalMetricsRef = doc(db, "metrics", "global");
    batch.set(globalMetricsRef, {
      demand_sources: arrayUnion(project.origem_demanda.trim())
    }, { merge: true });
  }
  
  await batch.commit();

  return {
    id: projectRef.id,
    ...projectData,
  } as unknown as Project;
}

// Update project fields
export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const projectRef = doc(db, "projects", id);
  const batch = writeBatch(db);
  
  batch.update(projectRef, {
    ...updates,
    updated_at: new Date().toISOString(),
  });
  
  // Register the demand source in the global metrics dynamically if updated
  if (updates.origem_demanda && updates.origem_demanda.trim()) {
    const globalMetricsRef = doc(db, "metrics", "global");
    batch.set(globalMetricsRef, {
      demand_sources: arrayUnion(updates.origem_demanda.trim())
    }, { merge: true });
  }
  
  await batch.commit();
}

// Update project status and append audit log in a single atomic Write Batch
export async function updateProjectStatus(options: {
  projectId: string;
  oldStatus: string;
  newStatus: string;
  userId: string;
  userEmail: string;
}): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // 1. Update project status
  const projectRef = doc(db, "projects", options.projectId);
  batch.update(projectRef, {
    status: options.newStatus,
    updated_at: now,
  });

  // 2. Add append-only audit log
  const auditLogRef = doc(collection(db, "audit_logs"));
  batch.set(auditLogRef, {
    user_id: options.userId,
    user_email: options.userEmail,
    action: "UPDATE_STATUS",
    table_name: "projects",
    record_id: options.projectId,
    old_status: options.oldStatus,
    new_status: options.newStatus,
    created_at: now,
  });

  // 3. Update global metrics status counters incrementally
  const getMetricKey = (status: string) => {
    switch (status) {
      case "em_andamento":
        return "projects_active";
      case "concluido":
        return "projects_done";
      case "pausado":
        return "projects_paused";
      case "bloqueado":
        return "projects_blocked";
      default:
        return null;
    }
  };

  const oldKey = getMetricKey(options.oldStatus);
  const newKey = getMetricKey(options.newStatus);

  if (oldKey || newKey) {
    const globalMetricsRef = doc(db, "metrics", "global");
    const updates: Record<string, unknown> = {
      last_updated: now,
    };
    if (oldKey) {
      updates[oldKey] = increment(-1);
    }
    if (newKey) {
      updates[newKey] = increment(1);
    }
    batch.set(globalMetricsRef, updates, { merge: true });
  }

  await batch.commit();
}

// Delete a project and atomically update global metrics and audit logs
export async function deleteProject(project: Project): Promise<void> {
  const projectRef = doc(db, "projects", project.id);
  const batch = writeBatch(db);

  // 1. Delete project document
  batch.delete(projectRef);

  // 2. Decrement metrics status counters in metrics/global
  const getMetricKey = (status: string) => {
    switch (status) {
      case "em_andamento":
        return "projects_active";
      case "concluido":
        return "projects_done";
      case "pausado":
        return "projects_paused";
      case "bloqueado":
        return "projects_blocked";
      default:
        return null;
    }
  };

  const metricKey = getMetricKey(project.status);
  if (metricKey) {
    const globalMetricsRef = doc(db, "metrics", "global");
    const now = new Date().toISOString();
    batch.set(globalMetricsRef, {
      [metricKey]: increment(-1),
      last_updated: now,
    }, { merge: true });
  }

  // 3. Log the deletion in audit_logs (append-only)
  const auditRef = doc(collection(db, "audit_logs"));
  batch.set(auditRef, {
    user_id: auth.currentUser?.uid || "system",
    user_email: auth.currentUser?.email || "unknown@uefs.br",
    action: "DELETE_PROJECT",
    table_name: "projects",
    record_id: project.id,
    old_status: project.status,
    new_status: "DELETED",
    created_at: new Date().toISOString(),
  });

  await batch.commit();
}
