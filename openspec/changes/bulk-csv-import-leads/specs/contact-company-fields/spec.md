## Purpose

Amplia o registro de propriedades de Company/Contact com os valores e campos necessários para trabalhar uma lista de leads vinda de um evento: tipos de relacionamento comercial além de cliente (concorrente, investidor) e o contexto de origem e abordagem de cada contato.

## ADDED Requirements

### Requirement: Account type reconhece Competitor e Investor
O campo `FieldDefinition` "Account type" (entidade `COMPANY`, tipo `SELECT`) SHALL incluir os valores **Competitor** e **Investor**, além dos valores já existentes (Prospect, Customer, Partner, Churned), disponíveis para seleção em qualquer Company.

#### Scenario: Selecionar Competitor como Account type
- **WHEN** um usuário edita o campo "Account type" de uma Company
- **THEN** as opções "Competitor" e "Investor" aparecem na lista de valores possíveis, junto com Prospect, Customer, Partner e Churned

#### Scenario: Filtrar Companies por Competitor
- **WHEN** um usuário filtra a lista de Companies por Account type = "Competitor"
- **THEN** o sistema retorna apenas as Companies com esse valor definido

### Requirement: Custom field Idioma
O sistema SHALL oferecer um custom field "Idioma" (tipo `SELECT`) disponível para Contact, com opções cobrindo pelo menos português, inglês e espanhol, usado para registrar o idioma de comunicação preferido daquele contato.

#### Scenario: Definir idioma de um contato
- **WHEN** um usuário define o campo "Idioma" de um Contact como "Português"
- **THEN** o valor é salvo e exibido na ficha do Contact e disponível como filtro na listagem de Contacts

### Requirement: Custom field Evento de origem
O sistema SHALL oferecer um custom field "Evento de origem" disponível para Company e/ou Contact, usado para registrar em qual evento o relacionamento com aquele contato começou (ex.: "Web Summit Lisboa 2026").

#### Scenario: Registrar evento de origem na importação
- **WHEN** um lote de Contacts é criado a partir de uma importação associada a um evento
- **THEN** cada Contact criado tem o custom field "Evento de origem" preenchido com o nome do evento

### Requirement: Custom field Mensagem gancho
O sistema SHALL oferecer um custom field "Mensagem gancho" (tipo `LONG_TEXT`) disponível para Contact, usado para registrar o texto que o próprio contato enviou ao solicitar a conexão/relacionamento, quando existir.

#### Scenario: Contato com mensagem recebida
- **WHEN** um Contact é criado e o CSV de origem traz uma mensagem de solicitação de conexão para aquela linha
- **THEN** o texto da mensagem é salvo no custom field "Mensagem gancho" desse Contact

#### Scenario: Contato sem mensagem recebida
- **WHEN** um Contact é criado e não há mensagem de solicitação de conexão associada
- **THEN** o custom field "Mensagem gancho" permanece vazio, sem bloquear a criação do registro

### Requirement: Custom field Abordagem sugerida
O sistema SHALL oferecer um custom field "Abordagem sugerida" (tipo `LONG_TEXT`) disponível para Contact, usado para registrar a mensagem de abordagem recomendada para a equipe comercial usar com aquele contato.

#### Scenario: Consultar abordagem sugerida antes do primeiro contato
- **WHEN** um usuário abre a ficha de um Contact que tem o custom field "Abordagem sugerida" preenchido
- **THEN** o texto da abordagem sugerida é exibido na seção de propriedades desse Contact
