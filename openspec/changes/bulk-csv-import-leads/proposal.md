## Why

Hoje não existe nenhuma forma de importar contatos e empresas em massa para o CRM — cada registro precisa ser criado manualmente na UI. Isso bloqueia o primeiro caso de uso real: carregar os ~98 contatos feitos no Web Summit Lisboa 2026 e começar a trabalhar essa lista como pipeline de vendas da Highdome. O CRM também não tem hoje como distinguir, no campo "Account type", contatos que são concorrentes diretos ou investidores (só existem Prospect/Customer/Partner/Churned), nem campos para registrar o idioma do contato, o evento de origem, a mensagem de abordagem recebida e a mensagem de abordagem sugerida — informações necessárias para trabalhar uma lista de leads vinda de um evento.

## What Changes

- Novo procedimento de importação em massa via CSV para Companies e Contacts (`companies.import` / `contacts.import`), com relatório de dry-run antes de gravar e deduplicação por `domain` (Company) e `email` (Contact), reutilizando os invariantes já existentes no schema.
- Registros criados pela importação são marcados com `recordSource = IMPORT`.
- Dois novos valores adicionados ao `FieldDefinition` "Account type" (`COMPANY`, tipo `SELECT`): **Competitor** e **Investor**, complementando Prospect/Customer/Partner/Churned já seedados.
- Quatro novos Custom Fields seedados no registry de propriedades:
  - **Idioma** (`SELECT`, ex.: PT/EN/ES)
  - **Evento de origem** (`SELECT` ou `TEXT`, ex.: "Web Summit Lisboa 2026")
  - **Mensagem gancho** (`LONG_TEXT`) — texto recebido do contato na mensagem de conexão
  - **Abordagem sugerida** (`LONG_TEXT`) — mensagem de abordagem em português sugerida para a Highdome usar com aquele contato
- Carga inicial de dados: os 98 contatos do Web Summit Lisboa 2026 classificados e preparados em CSV, usando o novo importador e os novos campos.

## Capabilities

### New Capabilities
- `leads-import`: importação em massa de Companies e Contacts via CSV, com dry-run, deduplicação e marcação de origem do registro.
- `contact-company-fields`: valores adicionais de Account type (Competitor, Investor) e novos custom fields (Idioma, Evento de origem, Mensagem gancho, Abordagem sugerida) no registry de propriedades de Company/Contact.

### Modified Capabilities
(nenhuma — não há specs existentes para capacidades deste repositório ainda)

## Impact

- `apps/api/src/*` — novos routers/procedures tRPC de importação (`companies.import`, `contacts.import`), validação de CSV, relatório de dry-run.
- `packages/db/prisma/seed.ts` — adição dos valores "Competitor"/"Investor" ao `FieldDefinition` "Account type" e seed dos quatro novos custom fields.
- `packages/db` — nenhuma migração de schema é necessária (os novos campos usam o sistema já existente de `FieldDefinition`/`FieldOption`/`FieldValue`); apenas dados de seed.
- `apps/app/*` — tela/fluxo de importação (upload do CSV, preview do dry-run, confirmação).
- Dado de carga inicial: CSV com os 98 contatos do Web Summit Lisboa 2026, classificados por Account type, idioma, mensagem gancho e abordagem sugerida.
