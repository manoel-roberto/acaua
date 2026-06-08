/* eslint-disable */
const admin = require("firebase-admin");

// Helper to get local date in America/Bahia (UTC-3)
function getLocalDateString() {
  const d = new Date();
  const offsetTime = d.getTime() - (3 * 60 * 60 * 1000); 
  const localDate = new Date(offsetTime);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(localDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Calculate the next execution date
function calculateNextRun(currentDateStr, frequency, interval, weekDays) {
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
      
      function getStartOfWeek(d) {
        const temp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const dayOfWeek = temp.getDay();
        temp.setDate(temp.getDate() - dayOfWeek);
        return temp;
      }
      
      const originalWeekStart = getStartOfWeek(originalDate);
      let found = false;
      let loops = 0;
      
      while (!found && loops < 1000) {
        loops++;
        date.setDate(date.getDate() + 1);
        const dayOfWeek = date.getDay();
        if (weekDays.includes(dayOfWeek)) {
          const candidateWeekStart = getStartOfWeek(date);
          const diffTime = Math.abs(candidateWeekStart - originalWeekStart);
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

async function run() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  if (emulatorHost) {
    console.log(`Rodando em ambiente de emulador: ${emulatorHost}`);
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: "acaua-web",
      });
    }
  } else {
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountVar) {
      console.error("ERRO: Variável de ambiente FIREBASE_SERVICE_ACCOUNT não encontrada.");
      process.exit(1);
    }
    const serviceAccount = JSON.parse(serviceAccountVar);
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  }

  const db = admin.firestore();
  const todayStr = getLocalDateString();
  console.log(`Processando rotinas recorrentes para hoje: ${todayStr}`);

  try {
    // 1. Fetch active recurring routines
    const routinesSnapshot = await db
      .collection("recurring_routines")
      .where("active", "==", true)
      .get();

    let routinesProcessedCount = 0;

    for (const routineDoc of routinesSnapshot.docs) {
      const routine = routineDoc.data();
      const nextRunStr = routine.next_run;

      // Routine is due if next_run <= today
      if (nextRunStr && nextRunStr <= todayStr) {
        console.log(`A rotina "${routine.title}" está agendada para ${nextRunStr}. Executando...`);

        // Fetch the creator's profile to retrieve their full name
        let responsibleName = "Sistema Acauã";
        try {
          const profileDoc = await db.collection("profiles").doc(routine.created_by).get();
          if (profileDoc.exists) {
            responsibleName = profileDoc.data().full_name || "Colaborador";
          }
        } catch (e) {
          console.warn(`Aviso: não foi possível carregar o perfil do criador ${routine.created_by}.`);
        }

        const batch = db.batch();
        const nowIso = new Date().toISOString();

        // 2. Create the spawned activity
        const activityRef = db.collection("activities").doc();
        const newActivity = {
          title: routine.title,
          description: routine.description || "",
          responsible_id: routine.created_by,
          responsible_name: responsibleName,
          project_id: routine.project_id || null,
          project_name: routine.project_name || null,
          routine_id: routineDoc.id,
          type: routine.type || "rotina",
          status: "pendente",
          priority: routine.priority || "media",
          activity_date: nextRunStr, // Set activity date to the target scheduled date
          start_time_planned: routine.start_time_planned || "",
          end_time_planned: routine.end_time_planned || "",
          hours_planned: routine.hours_planned || 0,
          hours_executed: 0,
          observations: routine.observations || "",
          tags: routine.tags || [],
          created_by: "system-scheduler",
          created_at: nowIso,
          updated_at: nowIso
        };

        batch.set(activityRef, newActivity);

        // 3. Compute new next_run date
        const calculatedNextRun = calculateNextRun(
          nextRunStr,
          routine.frequency,
          routine.interval,
          routine.week_days
        );

        console.log(`Calculado próximo agendamento para "${routine.title}": ${calculatedNextRun}`);

        // 4. Update routine status
        const routineRef = db.collection("recurring_routines").doc(routineDoc.id);
        batch.update(routineRef, {
          last_run: nextRunStr,
          next_run: calculatedNextRun,
          updated_at: nowIso
        });

        // Commit execution batch
        await batch.commit();
        routinesProcessedCount++;
        console.log(`Rotina "${routine.title}" executada com sucesso.`);
      }
    }

    console.log(`Fim do processamento. Total de rotinas executadas hoje: ${routinesProcessedCount}`);
    
  } catch (error) {
    console.error("Erro durante o processamento de rotinas recorrentes:", error);
    process.exit(1);
  }
}

run();
