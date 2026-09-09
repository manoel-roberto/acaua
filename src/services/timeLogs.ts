import { db } from "@/lib/firebase/client";
import { 
  collection, 
  doc, 
  writeBatch, 
  increment, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  where, 
  DocumentSnapshot,
  startAfter 
} from "firebase/firestore";
import { TimeLog } from "@/types";

// Fetch paginated time logs for a specific person, activity, or project
export async function getTimeLogs(options?: {
  personId?: string;
  activityId?: string;
  projectId?: string;
  lastVisible?: DocumentSnapshot;
}) {
  const logsRef = collection(db, "time_logs");
  let q = query(logsRef, orderBy("created_at", "desc"));

  if (options?.personId) {
    q = query(q, where("person_id", "==", options.personId));
  }
  if (options?.activityId) {
    q = query(q, where("activity_id", "==", options.activityId));
  }
  if (options?.projectId) {
    q = query(q, where("project_id", "==", options.projectId));
  }
  if (options?.lastVisible) {
    q = query(q, startAfter(options.lastVisible));
  }

  q = query(q, limit(25));

  const querySnapshot = await getDocs(q);
  const logs: TimeLog[] = [];
  
  querySnapshot.forEach((docSnap) => {
    logs.push({ id: docSnap.id, ...docSnap.data() } as unknown as TimeLog);
  });

  const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

  return { logs, lastDoc };
}

// Atomic time log recording using writeBatch to update all related collections
export async function logHours(
  log: Omit<TimeLog, "id" | "created_at">
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // 1. Create a new Time Log document
  const logRef = doc(collection(db, "time_logs"));
  batch.set(logRef, {
    ...log,
    created_at: now,
  });

  // 2. Increment executed hours in Activity
  if (log.activity_id) {
    const activityRef = doc(db, "activities", log.activity_id);
    batch.update(activityRef, {
      hours_executed: increment(log.hours),
      updated_at: now,
    });
  }

  // 3. Increment executed hours in Project
  if (log.project_id) {
    const projectRef = doc(db, "projects", log.project_id);
    batch.update(projectRef, {
      executed_hours: increment(log.hours),
      updated_at: now,
    });
  }

  // 4. Increment global metrics
  const globalMetricsRef = doc(db, "metrics", "global");
  batch.set(
    globalMetricsRef,
    {
      total_hours_month: increment(log.hours),
      last_updated: now,
    },
    { merge: true }
  );

  await batch.commit();
}

// Atomic time log deletion using writeBatch to update all related collections and decrement counters
export async function deleteTimeLog(log: TimeLog): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // 1. Delete the Time Log document
  const logRef = doc(db, "time_logs", log.id);
  batch.delete(logRef);

  // 2. Decrement executed hours in Activity (increment by negative log.hours)
  if (log.activity_id) {
    const activityRef = doc(db, "activities", log.activity_id);
    batch.update(activityRef, {
      hours_executed: increment(-log.hours),
      updated_at: now,
    });
  }

  // 3. Decrement executed hours in Project (increment by negative log.hours)
  if (log.project_id) {
    const projectRef = doc(db, "projects", log.project_id);
    batch.update(projectRef, {
      executed_hours: increment(-log.hours),
      updated_at: now,
    });
  }

  // 4. Decrement global metrics (increment by negative log.hours)
  const globalMetricsRef = doc(db, "metrics", "global");
  batch.set(
    globalMetricsRef,
    {
      total_hours_month: increment(-log.hours),
      last_updated: now,
    },
    { merge: true }
  );

  await batch.commit();
}

// Atomic time log update using writeBatch to update all related collections and adjust counters incrementally
export async function updateTimeLog(
  logId: string,
  updatedData: {
    hours: number;
    description: string;
    start_time: string | null;
    end_time: string | null;
  },
  oldLog: TimeLog
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const diff = updatedData.hours - oldLog.hours;

  // 1. Update the Time Log document
  const logRef = doc(db, "time_logs", logId);
  batch.update(logRef, {
    hours: updatedData.hours,
    description: updatedData.description,
    start_time: updatedData.start_time,
    end_time: updatedData.end_time,
    updated_at: now,
  });

  // 2. Adjust executed hours in Activity (increment by the diff)
  if (oldLog.activity_id) {
    const activityRef = doc(db, "activities", oldLog.activity_id);
    batch.update(activityRef, {
      hours_executed: increment(diff),
      updated_at: now,
    });
  }

  // 3. Adjust executed hours in Project (increment by the diff)
  if (oldLog.project_id) {
    const projectRef = doc(db, "projects", oldLog.project_id);
    batch.update(projectRef, {
      executed_hours: increment(diff),
      updated_at: now,
    });
  }

  // 4. Adjust global metrics (increment by the diff)
  const globalMetricsRef = doc(db, "metrics", "global");
  batch.set(
    globalMetricsRef,
    {
      total_hours_month: increment(diff),
      last_updated: now,
    },
    { merge: true }
  );

  await batch.commit();
}
