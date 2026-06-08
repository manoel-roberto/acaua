# Configuração de Deploy (Firebase Hosting & CLI)

## Sistema Acauã · NGD-PGDP-UEFS · 2026

---

## 1. Configuração do Ambiente Local (IDE Antigravity)

Para gerenciar o deploy e os recursos do Firebase a partir do terminal local, siga as instruções abaixo para instalar e autenticar a ferramenta de linha de comando oficial (Firebase CLI).

### 1.1. Instalação do Firebase CLI
Instale globalmente utilizando o gerenciador de pacotes ativo no workspace:

```bash
# Utilizando pnpm (recomendado)
pnpm add -g firebase-tools

# Ou alternativamente via npm
npm install -g firebase-tools
```

### 1.2. Autenticação no Firebase
Autentique o terminal local com a conta do Google vinculada ao projeto do Firebase da UEFS:

```bash
firebase login
```
*Este comando abrirá o navegador para autorizar o acesso da CLI.*

---

## 2. Inicialização do Projeto no Workspace

Na raiz do repositório `/home/manoel/projetos/acaua_old`, execute o comando de setup para vincular os serviços:

```bash
firebase init
```

### Opções a Selecionar no Assistente:
1. **Recursos:** Selecionar `Firestore` e `Hosting: Configure files for Firebase Hosting and (optionally) set up GitHub Actions deploys`.
2. **Project Setup:** Escolher `Use an existing project` e selecione o ID do projeto do Firebase criado para o Acauã.
3. **Firestore Setup:**
   * Rules File: Pressione Enter para aceitar o padrão `firestore.rules`.
   * Indexes File: Pressione Enter para aceitar o padrão `firestore.indexes.json`.
4. **Hosting Setup:**
   * Public Directory: Digite **`out`** (é a pasta padrão gerada pelo Next.js no comando `next build` estático).
   * Configure as single-page app: Digite **`y`** (Sim - isso redireciona todas as rotas para o `index.html`, necessário para rotas estáticas do Next.js).
   * Set up automatic builds and deploys with GitHub: Digite **`n`** (iremos configurar manualmente ou via script customizado).

---

## 3. Arquivos de Configuração Gerados

Após a inicialização, certifique-se de que os arquivos de configuração na raiz do projeto correspondam aos padrões especificados abaixo.

### 3.1. Arquivo: `firebase.json`
Este arquivo instrui o Firebase Hosting a redirecionar rotas e gerenciar cabeçalhos de cache, além de carregar as regras do Firestore.

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "public": "out",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css|woff2|jpg|png|svg|webp)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000, immutable"
          }
        ]
      }
    ]
  }
}
```

### 3.2. Arquivo: `.firebaserc`
Define as associações de projetos locais com os IDs de produção do Firebase.

```json
{
  "projects": {
    "default": "id-do-seu-projeto-firebase-uefs"
  }
}
```

---

## 4. Ajustes no Next.js para Exportação Estática

Modifique a configuração do Next.js para forçar a exportação estática pura.

### 4.1. Arquivo: `next.config.ts`
Certifique-se de habilitar a propriedade `output: 'export'`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Habilita geração estática pura (SPA)
  images: {
    unoptimized: true, // Necessário no modo estático
  },
  distDir: '.next',
};

export default nextConfig;
```

---

## 5. Fluxo de Execução de Build e Deploy

Sempre que realizar alterações no código e desejar atualizar a infraestrutura de produção do Firebase:

### Passo 1: Build Local
Compile o Next.js para gerar os arquivos estáticos compilados na pasta `out`:

```bash
pnpm build
```

### Passo 2: Deploy no Firebase
Faça o upload do build estático e envie as regras de segurança/índices do Firestore em um único comando:

```bash
firebase deploy
```

Se desejar atualizar apenas partes da infraestrutura de forma independente:
```bash
# Apenas arquivos da aplicação web
firebase deploy --only hosting

# Apenas as regras de segurança do Firestore
firebase deploy --only firestore:rules

# Apenas índices do Firestore
firebase deploy --only firestore:indexes
```

---

## 6. Automação de Deploy via GitHub Actions (CI/CD)

Crie o arquivo `.github/workflows/firebase-deploy.yml` para disparar deploys automatizados a cada merge na branch `main`:

```yaml
name: Deploy to Firebase Hosting on Merge

on:
  push:
    branches:
      - main

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 8

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Build Application
        run: pnpm build
        env:
          NEXT_PUBLIC_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
          NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
          NEXT_PUBLIC_FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}

      - name: Deploy to Firebase Hosting
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          projectId: id-do-seu-projeto-firebase-uefs
          channelId: live
```
