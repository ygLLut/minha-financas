import Dexie, { type Table } from 'dexie';

export interface Recorrente {
  id?: number;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  categoriaId: number | null;
  frequencia: 'Mensal' | 'Semanal';
  proximoVencimento: string; // ISO Date
}

export interface Investimento {
  id?: number;
  nome: string;
  tipo: 'Ações' | 'Cripto' | 'Renda Fixa' | 'Fundos';
  quantidade: number;
  precoMedio: number;
  precoAtual: number;
}

export interface Meta {
  id?: number;
  nome: string;
  valorAlvo: number;
  valorAtual: number;
  prazo: string;
}

export interface Cartao {
  id?: number;
  nome: string;
  limite: number;
  vencimento: number;
}

export interface Orcamento {
  id?: number;
  categoriaId: number;
  limite: number;
}

export interface Conta {
  id?: number;
  nome: string;
  tipo: 'Dinheiro' | 'Banco' | 'Cartão';
  saldo: number;
}

export interface Categoria {
  id?: number;
  nome: string;
  tipo: 'Receita' | 'Despesa';
}

export interface Transacao {
  id?: number;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa' | 'transferencia';
  contaId: number;
  contaDestinoId?: number;
  categoriaId: number | null;
  cartaoId: number | null;
   data: string;
}

export class FinanceDB extends Dexie {
  contas!: Table<Conta>;
  categorias!: Table<Categoria>;
  transacoes!: Table<Transacao>;
  cartoes!: Table<Cartao>;
  metas!: Table<Meta>;
  orcamentos!: Table<Orcamento>;
  investimentos!: Table<Investimento>;
  recorrentes!: Table<Recorrente>;

  constructor() {
    super('meuBancoFinanceiro_v7'); // Versão 7
    
    this.version(1).stores({
      contas: '++id, nome',
      categorias: '++id, nome, tipo',
      cartoes: '++id, nome',
      metas: '++id, nome, prazo',
      orcamentos: '++id, categoriaId',
      investimentos: '++id, nome, tipo',
      recorrentes: '++id, proximoVencimento',
      transacoes: '++id, tipo, contaId, categoriaId, cartaoId, data'
    }).upgrade(async (tx) => {
      const cCount = await tx.table('categorias').count();
      if (cCount === 0) {
        await tx.table('categorias').bulkAdd([
          { nome: 'Salário', tipo: 'Receita' },
          { nome: 'Alimentação', tipo: 'Despesa' },
          { nome: 'Transporte', tipo: 'Despesa' },
          { nome: 'Moradia', tipo: 'Despesa' },
          { nome: 'Lazer', tipo: 'Despesa' },
          { nome: 'Saúde', tipo: 'Despesa' },
          { nome: 'Outros', tipo: 'Despesa' }
        ]);
      }
      
      const aCount = await tx.table('contas').count();
      if (aCount === 0) await tx.table('contas').add({ nome: 'Carteira/Dinheiro', tipo: 'Dinheiro', saldo: 0 });
    });
  }
}

export const db = new FinanceDB();