## Context

Ver `proposal.md` - Why. O CRM já tem o modelo de dados e os invariantes necessários (`Company.domain` único, `Contact.email` único, `recordSource` enum incluindo `IMPORT`, sistema de custom fields via `FieldDefinition`/`FieldOption`/`FieldValue` seedado em `packages/db/prisma/seed.ts`). O que falta é (1) o caminho de entrada em massa — hoje só existe criação registro a registro pela UI — e (2) os valores/campos de registry específicos para trabalhar uma lista de leads de evento. `docs/crm-plan.md` já previa um importador CSV como Fase 10; este change adianta apenas a parte de importação de Companies/Contacts (sem a parte de Deals/associações rotuladas em múltiplos arquivos, que a Fase 10 original também cobre).

## Goals / Non-Goals

**Goals:**
- Permitir carregar um CSV de Companies e/ou Contacts com segurança (dry-run antes de gravar).
- Reaproveitar os invariantes de deduplicação já existentes no schema (`domain`, `email` únicos) em vez de criar uma lógica de dedupe paralela.
- Disponibilizar os valores/campos de registry necessários para classificar e trabalhar os 98 contatos do Web Summit como primeira carga real.

**Non-Goals:**
- Importação de Deals ou de associações rotuladas vindas de múltiplos arquivos (isso é o restante da Fase 10 original em `docs/crm-plan.md`, fora de escopo aqui).
- Importação a partir do formato de exportação do HubSpot (mapeamento de `assesment-source` etc.) - fora de escopo; este change trata de um CSV em formato próprio.
- UI de administração de custom fields (criar/editar campos pela tela) - os novos campos deste change são seedados, não criados via UI.

## Decisions

**Dry-run como chamada separada, não como flag na gravação.** O procedimento de importação expõe duas chamadas: `import.preview` (lê o CSV, valida, retorna o relatório, não grava nada) e `import.commit` (recebe o mesmo payload validado + uma confirmação, grava). Alternativa considerada: uma única chamada com `dryRun: boolean` — rejeitada porque mistura validação e efeito colateral na mesma assinatura e dificulta reexibir o relatório antes de confirmar.

**Dedupe delega para os invariantes do schema, não para uma verificação manual prévia.** O serviço de importação tenta um `upsert` por `domain` (Company) / `email` (Contact) linha a linha. Alternativa considerada: fazer uma consulta de verificação antes de decidir create vs update — rejeitada por duplicar lógica que o `@unique` do Prisma já garante de forma atômica; o relatório de dry-run usa uma consulta de leitura (`findMany` pelos domains/emails do CSV) apenas para informar ao usuário o que vai acontecer, não para decidir o que vai acontecer.

**Novos valores de Account type e novos custom fields são seed, não migração de schema.** Seguindo o padrão já estabelecido em `seedCompanyFields`/`upsertField` (`packages/db/prisma/seed.ts`), os dois novos valores de "Account type" entram como `FieldOption` adicionais, e os quatro novos campos (Idioma, Evento de origem, Mensagem gancho, Abordagem sugerida) entram como novos `FieldDefinition` com `source = CUSTOM`. Nenhuma migração Prisma é necessária.

**Correção em relação ao plano original (`docs/crm-plan.md`): não existe tabela de associação Company↔Contact.** O schema Prisma real (`packages/db/prisma/schema.prisma`) usa `Contact.companyId` como FK direta (um Contact pertence a, no máximo, uma Company) — não há `CompanyContact` nem associação muitos-para-muitos. A importação simplesmente grava `companyId` no Contact ao criar/atualizar, sem join table.

**"Evento de origem" é SELECT com vocabulário administrado, não TEXT livre.** A proposta deixava `SELECT ou TEXT` em aberto; na implementação optei por `SELECT` (com "Web Summit Lisboa 2026" seedado como primeira opção) e `showOnFilter: true`, pelo mesmo motivo que o `AssociationLabel` do próprio projeto já é um vocabulário administrado em vez de texto livre: evita "Web Summit Lisboa 2026" vs "Web Summit 2026" como duas strings diferentes, e é o único jeito de aparecer na barra de filtro (`FieldsService.filterableFieldsFor` só considera `SELECT`/`USER`). "Idioma" também ganhou `showOnFilter: true` pelo mesmo motivo. Custo: importar um evento novo exige primeiro cadastrar a opção em Settings → Properties — aceitável, é o mesmo fluxo que outros campos `SELECT` administrados já seguem neste projeto.

**Entidade dos novos custom fields.** "Idioma", "Mensagem gancho" e "Abordagem sugerida" são campos de `CONTACT` (são atributos da pessoa, não da empresa). "Evento de origem" é um campo de `CONTACT` também, para poder registrar que dois contatos da mesma empresa vieram de eventos diferentes - decisão simples: um custom field por entidade, sem duplicar em Company.

**Linhas rejeitadas invalidam a importação inteira, não apenas a linha.** Alinhado ao requirement "Linha com coluna desconhecida" na spec: falha cedo e de forma visível, em vez de importar parcialmente um CSV mal formatado e deixar o usuário descobrir depois o que faltou. Isso é seguro para o volume esperado (dezenas a poucas centenas de linhas por importação).

**Parsing do CSV acontece no cliente, não no backend, com um parser próprio em vez de uma dependência nova.** O frontend lê o arquivo e usa um parser RFC4180 minimalista escrito para este change (`apps/app/lib/csv.ts`) para transformar o CSV em linhas (`Record<string,string>`), que são as que chegam a `import.preview`/`import.commit`. Alternativa considerada: adicionar `papaparse` — rejeitada porque exigiria uma instalação de pacote (e de `@types/papaparse`) sem necessidade real: um parser RFC4180 com aspas e escaping de vírgula/quebra de linha é pequeno e totalmente testável, e isola o import de uma dependência externa para um caso de uso único.

**Correção adicional: não há RBAC/`PermissionsMiddleware` neste codebase.** É uma ferramenta interna single-tenant; todo router usa apenas `AuthMiddleware` (qualquer usuário autenticado pode escrever). Os novos procedures seguem o mesmo padrão — não existe uma permissão mais granular de "readonly" para aplicar.

## Risks / Trade-offs

- [Risco] Falhar a importação inteira por uma única coluna desconhecida pode ser frustrante em CSVs grandes com um erro de digitação no cabeçalho. → Mitigação: a mensagem de erro do dry-run lista exatamente as colunas não reconhecidas, permitindo corrigir o CSV e reenviar sem precisar adivinhar.
- [Risco] Upsert por `domain`/`email` pode sobrescrever silenciosamente um valor preenchido manualmente por um vendedor, se o CSV trouxer esse campo vazio ou diferente. → Mitigação: segue a mesma regra de custom fields já definida no projeto (string vazia limpa, campo ausente no payload não altera); o relatório de dry-run mostra os campos que serão alterados em um registro existente antes da confirmação.
- [Trade-off] Dedupe automática por `domain`/`email` sem tela de revisão campo a campo (como um merge assistido) é mais simples de implementar, mas não resolve o caso em que duas linhas do mesmo CSV disputam o mesmo domain com dados diferentes. → Aceito para este change; a segunda linha com o mesmo domain dentro do mesmo CSV é tratada como atualização sequencial da primeira, documentado no relatório de dry-run.

## Migration Plan

1. Seed: adicionar "Competitor"/"Investor" a `ACCOUNT_TYPES` e os quatro novos campos em `packages/db/prisma/seed.ts`; rodar `bun run db:seed` em desenvolvimento/staging antes de habilitar a importação em produção.
2. Backend: novos procedimentos tRPC `import.preview` / `import.commit` em `apps/api`.
3. Frontend: tela simples de upload + preview do dry-run + confirmação em `apps/app`.
4. Primeira carga real: CSV classificado dos 98 contatos do Web Summit Lisboa 2026 importado via o novo fluxo, validando o caminho de ponta a ponta.
5. Rollback: a importação não altera schema; remover os procedimentos tRPC e a tela é suficiente para desfazer a feature. Os `FieldOption`/`FieldDefinition` de seed podem ficar (não têm custo e não quebram nada se não forem usados).
