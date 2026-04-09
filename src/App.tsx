import { useState, useEffect, useMemo } from 'react';
import { db, type Transacao, type Conta, type Categoria, type Cartao, type Meta, type Orcamento, type Investimento, type Recorrente } from './db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState<'dashboard' | 'investimentos' | 'cartoes' | 'metas' | 'orcamentos' | 'config'>('dashboard');

  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [investimentos, setInvestimentos] = useState<Investimento[]>([]);
  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([]);
  const [carregado, setCarregado] = useState(false);

  // --- ESTADOS DE FORMULÁRIOS ---
  const [form, setForm] = useState({
    descricao: '', valor: '', tipo: 'despesa' as 'receita' | 'despesa' | 'transferencia', 
    contaId: '', categoriaId: '', cartaoId: '', contaDestinoId: '',
    isParcelado: false, qtdParcelas: '1'
  });

  const [novaCat, setNovaCat] = useState({ nome: '', tipo: 'Despesa' as 'Receita' | 'Despesa' });
  const [novoCartao, setNovoCartao] = useState({ nome: '', limite: '', vencimento: '10' });
  const [novaMeta, setNovaMeta] = useState({ nome: '', valorAlvo: '', prazo: '' });
  const [aporteMeta, setAporteMeta] = useState({ metaId: '', valor: '' });
  const [novoOrcamento, setNovoOrcamento] = useState({ categoriaId: '', limite: '' });
  const [novoInvestimento, setNovoInvestimento] = useState({ nome: '', tipo: 'Ações', quantidade: '', precoMedio: '', precoAtual: '' });
  
  // CORREÇÃO 1: Adicionado diaVencimento
  const [novoRecorrente, setNovoRecorrente] = useState({
    descricao: '', valor: '', tipo: 'despesa' as 'receita' | 'despesa',
    categoriaId: '', frequencia: 'Mensal' as 'Mensal' | 'Semanal',
    diaVencimento: '' 
  });

  // --- INICIALIZAÇÃO E MOTOR DE RECORRÊNCIA ---
  useEffect(() => {
    const init = async () => {
      const [t, c, cat, cards, m, orc, inv, rec] = await Promise.all([
        db.transacoes.toArray(), db.contas.toArray(), db.categorias.toArray(),
        db.cartoes.toArray(), db.metas.toArray(), db.orcamentos.toArray(),
        db.investimentos.toArray(), db.recorrentes.toArray()
      ]);

      if (c.length === 0) {
        const id = await db.contas.add({ nome: 'Carteira/Dinheiro', tipo: 'Dinheiro', saldo: 0 });
        c.push({ id, nome: 'Carteira/Dinheiro', tipo: 'Dinheiro', saldo: 0 });
      }

      const hoje = new Date();
      hoje.setHours(0,0,0,0);
      const contaPadraoId = c[0].id!;

      for (const item of rec) {
        const vencimento = new Date(item.proximoVencimento);
        vencimento.setHours(0,0,0,0);

        if (vencimento <= hoje) {
          await db.transacoes.add({
            descricao: item.descricao,
            valor: item.valor,
            tipo: item.tipo,
            contaId: contaPadraoId,
            categoriaId: item.categoriaId,
            cartaoId: null,
            data: item.proximoVencimento
          });

          const conta = c.find(cont => cont.id === contaPadraoId);
          if (conta) {
            const novoSaldo = item.tipo === 'receita' ? conta.saldo + item.valor : conta.saldo - item.valor;
            await db.contas.update(conta.id!, { saldo: novoSaldo });
            conta.saldo = novoSaldo;
          }

          const proximo = new Date(item.proximoVencimento);
          if (item.frequencia === 'Mensal') proximo.setMonth(proximo.getMonth() + 1);
          else proximo.setDate(proximo.getDate() + 7);

          await db.recorrentes.update(item.id!, { proximoVencimento: proximo.toISOString() });
          item.proximoVencimento = proximo.toISOString();
        }
      }

      setTransacoes(t); setContas(c); setCategorias(cat); setCartoes(cards);
      setMetas(m); setOrcamentos(orc); setInvestimentos(inv); setRecorrentes(rec);
      
      if (c.length > 0) setForm(prev => ({ ...prev, contaId: String(c[0].id!) }));
      setCarregado(true);
    };
    init();
  }, []);

  // --- FUNÇÕES DE AÇÃO ---
  
  // CORREÇÃO 2: Função atualizada com lógica de dia de vencimento
  const adicionarRecorrente = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!novoRecorrente.descricao || !novoRecorrente.valor || !novoRecorrente.diaVencimento) return;
    
    const proximo = new Date();
    const diaEscolhido = parseInt(novoRecorrente.diaVencimento);
    
    if (novoRecorrente.frequencia === 'Mensal') {
      proximo.setDate(diaEscolhido);
      // Se o dia escolhido já passou no mês atual, agenda para o próximo mês
      if (proximo < new Date()) {
        proximo.setMonth(proximo.getMonth() + 1);
      }
    } else {
      // Para semanal, calcula o próximo dia da semana correspondente (0-6)
      const diasParaAdicionar = (diaEscolhido - proximo.getDay() + 7) % 7;
      proximo.setDate(proximo.getDate() + diasParaAdicionar);
    }
    
    proximo.setHours(0, 0, 0, 0);

    const id = await db.recorrentes.add({
      descricao: novoRecorrente.descricao,
      valor: parseFloat(novoRecorrente.valor),
      tipo: novoRecorrente.tipo,
      categoriaId: novoRecorrente.categoriaId ? Number(novoRecorrente.categoriaId) : null,
      frequencia: novoRecorrente.frequencia,
      proximoVencimento: proximo.toISOString()
    });
    
    const novo = await db.recorrentes.get(id!);
    if(novo) setRecorrentes(prev => [...prev, novo]);
    setNovoRecorrente({ descricao: '', valor: '', tipo: 'despesa', categoriaId: '', frequencia: 'Mensal', diaVencimento: '' });
  };

  const removerRecorrente = async (id: number) => {
    if(confirm("Remover esta conta fixa?")) {
      await db.recorrentes.delete(id);
      setRecorrentes(prev => prev.filter(r => r.id !== id));
    }
  };

  const adicionarTransacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao || !form.valor || !form.contaId) return;
    const valorTotal = parseFloat(form.valor);
    const qtdParcelas = form.isParcelado ? parseInt(form.qtdParcelas) : 1;
    const valorParcela = valorTotal / qtdParcelas;
    const cartaoSelecionado = form.tipo === 'transferencia' ? null : (form.cartaoId ? Number(form.cartaoId) : null);
    const contaAtual = contas.find(c => c.id === Number(form.contaId));
    const contaDest = form.contaDestinoId ? contas.find(c => c.id === Number(form.contaDestinoId)) : null;
    
    if (form.tipo === 'transferencia') {
      if (!contaDest || !contaAtual) return;
      if (contaAtual.saldo < valorTotal) { alert("Saldo insuficiente!"); return; }
      await db.transacoes.add({ descricao: `Transf: ${contaAtual.nome} -> ${contaDest.nome}`, valor: valorTotal, tipo: 'transferencia', contaId: Number(form.contaId), contaDestinoId: Number(form.contaDestinoId), categoriaId: null, cartaoId: null, data: new Date().toISOString() });
      await db.contas.update(contaAtual.id!, { saldo: contaAtual.saldo - valorTotal });
      await db.contas.update(contaDest.id!, { saldo: contaDest.saldo + valorTotal });
      setContas(prev => prev.map(c => c.id === contaAtual!.id ? { ...c, saldo: c.saldo - valorTotal } : c.id === contaDest!.id ? { ...c, saldo: c.saldo + valorTotal } : c));
      setForm(prev => ({ ...prev, descricao: '', valor: '' }));
      db.transacoes.toArray().then(t => setTransacoes(t));
      return;
    }

    for (let i = 0; i < qtdParcelas; i++) {
      const dataParcela = new Date(); dataParcela.setMonth(dataParcela.getMonth() + i);
      await db.transacoes.add({ descricao: qtdParcelas > 1 ? `${form.descricao} (${i + 1}/${qtdParcelas})` : form.descricao, valor: valorParcela, tipo: form.tipo, contaId: Number(form.contaId), categoriaId: form.categoriaId ? Number(form.categoriaId) : null, cartaoId: cartaoSelecionado, data: dataParcela.toISOString() });
    }
    if (contaAtual) {
      const novoSaldo = form.tipo === 'receita' ? contaAtual.saldo + valorTotal : contaAtual.saldo - valorTotal;
      await db.contas.update(contaAtual.id!, { saldo: novoSaldo });
      setContas(prev => prev.map(c => c.id === contaAtual.id ? { ...c, saldo: novoSaldo } : c));
    }
    setForm(prev => ({ ...prev, descricao: '', valor: '', categoriaId: '', cartaoId: '', isParcelado: false, qtdParcelas: '1' }));
    db.transacoes.toArray().then(t => setTransacoes(t));
  };

  const adicionarInvestimento = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = await db.investimentos.add({ 
      nome: novoInvestimento.nome, 
      tipo: novoInvestimento.tipo as 'Ações' | 'Cripto' | 'Renda Fixa' | 'Fundos',
      quantidade: parseFloat(novoInvestimento.quantidade), 
      precoMedio: parseFloat(novoInvestimento.precoMedio), 
      precoAtual: parseFloat(novoInvestimento.precoAtual) 
    });
    const inv = await db.investimentos.get(id!);
    if (inv) setInvestimentos(prev => [...prev, inv]);
    setNovoInvestimento({ nome: '', tipo: 'Ações', quantidade: '', precoMedio: '', precoAtual: '' });
  };

  const atualizarInvestimento = async (id: number, precoAtual: number) => {
    await db.investimentos.update(id, { precoAtual });
    setInvestimentos(prev => prev.map(i => i.id === id ? { ...i, precoAtual } : i));
  };

  const removerInvestimento = async (id: number) => { if (confirm("Remover ativo?")) { await db.investimentos.delete(id); setInvestimentos(prev => prev.filter(i => i.id !== id)); } };
  const adicionarCartao = async (e: React.FormEvent) => { e.preventDefault(); const id = await db.cartoes.add({ nome: novoCartao.nome, limite: parseFloat(novoCartao.limite), vencimento: parseInt(novoCartao.vencimento) }); const novo = await db.cartoes.get(id!); if (novo) setCartoes(prev => [...prev, novo]); setNovoCartao({ nome: '', limite: '', vencimento: '10' }); };
  const removerCartao = async (id: number) => { if(confirm("Remover cartão?")) { await db.cartoes.delete(id); setCartoes(prev => prev.filter(c => c.id !== id)); } };
  
  const adicionarMeta = async (e: React.FormEvent) => { e.preventDefault(); const id = await db.metas.add({ nome: novaMeta.nome, valorAlvo: parseFloat(novaMeta.valorAlvo), valorAtual: 0, prazo: new Date(novaMeta.prazo).toISOString() }); const meta = await db.metas.get(id!); if (meta) setMetas(prev => [...prev, meta]); setNovaMeta({ nome: '', valorAlvo: '', prazo: '' }); };
  const removerMeta = async (id: number) => { if (confirm("Remover meta?")) { await db.metas.delete(id); setMetas(prev => prev.filter(m => m.id !== id)); } };
  const aportarMeta = async (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!aporteMeta.metaId || !aporteMeta.valor) return; const metaId = Number(aporteMeta.metaId); const valor = parseFloat(aporteMeta.valor); const metaAtual = metas.find(m => m.id === metaId); if (!metaAtual) return; const novoValor = metaAtual.valorAtual + valor; await db.metas.update(metaId, { valorAtual: novoValor }); setMetas(prev => prev.map(m => m.id === metaId ? { ...m, valorAtual: novoValor } : m)); setAporteMeta({ metaId: '', valor: '' }); };

  const definirOrcamento = async (e: React.FormEvent) => { e.preventDefault(); if (!novoOrcamento.categoriaId || !novoOrcamento.limite) return; const catId = Number(novoOrcamento.categoriaId); const limite = parseFloat(novoOrcamento.limite); const existente = orcamentos.find(o => o.categoriaId === catId); if (existente) { await db.orcamentos.update(existente.id!, { limite }); setOrcamentos(prev => prev.map(o => o.categoriaId === catId ? { ...o, limite } : o)); } else { const id = await db.orcamentos.add({ categoriaId: catId, limite }); const novo = await db.orcamentos.get(id!); if (novo) setOrcamentos(prev => [...prev, novo]); } setNovoOrcamento({ categoriaId: '', limite: '' }); };
  const removerOrcamento = async (catId: number) => { if (confirm("Remover limite?")) { const ex = orcamentos.find(o => o.categoriaId === catId); if (ex) { await db.orcamentos.delete(ex.id!); setOrcamentos(prev => prev.filter(o => o.categoriaId !== catId)); } } };
  const adicionarCategoria = async (e: React.FormEvent) => { e.preventDefault(); if (!novaCat.nome.trim()) return; const id = await db.categorias.add({ nome: novaCat.nome, tipo: novaCat.tipo }); const nova = await db.categorias.get(id!); if (nova) setCategorias(prev => [...prev, nova]); setNovaCat({ nome: '', tipo: 'Despesa' }); };
  const removerCategoria = async (id: number) => { if (confirm("Remover?")) { await db.categorias.delete(id); setCategorias(prev => prev.filter(c => c.id !== id)); } };

  const limparHistorico = async () => { if (confirm("⚠️ Apagar TUDO?")) { await Promise.all([db.transacoes.clear(), db.metas.clear(), db.orcamentos.clear(), db.investimentos.clear(), db.recorrentes.clear()]); await db.contas.toCollection().modify({ saldo: 0 }); setTransacoes([]); setMetas([]); setOrcamentos([]); setInvestimentos([]); setRecorrentes([]); setContas(prev => prev.map(c => ({ ...c, saldo: 0 }))); } };
  const exportarDados = async () => { const dados = { transacoes: await db.transacoes.toArray(), contas: await db.contas.toArray(), categorias: await db.categorias.toArray(), cartoes: await db.cartoes.toArray(), metas: await db.metas.toArray(), orcamentos: await db.orcamentos.toArray(), investimentos: await db.investimentos.toArray(), recorrentes: await db.recorrentes.toArray() }; const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `financas_${new Date().toISOString().split('T')[0]}.json`; a.click(); };
  const importarDados = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (ev) => { try { const dados = JSON.parse(ev.target?.result as string); await Promise.all([db.transacoes.clear(), db.contas.clear(), db.categorias.clear(), db.cartoes.clear(), db.metas.clear(), db.orcamentos.clear(), db.investimentos.clear(), db.recorrentes.clear()]); if (dados.contas) await db.contas.bulkAdd(dados.contas); if (dados.categorias) await db.categorias.bulkAdd(dados.categorias); if (dados.cartoes) await db.cartoes.bulkAdd(dados.cartoes); if (dados.metas) await db.metas.bulkAdd(dados.metas); if (dados.orcamentos) await db.orcamentos.bulkAdd(dados.orcamentos); if (dados.investimentos) await db.investimentos.bulkAdd(dados.investimentos); if (dados.transacoes) await db.transacoes.bulkAdd(dados.transacoes); if (dados.recorrentes) await db.recorrentes.bulkAdd(dados.recorrentes); window.location.reload(); } catch { alert('Arquivo inválido!'); } }; reader.readAsText(file); };

  // --- CÁLCULOS ---
  // CORREÇÃO 3: Variáveis 'receitas' e 'dadosPizzaGastos' removidas para evitar erro de build
  
  const despesas = transacoes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
  const saldoContas = contas.reduce((s, c) => s + c.saldo, 0);
  const saldoInvestido = investimentos.reduce((s, i) => s + (i.quantidade * i.precoAtual), 0);
  const patrimonioTotal = saldoContas + saldoInvestido;

  const dadosPizzaInvest = useMemo(() => { return investimentos.map(i => ({ name: i.nome, value: i.quantidade * i.precoAtual })); }, [investimentos]);
  const cores = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

  // --- ALERTAS (Lembretes) ---
  const lembretes = useMemo(() => {
    const hoje = new Date();
    const tresDias = new Date(); tresDias.setDate(tresDias.getDate() + 3);
    return recorrentes.filter(r => {
      const venc = new Date(r.proximoVencimento);
      return venc >= hoje && venc <= tresDias;
    });
  }, [recorrentes]);

  if (!carregado) return <div className="flex h-screen items-center justify-center">Carregando...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6 pb-20">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Finanças</h1>
          <div className="flex gap-2 text-sm">
             <label className="cursor-pointer bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition">📥</label>
             <input type="file" accept=".json" className="hidden" onChange={importarDados} />
             <button onClick={exportarDados} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition">📤</button>
          </div>
        </div>
        <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto">
          {(['dashboard', 'investimentos', 'cartoes', 'metas', 'orcamentos', 'config'] as const).map(tab => (
            <button key={tab} onClick={() => setAbaAtiva(tab)} 
              className={`flex-1 py-2 rounded-lg font-medium transition min-w-[70px] ${abaAtiva === tab ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-400' : 'opacity-60 hover:opacity-100'}`}>
              {tab === 'dashboard' ? 'Dashboard' : tab === 'investimentos' ? 'Invest' : tab}
            </button>
          ))}
        </div>
      </div>

      {abaAtiva === 'dashboard' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {lembretes.length > 0 && (
            <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-500 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-lg flex items-center gap-2 animate-pulse">
              <span className="text-xl">⏰</span>
              <div>
                <p className="font-bold">Atenção: Contas a vencer!</p>
                <p className="text-sm">Você tem {lembretes.length} conta(s) vencendo nos próximos 3 dias.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-xl"><p className="text-xs opacity-70">Patrimônio</p><p className="text-lg font-bold">R$ {patrimonioTotal.toFixed(0)}</p></div>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-xl"><p className="text-xs opacity-70">Saldo Contas</p><p className="text-lg font-bold">R$ {saldoContas.toFixed(2)}</p></div>
            <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-xl"><p className="text-xs opacity-70">Investido</p><p className="text-lg font-bold">R$ {saldoInvestido.toFixed(2)}</p></div>
            <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-xl"><p className="text-xs opacity-70">Desp. Mês</p><p className="text-lg font-bold text-red-600">- {despesas.toFixed(0)}</p></div>
          </div>

          <form onSubmit={adicionarTransacao} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Descrição" required className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} />
              <input type="number" step="0.01" placeholder="Valor" required className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} />
            </div>
            
            <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value as any, categoriaId: ''})}>
              <option value="despesa">💸 Despesa</option>
              <option value="receita">💰 Receita</option>
              <option value="transferencia">🔄 Transferência</option>
            </select>

            {form.tipo === 'transferencia' ? (
              <div className="grid grid-cols-2 gap-3">
                <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={form.contaId} onChange={e => setForm({...form, contaId: e.target.value})} required>
                  <option value="">Origem</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome} (R${c.saldo})</option>)}
                </select>
                <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={form.contaDestinoId} onChange={e => setForm({...form, contaDestinoId: e.target.value})} required>
                  <option value="">Destino</option>
                  {contas.filter(c => c.id !== Number(form.contaId)).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={form.contaId} onChange={e => setForm({...form, contaId: e.target.value})} required>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={form.categoriaId} onChange={e => setForm({...form, categoriaId: e.target.value})}>
                  <option value="">Categoria...</option>
                  {categorias.filter(c => c.tipo === (form.tipo === 'receita' ? 'Receita' : 'Despesa')).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                 {form.tipo === 'despesa' && (
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg border dark:border-gray-600">
                      <label className="flex items-center gap-1 text-sm cursor-pointer"><input type="checkbox" checked={form.isParcelado} onChange={e => setForm({...form, isParcelado: e.target.checked, qtdParcelas: e.target.checked ? '2' : '1'})} /> 12x</label>
                      {form.isParcelado && <input type="number" min="2" max="48" className="w-12 p-1 border rounded text-center bg-white dark:bg-gray-800" value={form.qtdParcelas} onChange={e => setForm({...form, qtdParcelas: e.target.value})} />}
                    </div>
                )}
              </div>
            )}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-bold transition shadow-lg shadow-blue-500/30">✅ Registrar</button>
          </form>

          <div className="space-y-2">
            <h3 className="font-bold text-lg">Últimas Transações</h3>
            {transacoes.sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 5).map(t => (
              <div key={t.id} className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-lg shadow border-l-4 border-l-blue-500 text-sm">
                <div>
                  <p className="font-bold">{t.descricao}</p>
                  <p className="text-xs opacity-60">{new Date(t.data).toLocaleDateString('pt-BR')} • {t.tipo === 'transferencia' ? 'Transf' : categorias.find(c => c.id === t.categoriaId)?.nome}</p>
                </div>
                <p className={t.tipo === 'receita' ? 'text-green-600 font-bold' : t.tipo === 'transferencia' ? 'text-gray-500 font-bold' : 'text-red-600 font-bold'}>
                  {t.tipo === 'receita' ? '+' : t.tipo === 'transferencia' ? '↔' : '-'} R$ {t.valor.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {abaAtiva === 'investimentos' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
              <h2 className="text-xl font-bold">Adicionar Ativo</h2>
              <form onSubmit={adicionarInvestimento} className="space-y-3">
                <input type="text" placeholder="Nome (ex: Bitcoin)" required className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.nome} onChange={e => setNovoInvestimento({...novoInvestimento, nome: e.target.value})} />
                <div className="grid grid-cols-2 gap-3">
                  <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.tipo} onChange={e => setNovoInvestimento({...novoInvestimento, tipo: e.target.value})}>
                    <option value="Ações">Ações</option> <option value="Cripto">Cripto</option> <option value="Renda Fixa">Renda Fixa</option> <option value="Fundos">Fundos</option>
                  </select>
                  <input type="number" step="any" placeholder="Qtd" required className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.quantidade} onChange={e => setNovoInvestimento({...novoInvestimento, quantidade: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" step="any" placeholder="Preço Médio" required className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.precoMedio} onChange={e => setNovoInvestimento({...novoInvestimento, precoMedio: e.target.value})} />
                  <input type="number" step="any" placeholder="Preço Atual" required className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.precoAtual} onChange={e => setNovoInvestimento({...novoInvestimento, precoAtual: e.target.value})} />
                </div>
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-lg font-bold">💎 Adicionar</button>
              </form>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow">
              <h2 className="text-xl font-bold mb-4">Distribuição</h2>
              <div className="h-64">
                {dadosPizzaInvest.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={dadosPizzaInvest} cx="50%" cy="50%" outerRadius={80} dataKey="value">
                        {dadosPizzaInvest.map((_, i) => <Cell key={i} fill={cores[i % cores.length]} />)}
                      </Pie>
                      <Tooltip formatter={(val: any) => `R$ ${Number(val).toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-center opacity-50 h-full flex items-center justify-center">Sem ativos</p>}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {investimentos.map(inv => {
              const valorTotal = inv.quantidade * inv.precoAtual;
              const lucro = valorTotal - (inv.quantidade * inv.precoMedio);
              const perc = ((inv.precoAtual - inv.precoMedio) / inv.precoMedio) * 100;
              return (
                <div key={inv.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow flex justify-between items-center border border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="font-bold text-lg">{inv.nome} <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded ml-2">{inv.tipo}</span></p>
                    <p className="text-sm opacity-60">{inv.quantidade} un. @ Média R$ {inv.precoMedio.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">R$ {valorTotal.toFixed(2)}</p>
                    <p className={`text-sm font-bold ${lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{lucro >= 0 ? '+' : ''}{perc.toFixed(2)}%</p>
                    <div className="flex gap-2 mt-2 justify-end">
                       <input type="number" step="any" placeholder="Novo Preço" className="w-24 p-1 text-xs border rounded dark:bg-gray-700" onBlur={(e) => { if(e.target.value) atualizarInvestimento(inv.id!, parseFloat(e.target.value)) }} />
                       <button onClick={() => removerInvestimento(inv.id!)} className="text-red-500 text-xs hover:underline">✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {abaAtiva === 'cartoes' && (
        <div className="space-y-6 animate-in fade-in duration-300">
           <form onSubmit={adicionarCartao} className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white dark:bg-gray-800 p-5 rounded-xl shadow">
             <input placeholder="Nome do Cartão" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoCartao.nome} onChange={e => setNovoCartao({...novoCartao, nome: e.target.value})} required />
             <input type="number" placeholder="Limite" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoCartao.limite} onChange={e => setNovoCartao({...novoCartao, limite: e.target.value})} required />
             <input type="number" placeholder="Vencimento" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoCartao.vencimento} onChange={e => setNovoCartao({...novoCartao, vencimento: e.target.value})} />
             <button className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold transition">+ Salvar</button>
           </form>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {cartoes.map(card => {
               const fatura = transacoes.filter(t => t.cartaoId === card.id && t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
               return (
                 <div key={card.id} className="bg-gradient-to-br from-purple-600 to-blue-800 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
                   <button onClick={() => removerCartao(card.id!)} className="absolute top-4 right-4 text-white/50 hover:text-white">✕</button>
                   <p className="text-xl font-bold tracking-wide">{card.nome}</p>
                   <div className="mt-8 flex justify-between items-end">
                     <div>
                       <p className="text-xs opacity-70 uppercase">Fatura Atual</p>
                       <p className="text-2xl font-bold">R$ {fatura.toFixed(2)}</p>
                     </div>
                     <div className="text-right">
                       <p className="text-xs opacity-70 uppercase">Limite</p>
                       <p className="text-lg">R$ {card.limite.toFixed(2)}</p>
                     </div>
                   </div>
                   <div className="mt-4 h-1.5 bg-black/30 rounded-full"><div className="h-1.5 bg-white rounded-full transition-all" style={{width: `${Math.min((fatura/card.limite)*100, 100)}%`}}></div></div>
                   <p className="absolute bottom-4 right-6 text-lg font-bold tracking-widest opacity-20">CREDIT CARD</p>
                 </div>
               )
             })}
           </div>
        </div>
      )}

      {abaAtiva === 'metas' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <h2 className="text-xl font-bold">Nova Meta</h2>
            <form onSubmit={adicionarMeta} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input placeholder="Nome (ex: Viagem)" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaMeta.nome} onChange={e => setNovaMeta({...novaMeta, nome: e.target.value})} required />
              <input type="number" placeholder="Valor Alvo" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaMeta.valorAlvo} onChange={e => setNovaMeta({...novaMeta, valorAlvo: e.target.value})} required />
              <input type="date" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaMeta.prazo} onChange={e => setNovaMeta({...novaMeta, prazo: e.target.value})} required />
              <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition">+ Criar</button>
            </form>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metas.map(m => (
              <div key={m.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow border-l-4 border-emerald-500 relative">
                <button onClick={() => removerMeta(m.id!)} className="absolute top-3 right-3 text-gray-400 hover:text-red-500">✕</button>
                <div className="flex justify-between items-end mb-2">
                  <h3 className="font-bold text-lg">{m.nome}</h3>
                  <span className="text-sm font-bold text-emerald-600">{((m.valorAtual/m.valorAlvo)*100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full mb-3"><div className="h-2 bg-emerald-500 rounded-full transition-all" style={{width: `${Math.min((m.valorAtual/m.valorAlvo)*100, 100)}%`}}></div></div>
                <div className="flex justify-between text-xs opacity-60 mb-3"><span>Atual: R${m.valorAtual.toFixed(0)}</span><span>Alvo: R${m.valorAlvo.toFixed(0)}</span></div>
                <form onSubmit={(e) => aportarMeta(e)} className="flex gap-2">
                  <select className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value={aporteMeta.metaId} onChange={e => setAporteMeta({...aporteMeta, metaId: e.target.value})}><option value="">Selecione meta...</option>{metas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
                  <input type="number" placeholder="R$" className="w-24 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value={aporteMeta.valor} onChange={e => setAporteMeta({...aporteMeta, valor: e.target.value})} />
                  <button className="bg-blue-600 text-white px-3 rounded-lg text-sm font-bold hover:bg-blue-700">💰</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {abaAtiva === 'orcamentos' && (
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
             <h2 className="text-xl font-bold">Definir Orçamento</h2>
             <form onSubmit={definirOrcamento} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
               <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoOrcamento.categoriaId} onChange={e => setNovoOrcamento({...novoOrcamento, categoriaId: e.target.value})} required><option value="">Selecione Categoria...</option>{categorias.filter(c=>c.tipo==='Despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
               <input type="number" placeholder="Limite Mensal (R$)" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoOrcamento.limite} onChange={e => setNovoOrcamento({...novoOrcamento, limite: e.target.value})} required />
               <button className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition">💰 Definir</button>
             </form>
           </div>
           <div className="space-y-3">
             {orcamentos.map(orc => {
               const gasto = transacoes.filter(t => t.categoriaId === orc.categoriaId && t.tipo === 'despesa').reduce((s,t) => s + t.valor, 0);
               const pct = (gasto / orc.limite) * 100;
               const catNome = categorias.find(c => c.id === orc.categoriaId)?.nome || 'Cat';
               return (
                 <div key={orc.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-l-amber-500">
                   <div className="flex-1">
                     <div className="flex justify-between items-end mb-2">
                       <h3 className="font-bold text-lg">{catNome}</h3>
                       <span className={`text-sm font-bold ${pct>100?'text-red-600':'text-amber-600'}`}>{pct.toFixed(0)}%</span>
                     </div>
                     <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full"><div className={`h-2 rounded-full ${pct>100?'bg-red-500':'bg-green-500'}`} style={{width: `${Math.min(pct, 100)}%`}}></div></div>
                     <p className="text-xs mt-1 opacity-60 flex justify-between"><span>Gasto: R${gasto.toFixed(0)}</span><span>Limite: R${orc.limite.toFixed(0)}</span></p>
                   </div>
                   <button onClick={() => removerOrcamento(orc.categoriaId!)} className="text-gray-400 hover:text-red-500 text-sm font-bold px-2">Remover</button>
                 </div>
               )
             })}
             {orcamentos.length === 0 && <p className="text-center opacity-50 py-8">Nenhum orçamento definido.</p>}
           </div>
        </div>
      )}

      {abaAtiva === 'config' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <h2 className="text-xl font-bold">🔄 Contas Fixas / Recorrentes</h2>
            <p className="text-sm opacity-70">Contas que serão geradas automaticamente todo mês/semana ao abrir o app.</p>
            <form onSubmit={adicionarRecorrente} className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <input placeholder="Descrição (ex: Aluguel)" className="sm:col-span-2 p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoRecorrente.descricao} onChange={e => setNovoRecorrente({...novoRecorrente, descricao: e.target.value})} required />
              <input type="number" placeholder="Valor" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoRecorrente.valor} onChange={e => setNovoRecorrente({...novoRecorrente, valor: e.target.value})} required />
              
              {/* Seletor de Dia de Vencimento */}
              {novoRecorrente.frequencia === 'Mensal' ? (
                <select 
                  className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" 
                  value={novoRecorrente.diaVencimento} 
                  onChange={e => setNovoRecorrente({...novoRecorrente, diaVencimento: e.target.value})}
                  required
                >
                  <option value="">Dia do mês</option>
                  {Array.from({length: 31}, (_, i) => i + 1).map(dia => (
                    <option key={dia} value={dia}>{dia}º dia</option>
                  ))}
                </select>
              ) : (
                <select 
                  className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" 
                  value={novoRecorrente.diaVencimento} 
                  onChange={e => setNovoRecorrente({...novoRecorrente, diaVencimento: e.target.value})}
                  required
                >
                  <option value="">Dia da semana</option>
                  <option value="0">Domingo</option>
                  <option value="1">Segunda</option>
                  <option value="2">Terça</option>
                  <option value="3">Quarta</option>
                  <option value="4">Quinta</option>
                  <option value="5">Sexta</option>
                  <option value="6">Sábado</option>
                </select>
              )}
              
              <select 
                className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" 
                value={novoRecorrente.frequencia} 
                onChange={e => setNovoRecorrente({...novoRecorrente, frequencia: e.target.value as any, diaVencimento: ''})}
              >
                <option value="Mensal">Mensal</option>
                <option value="Semanal">Semanal</option>
              </select>
              <button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition">+ Salvar</button>
            </form>
            <div className="space-y-2 mt-4 max-h-60 overflow-y-auto">
              {recorrentes.map(r => (
                <div key={r.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-l-4 border-l-blue-500">
                  <div>
                    <p className="font-bold">{r.descricao}</p>
                    <p className="text-xs opacity-60">Vence em: {new Date(r.proximoVencimento).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${r.tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>R$ {r.valor.toFixed(2)}</span>
                    <button onClick={() => removerRecorrente(r.id!)} className="text-gray-400 hover:text-red-500">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <h2 className="text-xl font-bold">Gerenciar Categorias</h2>
            <form onSubmit={adicionarCategoria} className="flex gap-2">
              <input placeholder="Nome da Categoria" className="flex-1 p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaCat.nome} onChange={e => setNovaCat({...novaCat, nome: e.target.value})} required />
              <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaCat.tipo} onChange={e => setNovaCat({...novaCat, tipo: e.target.value as any})}><option value="Despesa">Despesa</option><option value="Receita">Receita</option></select>
              <button className="bg-green-600 hover:bg-green-700 text-white px-4 rounded-lg font-bold transition">+</button>
            </form>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {categorias.map(c => (
                <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                  <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${c.tipo === 'Receita' ? 'bg-green-500' : 'bg-red-500'}`}></span><span className="font-medium">{c.nome}</span></div>
                  <button onClick={() => removerCategoria(c.id!)} className="text-gray-400 hover:text-red-500 p-1">🗑️</button>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-red-50 dark:bg-red-900/20 p-5 rounded-xl border border-red-200 dark:border-red-800">
            <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">Zona de Perigo</h2>
            <p className="text-sm opacity-80 mb-4">Apaga tudo (transações, metas, orçamentos, investimentos e recorrentes).</p>
            <button onClick={limparHistorico} className="w-full bg-red-600 hover:bg-red-700 text-white p-3 rounded-lg font-bold transition">🧹 Limpar Tudo</button>
          </div>
        </div>
      )}
    </div>
  );
}