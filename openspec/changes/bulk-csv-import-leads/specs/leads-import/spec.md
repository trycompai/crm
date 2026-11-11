## Purpose

Permite carregar Companies e Contacts em massa a partir de um arquivo CSV, com verificação prévia (dry-run) e deduplicação, em vez de exigir criação manual registro a registro na UI.

## ADDED Requirements

### Requirement: Importação de Companies e Contacts via CSV
O sistema SHALL aceitar o upload de um arquivo CSV contendo linhas de Company e/ou Contact e criar os registros correspondentes, mapeando colunas do CSV para os campos nativos de Company (`name`, `domain`, `industry`, `country`, `countryCode`) e de Contact (`firstName`, `lastName`, `email`, `title`, `linkedinUrl`).

#### Scenario: Importação de um CSV válido
- **WHEN** um usuário autorizado envia um CSV com colunas reconhecidas de Company e Contact
- **THEN** o sistema cria um registro de Company e/ou Contact para cada linha válida, associando o Contact à sua Company quando ambos estiverem presentes na mesma linha

#### Scenario: Linha com coluna desconhecida
- **WHEN** o CSV contém uma coluna que não corresponde a nenhum campo nativo nem a nenhum custom field existente
- **THEN** o sistema rejeita a importação inteira e informa quais colunas não foram reconhecidas, sem gravar nenhum registro

### Requirement: Relatório de dry-run antes da gravação
O sistema SHALL processar o CSV em modo de simulação (dry-run) e apresentar um relatório — quantos registros serão criados, quantos serão ignorados por duplicidade, e quaisquer erros de linha — antes de qualquer gravação definitiva no banco de dados.

#### Scenario: Usuário revisa o relatório antes de confirmar
- **WHEN** um usuário envia um CSV para importação
- **THEN** o sistema retorna um relatório de dry-run sem gravar nenhum registro, e só executa a gravação definitiva após uma confirmação explícita do usuário referenciando esse mesmo dry-run

### Requirement: Deduplicação por domain e email
O sistema SHALL tratar `Company.domain` e `Contact.email` como chaves de deduplicação durante a importação: uma linha cujo domain/email já existir no banco SHALL atualizar o registro existente em vez de criar um duplicado, e o relatório de dry-run SHALL indicar explicitamente quais linhas serão tratadas como atualização.

#### Scenario: Linha duplicada por domain
- **WHEN** o CSV contém uma Company cujo `domain` já existe no banco
- **THEN** o sistema não cria uma nova Company; em vez disso, marca a linha como atualização no relatório de dry-run e, após confirmação, atualiza os campos informados na Company existente

#### Scenario: Linha duplicada por email
- **WHEN** o CSV contém um Contact cujo `email` já existe no banco
- **THEN** o sistema não cria um novo Contact; em vez disso, marca a linha como atualização no relatório de dry-run e, após confirmação, atualiza os campos informados no Contact existente

### Requirement: Origem do registro marcada como importação
O sistema SHALL marcar `recordSource = IMPORT` em toda Company e todo Contact criados por este fluxo de importação, preservando o `recordSource` original de registros que já existiam e foram apenas atualizados.

#### Scenario: Novo registro criado pela importação
- **WHEN** uma linha do CSV resulta na criação de uma nova Company ou Contact
- **THEN** o registro criado tem `recordSource = IMPORT`

#### Scenario: Registro existente atualizado pela importação
- **WHEN** uma linha do CSV resulta na atualização de uma Company ou Contact já existente
- **THEN** o `recordSource` original do registro não é alterado
