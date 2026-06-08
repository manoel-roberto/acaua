import { describe, it, expect } from "vitest";
import { escapeHtml } from "./sanitize";

describe("escapeHtml", () => {
  it("deve escapar caracteres especiais do HTML", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
    expect(escapeHtml("Hello & Welcome")).toBe("Hello &amp; Welcome");
    expect(escapeHtml('Duas "aspas"')).toBe("Duas &quot;aspas&quot;");
  });

  it("deve retornar string vazia para valores nulos ou indefinidos", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("deve converter e tratar números e booleanos", () => {
    expect(escapeHtml(123)).toBe("123");
    expect(escapeHtml(0)).toBe("0");
    expect(escapeHtml(false)).toBe("false");
  });
});
