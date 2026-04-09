import Dexie, { type Table } from 'dexie';

export interface Subcategoria { id?: number; nome: string; categoriaPaiId: number; }
export interface Recorrente { id?: number; descricao: string; valor: number; tipo: 'receita' | 'despesa'; categoriaId: number | null; subcategoriaId: number | null; frequencia: 'Mensal' | 'Semanal'; proximoVencimento: string; }
export interface Investimento { id?: number; nome: string; tipo: 'Ações' | 'Cripto' | 'Renda Fixa' | 'Fundos'; quantidade: number; precoMedio: number; precoAtual: number; }
export interface Meta { id?: number; nome: string; valorAlvo: number; valorAtual: number; prazo: string; }
export interface Orcamento { id?: number; categoriaId: number; limite: number; }
export interface Conta { id?: number; nome: string; tipo: 'Dinheiro' | 'Banco' | 'Cartão'; saldo: number; }
export interface Categoria { id?: number; nome: string; tipo: 'Receita' | 'Despesa'; }
export interface Transacao { id?: number; descricao: string; valor: number; tipo: 'receita' | 'despesa' | 'transferencia'; contaId: number; contaDestinoId?: number; categoriaId: number | null; subcategoriaId: number | null; cartaoId: number | null; data: string; }

export class FinanceDB extends Dexie {
  contas!: Table<Conta>; categorias!: Table<Categoria>; transacoes!: Table<Transacao>;
  metas!: Table<Meta>; orcamentos!: Table<Orcamento>; investimentos!: Table<Investimento>;
  recorrentes!: Table<Recorrente>; subcategorias!: Table<Subcategoria>;

  constructor() {
    super('meuBancoFinanceiro_v9');
    this.version(1).stores({
      contas: '++id, nome', categorias: '++id, nome, tipo',
      metas: '++id, nome, prazo', orcamentos: '++id, categoriaId',
      investimentos: '++id, nome, tipo', recorrentes: '++id, proximoVencimento',
      subcategorias: '++id, nome, categoriaPaiId',
      transacoes: '++id, tipo, contaId, categoriaId, subcategoriaId, cartaoId, data'
    }).upgrade(async (tx) => {
      if (await tx.table('categorias').count() === 0) {
        await tx.table('categorias').bulkAdd([
          { nome: 'Salário', tipo: 'Receita' }, { nome: 'Alimentação', tipo: 'Despesa' },
          { nome: 'Transporte', tipo: 'Despesa' }, { nome: 'Moradia', tipo: 'Despesa' },
          { nome: 'Lazer', tipo: 'Despesa' }, { nome: 'Saúde', tipo: 'Despesa' }, { nome: 'Outros', tipo: 'Despesa' }
        ]);
      }
      if (await tx.table('contas').count() === 0) await tx.table('contas').add({ nome: 'Carteira/Dinheiro', tipo: 'Dinheiro', saldo: 0 });
    });
  }
}
export const db = new FinanceDB();