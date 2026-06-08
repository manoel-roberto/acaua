/**
 * Escapa caracteres HTML especiais para mitigar injeção de HTML e XSS.
 * Caso o valor de entrada seja null ou undefined, retorna string vazia.
 * Para outros tipos de dados, converte-os em string e aplica o escape.
 */
export function escapeHtml(str: any): string {
  if (str === null || str === undefined) {
    return "";
  }
  const stringValue = String(str);
  return stringValue
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
