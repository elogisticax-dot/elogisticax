- Link para o acesso ao site -> https://app.netlify.com/projects/rainbow-marigold-9813f6/overview
# eLogística — Controle de Lavanderia e Brindes

Aplicação web para controle interno de remessas enviadas à lavanderia e do estoque de brindes e materiais. A interface é em português e os dados são armazenados no Supabase.

## Funcionalidades

### Lavanderia
- Cadastro de itens e suas unidades de medida.
- Registro de saídas com item, quantidade, unidade e data.
- Registro de retorno e conciliação entre quantidade enviada e retornada.
- Acompanhamento de remessas aguardando retorno, atrasadas ou entregues.
- Busca e filtros por item, data de saída e status.
- Indicadores de remessas em aberto, atrasadas e entregues no mês.
- Exportação da conciliação em Excel e PDF.

### Brindes e materiais
- Cadastro de itens e unidades de medida.
- Registro de entradas e saídas do estoque.
- Bloqueio de saídas acima do saldo disponível.
- Inventário com busca e filtros por situação: OK, estoque baixo ou zerado.
- Indicadores de itens cadastrados, quantidade em estoque, estoque baixo e itens zerados.
- Alertas para itens com menos de cinco unidades ou sem estoque.

### Cadastros e acesso
- Login e logout usando autenticação do Supabase.
- Gerenciador para editar ou excluir materiais e gerenciar unidades de medida.
- Confirmação antes de ações destrutivas e notificações na interface.

## Tecnologias e serviços

- HTML, CSS e JavaScript sem framework.
- Supabase JS v2 para autenticação e acesso aos dados.
- SheetJS (XLSX) para exportação em Excel.
- jsPDF e jsPDF-AutoTable para exportação em PDF.
- Fonte Inter carregada do Google Fonts.

As bibliotecas e a fonte são carregadas por CDN no `index.html`, então a aplicação precisa de acesso a esses serviços externos para carregar todos os recursos. O acesso ao Supabase também depende de conexão com a internet.

## Configuração do Supabase

As credenciais do projeto Supabase são declaradas no início de `script.js`, em `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Para usar outro projeto, atualize esses valores com a URL e a chave pública (anon/publishable) correspondentes.

O código consulta as seguintes tabelas e views:

- Tabelas: `unidades_medida`, `lavanderia_itens`, `lavanderia_remessas`, `brindes_itens` e `brindes_movimentacoes`.
- Views: `vw_lavanderia_remessas_status`, `vw_lavanderia_dashboard` e `vw_brindes_estoque`.

Esses objetos precisam existir no banco com os campos utilizados pela aplicação. Configure também as políticas de autenticação e Row Level Security (RLS) para permitir que somente usuários autorizados acessem ou alterem os dados. A chave pública fica no navegador; não coloque uma chave secreta ou `service_role` no código do cliente.

## Arquivos principais

- `index.html`: estrutura da interface, formulários, tabelas, modais e inclusão dos scripts e estilos.
- `styles.css`: estilos visuais e adaptações para telas menores.
- `script.js`: autenticação, chamadas ao Supabase, regras de negócio, renderização e exportações.
- `favicon.svg`: ícone da página.

## Uso

Abra o projeto em um navegador por meio do link https://rainbow-marigold-9813f6.netlify.app/. Faça login com uma conta autorizada do Supabase para carregar os dados e usar os módulos de lavanderia e brindes.
