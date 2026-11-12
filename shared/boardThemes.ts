/**
 * Catálogo de temas de quadro (segmentos de negócio).
 *
 * Fonte única usada pelo servidor (validação) e pelo cliente (telas).
 * Para adicionar um segmento novo basta acrescentar uma entrada em
 * BOARD_THEMES: nenhuma tabela precisa mudar, porque o quadro guarda só a
 * chave do tema (boards.theme) e ajustes próprios (boards.settings).
 *
 * O tema NUNCA altera cartões: ele define sugestões de fluxo, campos,
 * categorias e indicadores que as telas passam a oferecer.
 */

export type ThemeFieldType = "text" | "select" | "date" | "number";

export interface ThemeField {
  /** Nome gravado em card_custom_fields.field_name (estável: não renomear). */
  key: string;
  label: string;
  type: ThemeFieldType;
  options?: string[];
  /** Opções vêm de uma lista editável em boards.settings (ex.: ferramentas). */
  optionsFromSetting?: BoardSettingListKey;
}

export interface ThemeEditableList {
  key: BoardSettingListKey;
  label: string;
  help: string;
  /** Apenas exemplos iniciais; o usuário edita livremente. */
  examples: string[];
}

export interface BoardTheme {
  key: BoardThemeKey;
  name: string;
  description: string;
  /** Chave de ícone resolvida no cliente (client/src/lib/themeIcons.tsx). */
  icon: string;
  palette: { primary: string; secondary: string };
  /** Características mostradas no seletor de tema. */
  features: string[];
  /** Fluxo Kanban sugerido (listas). */
  lists: string[];
  categories: string[];
  /** Classificações próprias do segmento (severidade, tipo de tarefa...). */
  classifications: { label: string; options: string[] }[];
  fields: ThemeField[];
  /** Indicadores previstos para o painel do segmento (Fase 3). */
  indicators: string[];
  /** Automações previstas (Fase 4). */
  automations: string[];
  editableLists: ThemeEditableList[];
}

export const BOARD_THEME_KEYS = ["general", "ecommerce", "crm", "siem", "dev"] as const;
export type BoardThemeKey = (typeof BOARD_THEME_KEYS)[number];

export const BOARD_SETTING_LIST_KEYS = ["detectionTools", "marketplaces", "leadSources", "environments"] as const;
export type BoardSettingListKey = (typeof BOARD_SETTING_LIST_KEYS)[number];

/** Ajustes por quadro guardados em boards.settings (jsonb). */
export type BoardSettings = Partial<Record<BoardSettingListKey, string[]>>;

export const DEFAULT_THEME: BoardThemeKey = "general";

export const BOARD_THEMES: Record<BoardThemeKey, BoardTheme> = {
  general: {
    key: "general",
    name: "Geral",
    description: "Quadro livre, sem especialização. Indicado para tarefas do dia a dia.",
    icon: "layout",
    palette: { primary: "#00d9ff", secondary: "#3b82f6" },
    features: ["Listas e cartões livres", "Checklists, etiquetas e anexos", "Sem campos obrigatórios"],
    lists: ["A fazer", "Em andamento", "Concluído"],
    categories: [],
    classifications: [],
    fields: [],
    indicators: ["Tarefas concluídas", "Tarefas pendentes", "Tarefas atrasadas"],
    automations: [],
    editableLists: [],
  },

  ecommerce: {
    key: "ecommerce",
    name: "E-commerce",
    description: "Operação de loja virtual: produtos, estoque, pedidos, logística e campanhas.",
    icon: "cart",
    palette: { primary: "#f59e0b", secondary: "#ef4444" },
    features: ["Fluxo com validação e aprovação", "Campos de produto, SKU e pedido", "Indicadores de pedidos, estoque e devoluções"],
    lists: ["Backlog", "Planejamento", "Em execução", "Aguardando validação", "Aguardando aprovação", "Concluído"],
    categories: [
      "Cadastro de produtos", "Gestão de estoque", "Integração de marketplaces", "Pedidos", "Faturamento",
      "Logística", "Entregas", "Devoluções", "Atendimento", "Marketing", "Campanhas", "Melhorias da plataforma",
    ],
    classifications: [{ label: "Prioridade", options: ["Baixa", "Média", "Alta", "Crítica"] }],
    fields: [
      { key: "Produto", label: "Produto", type: "text" },
      { key: "SKU", label: "SKU", type: "text" },
      { key: "Pedido relacionado", label: "Pedido relacionado", type: "text" },
      { key: "Marketplace", label: "Marketplace", type: "select", optionsFromSetting: "marketplaces" },
      { key: "Categoria", label: "Categoria", type: "select" },
      { key: "Valor envolvido", label: "Valor envolvido (R$)", type: "number" },
      { key: "Cliente relacionado", label: "Cliente relacionado", type: "text" },
      { key: "Link externo", label: "Link externo", type: "text" },
    ],
    indicators: [
      "Pedidos pendentes", "Atividades de estoque", "Problemas de integração", "Devoluções em andamento",
      "Pendências logísticas", "Campanhas em execução", "Tarefas atrasadas", "Tempo médio de resolução",
    ],
    automations: [
      "Notificar responsáveis sobre pedidos com pendências", "Alertar sobre atividades próximas do vencimento",
      "Escalar problemas críticos", "Criar tarefas recorrentes de conferência de estoque",
      "Notificar quando uma atividade depender de aprovação",
    ],
    editableLists: [
      {
        key: "marketplaces",
        label: "Marketplaces",
        help: "Canais de venda que aparecem no campo Marketplace dos cartões.",
        examples: ["Loja própria", "Mercado Livre", "Amazon", "Shopee"],
      },
    ],
  },

  crm: {
    key: "crm",
    name: "CRM",
    description: "Relacionamento comercial: leads, oportunidades, propostas e pós-venda.",
    icon: "handshake",
    palette: { primary: "#22c55e", secondary: "#14b8a6" },
    features: ["Funil do lead ao fechamento", "Campos de contato, valor e probabilidade", "Indicadores de pipeline e conversão"],
    lists: ["Novo lead", "Qualificação", "Primeiro contato", "Em negociação", "Proposta enviada", "Aguardando retorno", "Ganho", "Perdido"],
    categories: ["Prospecção", "Leads", "Contatos", "Oportunidades", "Negociação", "Propostas", "Reuniões", "Follow-up", "Pós-venda", "Retenção"],
    classifications: [{ label: "Prioridade", options: ["Baixa", "Média", "Alta"] }],
    fields: [
      { key: "Nome do cliente", label: "Nome do cliente", type: "text" },
      { key: "Empresa", label: "Empresa", type: "text" },
      { key: "E-mail", label: "E-mail", type: "text" },
      { key: "Telefone", label: "Telefone", type: "text" },
      { key: "Origem do lead", label: "Origem do lead", type: "select", optionsFromSetting: "leadSources" },
      { key: "Valor da oportunidade", label: "Valor da oportunidade (R$)", type: "number" },
      { key: "Probabilidade de conversão", label: "Probabilidade de conversão (%)", type: "number" },
      { key: "Data do último contato", label: "Data do último contato", type: "date" },
      { key: "Próximo contato", label: "Próximo contato", type: "date" },
      { key: "Previsão de fechamento", label: "Previsão de fechamento", type: "date" },
      { key: "Motivo de perda", label: "Motivo de perda", type: "text" },
    ],
    indicators: [
      "Leads recebidos", "Leads qualificados", "Oportunidades abertas", "Taxa de conversão", "Valor do pipeline",
      "Vendas ganhas", "Vendas perdidas", "Tempo médio de negociação", "Follow-ups pendentes",
    ],
    automations: [
      "Criar atividade de follow-up após contato", "Alertar sobre oportunidades sem movimentação",
      "Notificar quando uma negociação estiver parada", "Atribuir leads conforme regras",
      "Criar lembretes para reuniões",
    ],
    editableLists: [
      {
        key: "leadSources",
        label: "Origens de lead",
        help: "Canais que aparecem no campo Origem do lead dos cartões.",
        examples: ["Indicação", "Site", "Redes sociais", "Evento", "Prospecção ativa"],
      },
    ],
  },

  siem: {
    key: "siem",
    name: "SIEM / SOC",
    description: "Segurança da informação: alertas, incidentes, investigação e resposta.",
    icon: "shield",
    palette: { primary: "#ef4444", secondary: "#9d4edd" },
    features: ["Fluxo da triagem ao encerramento", "Severidade, IoCs, ativos e evidências", "SLA, MTTA e MTTR"],
    lists: ["Novo alerta", "Triagem", "Em investigação", "Análise técnica", "Contenção", "Mitigação", "Monitoramento", "Resolvido", "Encerrado"],
    categories: [
      "Malware", "Ransomware", "Tentativa de invasão", "Brute Force", "Port Scan", "Movimentação lateral",
      "Acesso indevido", "Vulnerabilidade", "Phishing", "Exfiltração de dados", "Anomalia de comportamento", "Falha de segurança",
    ],
    classifications: [
      { label: "Severidade", options: ["Crítica", "Alta", "Média", "Baixa", "Informativa"] },
      { label: "Resultado", options: ["Verdadeiro positivo", "Falso positivo", "Atividade informativa", "Incidente confirmado", "Incidente mitigado"] },
    ],
    fields: [
      { key: "ID do incidente", label: "ID do incidente", type: "text" },
      { key: "Origem do alerta", label: "Origem do alerta", type: "text" },
      { key: "Ferramenta de detecção", label: "Ferramenta de detecção", type: "select", optionsFromSetting: "detectionTools" },
      { key: "Regra ou assinatura", label: "Regra ou assinatura", type: "text" },
      { key: "Ativo afetado", label: "Ativo afetado", type: "text" },
      { key: "Hostname", label: "Hostname", type: "text" },
      { key: "IP de origem", label: "Endereço IP de origem", type: "text" },
      { key: "IP de destino", label: "Endereço IP de destino", type: "text" },
      { key: "Usuário relacionado", label: "Usuário relacionado", type: "text" },
      { key: "Data da detecção", label: "Data e horário da detecção", type: "date" },
      { key: "Severidade", label: "Severidade", type: "select", options: ["Crítica", "Alta", "Média", "Baixa", "Informativa"] },
      { key: "Tipo de ocorrência", label: "Tipo de ocorrência", type: "select" },
      { key: "IoCs", label: "Indicadores de comprometimento (IoCs)", type: "text" },
      { key: "Resultado", label: "Classificação do resultado", type: "select", options: ["Verdadeiro positivo", "Falso positivo", "Atividade informativa", "Incidente confirmado", "Incidente mitigado"] },
      { key: "Data de resolução", label: "Data de resolução", type: "date" },
    ],
    indicators: [
      "Incidentes por severidade", "Incidentes por ferramenta", "Incidentes por categoria", "Incidentes em investigação",
      "Incidentes resolvidos", "SLA cumprido", "SLA violado", "MTTA — tempo médio para reconhecimento",
      "MTTR — tempo médio para resolução", "Incidentes recorrentes", "Ativos mais afetados", "Volume de alertas por período",
    ],
    automations: [
      "Criar incidente a partir de integração externa", "Atribuir responsável automaticamente",
      "Gerar alerta para incidentes críticos", "Escalar incidentes conforme severidade",
      "Criar subtarefas para procedimentos de resposta", "Notificar responsáveis sobre SLA",
      "Gerar relatório técnico de encerramento",
    ],
    editableLists: [
      {
        key: "detectionTools",
        label: "Ferramentas de detecção",
        help: "Nomes das ferramentas usadas pela sua operação. Os itens abaixo são só exemplos: edite, remova ou acrescente.",
        examples: ["Antivírus / EDR", "SIEM", "Firewall", "Gateway de e-mail"],
      },
    ],
  },

  dev: {
    key: "dev",
    name: "DEV",
    description: "Desenvolvimento de software: backlog, sprints, revisão, testes e deploy.",
    icon: "code",
    palette: { primary: "#6366f1", secondary: "#00d9ff" },
    features: ["Fluxo do backlog à produção", "Sprint, story points, branch e pull request", "Velocidade, burndown, lead e cycle time"],
    lists: ["Backlog", "Refinamento", "Planejamento", "Em desenvolvimento", "Code Review", "Testes", "Homologação", "Aguardando Deploy", "Produção", "Concluído"],
    categories: ["Feature", "Bug", "Hotfix", "Melhoria", "Débito técnico", "Documentação", "Refatoração", "Infraestrutura"],
    classifications: [{ label: "Prioridade", options: ["Baixa", "Média", "Alta", "Crítica"] }],
    fields: [
      { key: "Projeto", label: "Projeto", type: "text" },
      { key: "Sistema relacionado", label: "Sistema relacionado", type: "text" },
      { key: "Tipo de atividade", label: "Tipo de atividade", type: "select" },
      { key: "História de usuário", label: "História de usuário", type: "text" },
      { key: "Critérios de aceitação", label: "Critérios de aceitação", type: "text" },
      { key: "Revisor", label: "Revisor", type: "text" },
      { key: "Sprint", label: "Sprint", type: "text" },
      { key: "Story Points", label: "Story Points", type: "number" },
      { key: "Versão", label: "Versão", type: "text" },
      { key: "Branch", label: "Branch", type: "text" },
      { key: "Pull Request", label: "Pull Request", type: "text" },
      { key: "Ambiente", label: "Ambiente", type: "select", optionsFromSetting: "environments" },
      { key: "Data de entrega", label: "Data de entrega", type: "date" },
    ],
    indicators: [
      "Tarefas concluídas", "Bugs abertos", "Bugs críticos", "Velocidade da sprint", "Burndown",
      "Lead Time", "Cycle Time", "Entregas por versão", "Débito técnico", "Atividades atrasadas",
    ],
    automations: [
      "Criar tarefas a partir de bugs", "Notificar quando uma revisão de código estiver pendente",
      "Atualizar status a partir de eventos de integração", "Notificar falhas de testes",
      "Criar tarefas recorrentes de manutenção", "Vincular tarefas a releases",
    ],
    editableLists: [
      {
        key: "environments",
        label: "Ambientes",
        help: "Ambientes que aparecem no campo Ambiente dos cartões.",
        examples: ["Desenvolvimento", "Homologação", "Produção"],
      },
    ],
  },
};

/** Temas oferecidos no seletor (o "Geral" é o padrão de quadros antigos). */
export const SEGMENT_THEME_KEYS: BoardThemeKey[] = ["ecommerce", "crm", "siem", "dev"];

export function isBoardThemeKey(value: unknown): value is BoardThemeKey {
  return typeof value === "string" && (BOARD_THEME_KEYS as readonly string[]).includes(value);
}

/** Tema do quadro; quadros antigos (sem coluna/valor) caem no "Geral". */
export function getBoardTheme(key: unknown): BoardTheme {
  return BOARD_THEMES[isBoardThemeKey(key) ? key : DEFAULT_THEME];
}

/** Limpa uma lista editável: sem vazios, sem repetidos, com limites. */
export function normalizeSettingList(values: unknown, max = 30, maxLength = 60): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const item = raw.trim().slice(0, maxLength);
    const id = item.toLowerCase();
    if (!item || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** Opções de um campo: fixas, vindas dos ajustes do quadro ou das categorias. */
export function getFieldOptions(theme: BoardTheme, field: ThemeField, settings?: BoardSettings | null): string[] {
  if (field.optionsFromSetting) {
    const custom = normalizeSettingList(settings?.[field.optionsFromSetting]);
    if (custom.length > 0) return custom;
    return theme.editableLists.find((l) => l.key === field.optionsFromSetting)?.examples ?? [];
  }
  if (field.options) return field.options;
  return field.type === "select" ? theme.categories : [];
}
