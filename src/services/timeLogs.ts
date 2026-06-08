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
