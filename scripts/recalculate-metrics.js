/* eslint-disable */
const admin = require("firebase-admin");

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

  console.log("Iniciando recalculo de métricas globais...");

  try {
    // 1. Fetch projects
    const projectsSnapshot = await db.collection("projects").where("archived", "==", false).get();
    let projectsActive = 0;
    let projectsDone = 0;
    let projectsPaused = 0;
    let projectsBlocked = 0;
    let totalProgress = 0;
    let projectsWithProgressCount = 0;

    projectsSnapshot.forEach((doc) => {
      const data = doc.data();
      const status = data.status;

      if (status === "em_andamento") projectsActive++;
      else if (status === "concluido") projectsDone++;
      else if (status === "pausado") projectsPaused++;
      else if (status === "bloqueado") projectsBlocked++;

      if (status !== "cancelado") {
        totalProgress += data.progress || 0;
        projectsWithProgressCount++;
      }
    });

    const avgProgress = projectsWithProgressCount > 0 ? totalProgress / projectsWithProgressCount : 0;

    // 2. Calculate expected monthly hours based on active users' weekly hours
    const profilesSnapshot = await db.collection("profiles").where("active", "==", true).get();
    let totalWeeklyExpectedHours = 0;
    profilesSnapshot.forEach((doc) => {
      totalWeeklyExpectedHours += doc.data().carga_horaria || 0;
    });
    // Expected monthly hours estimated by multiplying weekly hours by 4 weeks
    const expectedHoursMonth = totalWeeklyExpectedHours * 4;

    // 3. Calculate total hours logged in the current month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    
    const logsSnapshot = await db
      .collection("time_logs")
      .where("log_date", ">=", firstDayOfMonth)
      .get();

    let totalHoursMonth = 0;
    logsSnapshot.forEach((doc) => {
      totalHoursMonth += doc.data().hours || 0;
    });

    // 4. Calculate Productivity and Idleness percentages
    const productivityPct = expectedHoursMonth > 0 ? Math.min((totalHoursMonth / expectedHoursMonth) * 105, 100) : 0;
    const idlenessPct = Math.max(100 - productivityPct, 0);

    const metricsGlobal = {
      projects_active: projectsActive,
      projects_done: projectsDone,
      projects_paused: projectsPaused,
      projects_blocked: projectsBlocked,
      avg_progress: Number(avgProgress.toFixed(2)),
      total_hours_month: Number(totalHoursMonth.toFixed(2)),
      expected_hours_month: expectedHoursMonth || 160, // Fallback if no users defined yet
      productivity_pct: Number(productivityPct.toFixed(2)),
      idleness_pct: Number(idlenessPct.toFixed(2)),
      last_updated: new Date().toISOString(),
    };

    console.log("Métricas recalculadas com sucesso:", metricsGlobal);

    // 5. Update metrics/global document in Firestore
    await db.collection("metrics").doc("global").set(metricsGlobal, { merge: true });
    console.log("Documento /metrics/global atualizado no Firestore.");
    
  } catch (error) {
    console.error("Erro durante a execução do script:", error);
    process.exit(1);
  }
}

run();
