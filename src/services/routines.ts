import { db } from "@/lib/firebase/client";
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  writeBatch,
  DocumentSnapshot
} from "firebase/firestore";
import { RecurringRoutine } from "@/types";

// List routines with pagination
export async function getRoutines(options?: {
  lastVisible?: DocumentSnapshot;
}) {
  const routinesRef = collection(db, "recurring_routines");
  let q = query(routinesRef, orderBy("created_at", "desc"));

  if (options?.lastVisible) {
    q = query(q, startAfter(options.lastVisible));
  }

  q = query(q, limit(25));

  const querySnapshot = await getDocs(q);
  const routines: RecurringRoutine[] = [];

  querySnapshot.forEach((docSnap) => {
    routines.push({ id: docSnap.id, ...docSnap.data() } as unknown as RecurringRoutine);
  });

  const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

  return { routines, lastDoc };
}

// Calculate the next execution date
export function calculateNextRun(
  currentDateStr: string,
  frequency: RecurringRoutine["frequency"],
  interval: number,
  weekDays?: number[]
): string {
  const parts = currentDateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  let date = new Date(year, month, day);

  if (frequency === "hora" || frequency === "dia") {
    date.setDate(date.getDate() + interval);
  } else if (frequency === "semana") {
    if (!weekDays || weekDays.length === 0) {
      date.setDate(date.getDate() + interval * 7);
    } else {
      let originalDate = new Date(year, month, day);
      
      const getStartOfWeek = (d: Date) => {
        const temp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const dayOfWeek = temp.getDay();
        temp.setDate(temp.getDate() - dayOfWeek);
        return temp;
      };
      
      const originalWeekStart = getStartOfWeek(originalDate);
      let found = false;
      let loops = 0;
      
      while (!found && loops < 1000) {
        loops++;
        date.setDate(date.getDate() + 1);
        const dayOfWeek = date.getDay();
        if (weekDays.includes(dayOfWeek)) {
          const candidateWeekStart = getStartOfWeek(date);
          const diffTime = Math.abs(candidateWeekStart.getTime() - originalWeekStart.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const weeksPassed = Math.round(diffDays / 7);
          if (weeksPassed % interval === 0) {
            found = true;
          }
        }
      }
    }
  } else if (frequency === "mes") {
    date.setMonth(date.getMonth() + interval);
  } else if (frequency === "ano") {
    date.setFullYear(date.getFullYear() + interval);
  }

  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

// Create a routine and atomically spawn the first activity using writeBatch
export async function createRoutine(
  routine: Omit<RecurringRoutine, "id" | "created_at" | "updated_at" | "last_run">,
  creatorName: string
): Promise<RecurringRoutine> {
  const now = new Date().toISOString();
  const batch = writeBatch(db);

  // 1. Generate IDs for both documents
  const routinesRef = collection(db, "recurring_routines");
  const routineDocRef = doc(routinesRef);
  const routineId = routineDocRef.id;

  const activitiesRef = collection(db, "activities");
  const activityDocRef = doc(activitiesRef);

  // 2. The first execution date is the next_run set by the user
  const initialActivityDate = routine.next_run;

  // 3. Compute advanced next_run for the routine
  const computedNextRun = calculateNextRun(
    routine.next_run,
    routine.frequency,
    routine.interval,
    routine.week_days
  );

  const routineData = {
    ...routine,
    start_time_planned: routine.start_time_planned || "",
    end_time_planned: routine.end_time_planned || "",
    last_run: initialActivityDate,
    next_run: computedNextRun,
    created_at: now,
    updated_at: now,
  };

  // 4. Queue the routine creation
  batch.set(routineDocRef, routineData);

  // 5. Queue the first activity spawn
  const spawnedActivity = {
    title: routine.title,
    description: routine.description || "",
    responsible_id: routine.created_by,
    responsible_name: creatorName,
    project_id: routine.project_id || null,
    project_name: routine.project_name || null,
    routine_id: routineDocRef.id,
    type: routine.type || "rotina",
    status: "pendente",
    priority: routine.priority || "media",
    activity_date: initialActivityDate,
    start_time_planned: routine.start_time_planned || "",
    end_time_planned: routine.end_time_planned || "",
    hours_planned: routine.hours_planned || 0,
    hours_executed: 0,
    observations: routine.observations || "",
    tags: routine.tags || [],
    created_by: routine.created_by,
    created_at: now,
    updated_at: now,
  };
  batch.set(activityDocRef, spawnedActivity);

  // 6. Commit transaction batch
  await batch.commit();

  return {
    id: routineId,
    ...routineData,
  } as unknown as RecurringRoutine;
}

// Update routine
export async function updateRoutine(id: string, updates: Partial<RecurringRoutine>): Promise<void> {
  const routineRef = doc(db, "recurring_routines", id);
  await updateDoc(routineRef, {
    ...updates,
    updated_at: new Date().toISOString(),
  });
}

// Delete routine
export async function deleteRoutine(id: string): Promise<void> {
  const routineRef = doc(db, "recurring_routines", id);
  await deleteDoc(routineRef);
}
