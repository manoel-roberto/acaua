# SPEC — Sistema Acauã (Firebase Edition)

## Plataforma de Gestão Operacional e Estratégica do NGD
### PGDP — Universidade Estadual de Feira de Santana · 2026

---

## 1. Visão Geral e Objetivos

O **Acauã** é migrado e consolidado sob uma infraestrutura **100% Serverless baseada exclusivamente na plataforma Firebase (Spark Plan · Free Tier)**. Esta arquitetura visa centralizar o controle de demandas, acompanhamento de projetos, mensuração de horas e indicadores da equipe do Núcleo de Gestão de Dados (NGD) com custo zero de infraestrutura de nuvem, mantendo altos níveis de performance, segurança e capacidade offline.

### Objetivos da Consolidação:
1. **Unificação Tecnológica:** Descartar as propostas anteriores de Supabase, Vercel ou Google Sheets/Apps Script, unificando o ecossistema na plataforma Firebase.
2. **Hospedagem e Execução (Firebase Hosting):** Hospedar a aplicação Next.js estática ou otimizada no Firebase Hosting.
3. **Persistência NoSQL (Cloud Firestore):** Modelar o armazenamento e consulta de dados no Firestore utilizando estratégias de agregação para respeitar os limites operacionais.
4. **Governança de Autenticação (Firebase Auth):** Restringir o acesso a e-mails institucionais do domínio `@uefs.br` através do Google Identity Provider.
5. **Automações e Scraping Desacoplados:** Utilizar pipelines do GitHub Actions juntamente com o Firebase Admin SDK para alimentar o banco de dados sem ultrapassar as barreiras de rede do Spark Plan.

---

## 2. Limitações e Políticas do Plano Gratuito (Spark Plan)

Para operar de forma sustentável e sem custos transacionais, o Acauã deve ser estruturado de modo a respeitar estritamente os limites do plano gratuito do Firebase.

### 2.1. Cloud Firestore (Banco de Dados NoSQL)
* **Limite de Leituras:** 50.000 documentos lidos por dia.
* **Limite de Escritas:** 20.000 documentos criados ou atualizados por dia.
* **Limite de Exclusões:** 20.000 documentos excluídos por dia.
* **Armazenamento de Dados:** 1 GiB total de dados armazenados.
* **Largura de Banda de Rede:** 10 GiB de saída de rede por mês.
* **Conexões Simultâneas:** Até 1.000 conexões simultâneas móveis/web ativas ao mesmo tempo.

### 2.2. Firebase Hosting (Hospedagem Web)
* **Espaço de Armazenamento:** 10 GiB total para os arquivos estáticos do build.
* **Transferência de Dados:** 360 MiB/dia (aproximadamente 10 GiB/mês). 
* **SSL Gratuito:** Incluso e ativado por padrão.
* **Domínio Customizado:** Suporte para apontamento de subdomínios (ex: `acaua.uefs.br`) sem custo.

### 2.3. Firebase Authentication (Identidade e Acesso)
* **Usuários Ativos Mensais (MAU):** Até 50.000 contas ativas por mês (Google Identity Platform).
* **Autenticação de Email/Senha & OAuth (Google):** Totalmente gratuita e ilimitada para o escopo do projeto.

### 2.4. Cloud Functions (Serviço Serverless de Back-end)
* **ATENÇÃO:** O deploy de Cloud Functions no Node.js **requer obrigatoriamente a ativação do plano Blaze (Pay-as-you-go)**. Embora o plano Blaze possua uma cota gratuita generosa, a política de cobrança exige um cartão de crédito cadastrado.
* **Regra de Projeto:** **Não utilizar Cloud Functions**. Toda a lógica que necessita de privilégios administrativos ou de rede irrestrita para acessar APIs externas (como a raspagem diária do Diário Oficial - DOE-BA) deve ser transferida para **GitHub Actions** usando scripts Node.js ou Python com o `firebase-admin` SDK.

### 2.5. Cloud Storage (Armazenamento de Arquivos)
* **Armazenamento:** 5 GiB total.
* **Download (Saída):** 1 GiB por dia.
* **Upload:** 20.000 operações de upload por dia.

---

## 3. Estratégia de Mitigação contra Excedentes de Cota

Para garantir que o Acauã permaneça inteiramente sob o Spark Plan, o design da aplicação adota cinco diretrizes de engenharia de software:

1. **Persistência Local e Cache Agressivo:** O SDK do Firestore na web será inicializado com persistência offline (`enableIndexedDbPersistence`). Consultas subsequentes serão lidas do IndexedDB local do navegador do usuário, sincronizando apenas as modificações no banco de dados.
2. **Dashboard Pré-Calculado (Consolidação):** Em vez de calcular métricas de produtividade lendo todos os históricos e registros de horas em tempo real a cada carregamento de página (gerando centenas de leituras de documentos por acesso), os indicadores serão agregados e consolidados em um documento centralizado (`metrics/global`), atualizado via triggers de gravação ou workers diários.
3. **Paginação Estrita em Listagens:** Telas de listagem de atividades e projetos utilizarão paginação forçada de no máximo 25 itens por página para evitar leituras em lote desnecessárias.
4. **Resumos de Histórico (Archival Pattern):** Time logs com mais de 90 dias serão consolidados em arquivos de histórico consolidados por mês e perfil do colaborador, permitindo limpar registros detalhados do Firestore para economizar armazenamento de dados.
5. **Execução Local e Workers Externos:** Integrações com serviços de terceiros e bots de scraping (como DOE-BA) não rodam no Firebase. GitHub Actions agendadas via cron realizam o trabalho pesado de rede e gravam os dados estruturados diretamente no Firestore através do SDK de administração, consumindo apenas cotas de escrita.
