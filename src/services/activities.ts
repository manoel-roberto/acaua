import { db } from "@/lib/firebase/client";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs, 
  getDoc,
  addDoc, 
  doc, 
  deleteDoc,
  writeBatch,
  DocumentSnapshot,
  increment
} from "firebase/firestore";
import { Activity, RecurringRoutine } from "@/types";
import { calculateNextRun } from "./routines";

// List activities with strict limit of 25 items and cursor pagination
export async function getActivities(options?: {
  status?: string;
  responsibleId?: string;
  projectId?: string;
  lastVisible?: DocumentSnapshot;
}) {
  const activitiesRef = collection(db, "activities");
  let q = query(activitiesRef, orderBy("created_at", "desc"));

  if (options?.status) {
    q = query(q, where("status", "==", options.status));
  }
  if (options?.responsibleId) {
    q = query(q, where("responsible_id", "==", options.responsibleId));
  }
  if (options?.projectId) {
    q = query(q, where("project_id", "==", options.projectId));
  }
  if (options?.lastVisible) {
    q = query(q, startAfter(options.lastVisible));
  }

  q = query(q, limit(25));

  const querySnapshot = await getDocs(q);
  const activities: Activity[] = [];
  
  querySnapshot.forEach((docSnap) => {
    activities.push({ id: docSnap.id, ...docSnap.data() } as unknown as Activity);
  });

  const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

  return { activities, lastDoc };
}

// Helper to calculate hours between start time and end time
export function calculateHoursBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;
  const diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  return diffMinutes > 0 ? Number((diffMinutes / 60).toFixed(2)) : 0;
}

// Create an activity
export async function createActivity(
  activity: Omit<Activity, "id" | "created_at" | "updated_at" | "hours_executed">
): Promise<Activity> {
  const now = new Date().toISOString();
  const activitiesRef = collection(db, "activities");
  const docRef = doc(activitiesRef);
  const id = docRef.id;

  // Compute hours_executed if start/end time executed are set
  let initialHoursExecuted = 0;
  if (activity.start_time_executed && activity.end_time_executed) {
    initialHoursExecuted = calculateHoursBetween(activity.start_time_executed, activity.end_time_executed);
  }

  const batch = writeBatch(db);

  batch.set(docRef, {
    ...activity,
    hours_executed: initialHoursExecuted,
    created_at: now,
    updated_at: now,
  });

  if (initialHoursExecuted > 0) {
    // 1. Create a new Time Log document
    const logRef = doc(collection(db, "time_logs"));
    batch.set(logRef, {
      person_id: activity.responsible_id,
      person_name: activity.responsible_name,
      activity_id: id,
      activity_title: activity.title,
      project_id: activity.project_id || null,
      project_name: activity.project_name || null,
      log_date: activity.activity_date || now.split("T")[0],
      hours: initialHoursExecuted,
      description: "Lançamento automático via cadastro de atividade com horas executadas",
      is_overtime: false,
      created_at: now,
    });

    // 2. Increment executed hours in Project
    if (activity.project_id) {
      const projectRef = doc(db, "projects", activity.project_id);
      batch.update(projectRef, {
        executed_hours: increment(initialHoursExecuted),
        updated_at: now,
      });
    }

    // 3. Increment global metrics
    const globalMetricsRef = doc(db, "metrics", "global");
    batch.set(
      globalMetricsRef,
      {
        total_hours_month: increment(initialHoursExecuted),
        last_updated: now,
      },
      { merge: true }
    );
  }

  await batch.commit();

  return {
    id,
    ...activity,
    hours_executed: initialHoursExecuted,
    created_at: now,
    updated_at: now,
  } as unknown as Activity;
}

// Duplicate an activity
export async function duplicateActivity(
  activity: Activity,
  userId: string
): Promise<Activity> {
  const now = new Date().toISOString();
  const activitiesRef = collection(db, "activities");

  const duplicateData = {
    title: activity.title,
    description: activity.description || "",
    responsible_id: activity.responsible_id,
    responsible_name: activity.responsible_name,
    project_id: activity.project_id || null,
    project_name: activity.project_name || null,
    type: activity.type,
    status: "pendente",
    priority: activity.priority,
    activity_date: activity.activity_date,
    start_time_planned: activity.start_time_planned || "",
    end_time_planned: activity.end_time_planned || "",
    hours_planned: activity.hours_planned || 0,
    hours_executed: 0,
    observations: activity.observations || "",
    tags: activity.tags || [],
    created_by: userId,
    created_at: now,
    updated_at: now,
  };

  const docRef = await addDoc(activitiesRef, duplicateData);

  return {
    id: docRef.id,
    ...duplicateData,
  } as unknown as Activity;
}

// Update activity fields
export async function updateActivity(id: string, updates: Partial<Activity>): Promise<Activity | null> {
  const activityRef = doc(db, "activities", id);
  const now = new Date().toISOString();
  let spawnedNextActivity: Activity | null = null;

  const activitySnap = await getDoc(activityRef);
  if (!activitySnap.exists()) return null;
  const activityData = activitySnap.data() as Activity;

  // Calculate the difference in hours_executed
  const oldHours = activityData.hours_executed || 0;
  const newHours = updates.hours_executed !== undefined ? updates.hours_executed : oldHours;
  const diff = newHours - oldHours;

  const batch = writeBatch(db);

  // Apply updates to the activity document in the batch
  batch.update(activityRef, {
    ...updates,
    updated_at: now,
  });

  // If there is a difference in hours_executed, propagate it
  if (diff !== 0) {
    const responsibleId = updates.responsible_id || activityData.responsible_id;
    const responsibleName = updates.responsible_name || activityData.responsible_name;
    const activityTitle = updates.title || activityData.title;
    const projectId = updates.project_id !== undefined ? updates.project_id : activityData.project_id;
    const projectName = updates.project_name !== undefined ? updates.project_name : activityData.project_name;
    const logDate = updates.activity_date || activityData.activity_date || now.split("T")[0];

    // 1. Create a new Time Log document
    const logRef = doc(collection(db, "time_logs"));
    batch.set(logRef, {
      person_id: responsibleId,
      person_name: responsibleName,
      activity_id: id,
      activity_title: activityTitle,
      project_id: projectId || null,
      project_name: projectName || null,
      log_date: logDate,
      hours: diff,
      description: "Ajuste de horas executadas via cadastro da atividade",
      is_overtime: false,
      created_at: now,
    });

    // 2. Increment executed hours in Project
    if (projectId) {
      const projectRef = doc(db, "projects", projectId);
      batch.update(projectRef, {
        executed_hours: increment(diff),
        updated_at: now,
      });
    }

    // 3. Increment global metrics
    const globalMetricsRef = doc(db, "metrics", "global");
    batch.set(
      globalMetricsRef,
      {
        total_hours_month: increment(diff),
        last_updated: now,
      },
      { merge: true }
    );
  }

  // Spawns next routine activity if this activity was completed via edit modal
  if (updates.status === "concluida" && activityData.status !== "concluida") {
    try {
      let routineId = activityData.routine_id;

      // Fallback for legacy activities without routine_id
      if (!routineId && activityData.type === "rotina") {
        const routinesRef = collection(db, "recurring_routines");
        const q = query(
          routinesRef,
          where("title", "==", activityData.title),
          where("active", "==", true),
          limit(1)
        );
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          routineId = querySnap.docs[0].id;
          // Update the current activity with the matched routine_id for historical consistency
          batch.update(activityRef, { routine_id: routineId });
        }
      }

      if (routineId) {
        const routineRef = doc(db, "recurring_routines", routineId);
        const routineSnap = await getDoc(routineRef);
        
        if (routineSnap.exists() && routineSnap.data().active) {
          const routine = { id: routineSnap.id, ...routineSnap.data() } as RecurringRoutine;
          const nextRunStr = routine.next_run;
          
          const calculatedNextRun = calculateNextRun(
            nextRunStr,
            routine.frequency,
            routine.interval,
            routine.week_days
          );

          const nextActivityRef = doc(collection(db, "activities"));
          const nextActivity = {
            title: routine.title,
            description: routine.description || "",
            responsible_id: routine.created_by,
            responsible_name: updates.responsible_name || activityData.responsible_name || "Colaborador",
            project_id: routine.project_id || null,
            project_name: routine.project_name || null,
            routine_id: routine.id,
            type: routine.type || "rotina",
            status: "pendente",
            priority: routine.priority || "media",
            activity_date: nextRunStr,
            start_time_planned: routine.start_time_planned || "",
            end_time_planned: routine.end_time_planned || "",
            hours_planned: routine.hours_planned || 0,
            hours_executed: 0,
            observations: routine.observations || "",
            tags: routine.tags || [],
            created_by: "system-scheduler",
            created_at: now,
            updated_at: now,
          };

          batch.set(nextActivityRef, nextActivity);
          spawnedNextActivity = { id: nextActivityRef.id, ...nextActivity } as unknown as Activity;

          batch.update(routineRef, {
            last_run: nextRunStr,
            next_run: calculatedNextRun,
            updated_at: now,
          });
        }
      }
    } catch (err) {
      console.error("Erro ao gerar a próxima atividade da rotina recorrente na edição:", err);
    }
  }

  await batch.commit();
  return spawnedNextActivity;
}

// Update activity status and append audit log in a single atomic Write Batch
export async function updateActivityStatus(options: {
  activityId: string;
  oldStatus: string;
  newStatus: string;
  userId: string;
  userEmail: string;
}): Promise<Activity | null> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  let spawnedNextActivity: Activity | null = null;

  // 1. Update activity status
  const activityRef = doc(db, "activities", options.activityId);
  batch.update(activityRef, {
    status: options.newStatus,
    updated_at: now,
  });

  // 2. Add append-only audit log
  const auditLogRef = doc(collection(db, "audit_logs"));
  batch.set(auditLogRef, {
    user_id: options.userId,
    user_email: options.userEmail,
    action: "UPDATE_STATUS",
    table_name: "activities",
    record_id: options.activityId,
    old_status: options.oldStatus,
    new_status: options.newStatus,
    created_at: now,
  });

  // 3. Spawns next routine activity if this activity was completed and belongs to an active routine
  if (options.newStatus === "concluida" && options.oldStatus !== "concluida") {
    try {
      const activitySnap = await getDoc(activityRef);
      if (activitySnap.exists()) {
        const activityData = activitySnap.data() as Activity;

        // Auto-fill execution times if they are empty and planned times are set
        let startExec = activityData.start_time_executed || "";
        let endExec = activityData.end_time_executed || "";
        let hoursExec = activityData.hours_executed || 0;
        let didAutoFill = false;

        if (!startExec && activityData.start_time_planned) {
          startExec = activityData.start_time_planned;
          didAutoFill = true;
        }
        if (!endExec && activityData.end_time_planned) {
          endExec = activityData.end_time_planned;
          didAutoFill = true;
        }

        const oldHours = activityData.hours_executed || 0;

        if (didAutoFill) {
          if (startExec && endExec) {
            const [startH, startM] = startExec.split(":").map(Number);
            const [endH, endM] = endExec.split(":").map(Number);
            const diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
            if (diffMinutes >= 0) {
              hoursExec = Number((diffMinutes / 60).toFixed(2));
            }
          }
          batch.update(activityRef, {
            start_time_executed: startExec,
            end_time_executed: endExec,
            hours_executed: hoursExec,
          });
        }

        const diff = hoursExec - oldHours;

        // Propagate difference in hours_executed if it was auto-filled/changed
        if (diff !== 0) {
          const responsibleId = activityData.responsible_id;
          const responsibleName = activityData.responsible_name;
          const activityTitle = activityData.title;
          const projectId = activityData.project_id;
          const projectName = activityData.project_name;
          const logDate = activityData.activity_date || now.split("T")[0];

          // 1. Create a new Time Log document
          const logRef = doc(collection(db, "time_logs"));
          batch.set(logRef, {
            person_id: responsibleId,
            person_name: responsibleName,
            activity_id: options.activityId,
            activity_title: activityTitle,
            project_id: projectId || null,
            project_name: projectName || null,
            log_date: logDate,
            hours: diff,
            description: "Lançamento automático via conclusão da atividade",
            is_overtime: false,
            created_at: now,
          });

          // 2. Increment executed hours in Project
          if (projectId) {
            const projectRef = doc(db, "projects", projectId);
            batch.update(projectRef, {
              executed_hours: increment(diff),
              updated_at: now,
            });
          }

          // 3. Increment global metrics
          const globalMetricsRef = doc(db, "metrics", "global");
          batch.set(
            globalMetricsRef,
            {
              total_hours_month: increment(diff),
              last_updated: now,
            },
            { merge: true }
          );
        }

        let routineId = activityData.routine_id;

        // Fallback for legacy activities without routine_id
        if (!routineId && activityData.type === "rotina") {
          const routinesRef = collection(db, "recurring_routines");
          const q = query(
            routinesRef, 
            where("title", "==", activityData.title),
            where("active", "==", true),
            limit(1)
          );
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            routineId = querySnap.docs[0].id;
            // Update the current activity with the matched routine_id for historical consistency
            batch.update(activityRef, { routine_id: routineId });
          }
        }

        if (routineId) {
          const routineRef = doc(db, "recurring_routines", routineId);
          const routineSnap = await getDoc(routineRef);
          if (routineSnap.exists() && routineSnap.data().active) {
            const routine = { id: routineSnap.id, ...routineSnap.data() } as RecurringRoutine;
            const nextRunStr = routine.next_run;
            
            const calculatedNextRun = calculateNextRun(
              nextRunStr,
              routine.frequency,
              routine.interval,
              routine.week_days
            );

            const nextActivityRef = doc(collection(db, "activities"));
            const nextActivity = {
              title: routine.title,
              description: routine.description || "",
              responsible_id: routine.created_by,
              responsible_name: activityData.responsible_name || "Colaborador",
              project_id: routine.project_id || null,
              project_name: routine.project_name || null,
              routine_id: routine.id,
              type: routine.type || "rotina",
              status: "pendente",
              priority: routine.priority || "media",
              activity_date: nextRunStr,
              start_time_planned: routine.start_time_planned || "",
              end_time_planned: routine.end_time_planned || "",
              hours_planned: routine.hours_planned || 0,
              hours_executed: 0,
              observations: routine.observations || "",
              tags: routine.tags || [],
              created_by: "system-scheduler",
              created_at: now,
              updated_at: now,
            };

            batch.set(nextActivityRef, nextActivity);
            spawnedNextActivity = { id: nextActivityRef.id, ...nextActivity } as unknown as Activity;

            batch.update(routineRef, {
              last_run: nextRunStr,
              next_run: calculatedNextRun,
              updated_at: now,
            });
          }
        }
      }
    } catch (err) {
      console.error("Erro ao gerar a próxima atividade da rotina recorrente:", err);
    }
  }

  await batch.commit();
  return spawnedNextActivity;
}

// Delete an activity
export async function deleteActivity(id: string): Promise<void> {
  const activityRef = doc(db, "activities", id);
  await deleteDoc(activityRef);
}

// Delete multiple activities in a single atomic Write Batch
export async function deleteActivitiesBatch(ids: string[]): Promise<void> {
  const batch = writeBatch(db);
  for (const id of ids) {
    const activityRef = doc(db, "activities", id);
    batch.delete(activityRef);
  }
  await batch.commit();
}

// Import multiple activities in a single atomic Write Batch
export async function importActivitiesBatch(
  activities: Omit<Activity, "id" | "created_at" | "updated_at">[]
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const activitiesCollection = collection(db, "activities");

  for (const activityData of activities) {
    const newActivityRef = doc(activitiesCollection);
    batch.set(newActivityRef, {
      ...activityData,
      created_at: now,
      updated_at: now,
    });
  }

  await batch.commit();
}
