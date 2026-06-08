import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";

/**
 * Atualiza o limite de dias para arquivamento automático de projetos e atividades concluídas.
 * @param days Quantidade de dias.
 */
export async function updateArchiveDaysLimit(days: number): Promise<void> {
  const metricsRef = doc(db, "metrics", "global");
  await updateDoc(metricsRef, {
    archive_days_limit: days,
    last_updated: new Date().toISOString(),
  });
}
