import { useState, useEffect, useMemo } from 'react';
import { db, type Transacao, type Conta, type Categoria, type Meta, type Orcamento, type Investimento, type Recorrente, type Subcategoria } from './db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import CryptoJS from 'crypto-js';

const CORES = {
  blue: { bg: '#2563eb', hover: '#1d4ed8', light: '#dbeafe', text: '#1e40af' },
  green: { bg: '#059669', hover: '#047857', light: '#d1fae5', text: '#065f46' },
  purple: { bg: '#7c3aed', hover: '#6d28d9', light: '#ede9fe', text: '#5b21b6' },
  amber: { bg: '#d97706', hover: '#b45309', light: '#fef3c7', text: '#92400e' }
};

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState<'dashboard' | 'investimentos' | 'contas' | 'metas' | 'orcamentos' | 'config'>('dashboard');
  const [tema, setTema] = useState<'light' | 'dark'>('dark');
  const [corDestaque, setCorDestaque] = useState('blue');
  const [fonteGrande, setFonteGrande] = useState(false);

  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [investimentos, setInvestimentos] = useState<Investimento[]>([]);
  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([]);
  const [carregado, setCarregado] = useState(false);

  const [form, setForm] = useState({
    descricao: '', valor: '', tipo: 'despesa' as 'receita' | 'despesa' | 'transferencia', 
    contaId: '', categoriaId: '', subcategoriaId: '', cartaoId: '', contaDestinoId: '',
    isParcelado: false, qtdParcelas: '1'
  });

  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().substring(0, 7));
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroCat, setFiltroCat] = useState('');

  const [novaCat, setNovaCat] = useState({ nome: '', tipo: 'Despesa' as 'Receita' | 'Despesa' });
  const [novaSubCat, setNovaSubCat] = useState({ nome: '', categoriaPaiId: '' });
  const [novaMeta, setNovaMeta] = useState({ nome: '', valorAlvo: '', prazo: '' });
  const [aporteMeta, setAporteMeta] = useState({ metaId: '', valor: '' });
  const [novoOrcamento, setNovoOrcamento] = useState({ categoriaId: '', limite: '' });
  const [novoInvestimento, setNovoInvestimento] = useState({ nome: '', tipo: 'Ações', quantidade: '', precoMedio: '', precoAtual: '' });
  const [novoRecorrente, setNovoRecorrente] = useState({ descricao: '', valor: '', tipo: 'despesa' as 'receita' | 'despesa', categoriaId: '', subcategoriaId: '', frequencia: 'Mensal' as 'Mensal' | 'Semanal', diaVencimento: '' });
  
  // NOVO: Estado para criar contas
  const [novaConta, setNovaConta] = useState({ nome: '', tipo: 'Banco' as 'Dinheiro' | 'Banco' | 'Cartão', saldoInicial: '0' });

  // --- PERSISTÊNCIA DE TEMA ---
  useEffect(() => {
    const t = localStorage.getItem('tema') as 'light' | 'dark' | null;
    const c = localStorage.getItem('corDestaque') || 'blue';
    const f = localStorage.getItem('fonteGrande') === 'true';
    if (t) setTema(t); setCorDestaque(c); setFonteGrande(f);
  }, []);
  useEffect(() => {
    localStorage.setItem('tema', tema); localStorage.setItem('corDestaque', corDestaque); localStorage.setItem('fonteGrande', String(fonteGrande));
    document.documentElement.classList.toggle('dark', tema === 'dark');
    document.documentElement.style.fontSize = fonteGrande ? '112%' : '100%';
  }, [tema, corDestaque, fonteGrande]);

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
    const init = async () => {
      const [t, c, cat, sub, m, orc, inv, rec] = await Promise.all([
        db.transacoes.toArray(), db.contas.toArray(), db.categorias.toArray(),
        db.subcategorias.toArray(), db.metas.toArray(), db.orcamentos.toArray(), 
        db.investimentos.toArray(), db.recorrentes.toArray()
      ]);
      if (c.length === 0) {
        const id = await db.contas.add({ nome: 'Carteira/Dinheiro', tipo: 'Dinheiro', saldo: 0 });
        c.push({ id, nome: 'Carteira/Dinheiro', tipo: 'Dinheiro', saldo: 0 });
      }
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      const contaPadraoId = c[0].id!;
      for (const item of rec) {
        const vencimento = new Date(item.proximoVencimento); vencimento.setHours(0,0,0,0);
        if (vencimento <= hoje) {
          await db.transacoes.add({ descricao: item.descricao, valor: item.valor, tipo: item.tipo, contaId: contaPadraoId, categoriaId: item.categoriaId, subcategoriaId: item.subcategoriaId || null, cartaoId: null, data: item.proximoVencimento });
          const conta = c.find(cont => cont.id === contaPadraoId);
          if (conta) {
            const novoSaldo = item.tipo === 'receita' ? conta.saldo + item.valor : conta.saldo - item.valor;
            await db.contas.update(conta.id!, { saldo: novoSaldo }); conta.saldo = novoSaldo;
          }
          const proximo = new Date(item.proximoVencimento);
          if (item.frequencia === 'Mensal') proximo.setMonth(proximo.getMonth() + 1); else proximo.setDate(proximo.getDate() + 7);
          await db.recorrentes.update(item.id!, { proximoVencimento: proximo.toISOString() }); item.proximoVencimento = proximo.toISOString();
        }
      }
      setTransacoes(t); setContas(c); setCategorias(cat); setSubcategorias(sub); 
      setMetas(m); setOrcamentos(orc); setInvestimentos(inv); setRecorrentes(rec);
      if (c.length > 0) setForm(prev => ({ ...prev, contaId: String(c[0].id!) }));
      setCarregado(true);
    }; init();
  }, []);

  // --- FUNÇÕES ---
  const adicionarConta = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!novaConta.nome.trim()) return;
    const id = await db.contas.add({ nome: novaConta.nome, tipo: novaConta.tipo, saldo: parseFloat(novaConta.saldoInicial) || 0 });
    const nova = await db.contas.get(id!);
    if(nova) setContas(prev => [...prev, nova]);
    setNovaConta({ nome: '', tipo: 'Banco', saldoInicial: '0' });
  };
  const removerConta = async (id: number) => {
    if(contas.length <= 1) { alert("Você precisa manter pelo menos uma conta!"); return; }
    if(confirm("Remover esta conta? O saldo será perdido.")) {
      await db.contas.delete(id);
      setContas(prev => prev.filter(c => c.id !== id));
    }
  };

  const adicionarSubcategoria = async (e: React.FormEvent) => {
    e.preventDefault(); if (!novaSubCat.nome || !novaSubCat.categoriaPaiId) return;
    const id = await db.subcategorias.add({ nome: novaSubCat.nome, categoriaPaiId: Number(novaSubCat.categoriaPaiId) });
    const nova = await db.subcategorias.get(id!); if(nova) setSubcategorias(prev => [...prev, nova]);
    setNovaSubCat({ nome: '', categoriaPaiId: '' });
  };
  const adicionarRecorrente = async (e: React.FormEvent) => {
    e.preventDefault(); if(!novoRecorrente.descricao || !novoRecorrente.valor || !novoRecorrente.diaVencimento) return;
    const proximo = new Date(); const diaEscolhido = parseInt(novoRecorrente.diaVencimento);
    if (novoRecorrente.frequencia === 'Mensal') { proximo.setDate(diaEscolhido); if (proximo < new Date()) proximo.setMonth(proximo.getMonth() + 1); }
    else { proximo.setDate(proximo.getDate() + ((diaEscolhido - proximo.getDay() + 7) % 7)); }
    proximo.setHours(0,0,0,0);
    const id = await db.recorrentes.add({ descricao: novoRecorrente.descricao, valor: parseFloat(novoRecorrente.valor), tipo: novoRecorrente.tipo, categoriaId: novoRecorrente.categoriaId ? Number(novoRecorrente.categoriaId) : null, subcategoriaId: novoRecorrente.subcategoriaId ? Number(novoRecorrente.subcategoriaId) : null, frequencia: novoRecorrente.frequencia, proximoVencimento: proximo.toISOString() });
    const novo = await db.recorrentes.get(id!); if(novo) setRecorrentes(prev => [...prev, novo]);
    setNovoRecorrente({ descricao: '', valor: '', tipo: 'despesa', categoriaId: '', subcategoriaId: '', frequencia: 'Mensal', diaVencimento: '' });
  };
  const removerRecorrente = async (id: number) => { if(confirm("Remover conta fixa?")) { await db.recorrentes.delete(id); setRecorrentes(prev => prev.filter(r => r.id !== id)); } };

  const adicionarTransacao = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form.descricao || !form.valor || !form.contaId) return;
    const valorTotal = parseFloat(form.valor); const qtdParcelas = form.isParcelado ? parseInt(form.qtdParcelas) : 1;
    const valorParcela = valorTotal / qtdParcelas; const cartaoSelecionado = form.tipo === 'transferencia' ? null : (form.cartaoId ? Number(form.cartaoId) : null);
    const contaAtual = contas.find(c => c.id === Number(form.contaId)); const contaDest = form.contaDestinoId ? contas.find(c => c.id === Number(form.contaDestinoId)) : null;
    const subCatId = form.subcategoriaId ? Number(form.subcategoriaId) : null;
    if (form.tipo === 'transferencia') {
      if (!contaDest || !contaAtual) return; if (contaAtual.saldo < valorTotal) { alert("Saldo insuficiente!"); return; }
      await db.transacoes.add({ descricao: `Transf: ${contaAtual.nome} -> ${contaDest.nome}`, valor: valorTotal, tipo: 'transferencia', contaId: Number(form.contaId), contaDestinoId: Number(form.contaDestinoId), categoriaId: null, subcategoriaId: null, cartaoId: null, data: new Date().toISOString() });
      await db.contas.update(contaAtual.id!, { saldo: contaAtual.saldo - valorTotal }); await db.contas.update(contaDest.id!, { saldo: contaDest.saldo + valorTotal });
      setContas(prev => prev.map(c => c.id === contaAtual!.id ? { ...c, saldo: c.saldo - valorTotal } : c.id === contaDest!.id ? { ...c, saldo: c.saldo + valorTotal } : c));
      setForm(prev => ({ ...prev, descricao: '', valor: '' })); db.transacoes.toArray().then(t => setTransacoes(t)); return;
    }
    for (let i = 0; i < qtdParcelas; i++) {
      const dataParcela = new Date(); dataParcela.setMonth(dataParcela.getMonth() + i);
      await db.transacoes.add({ descricao: qtdParcelas > 1 ? `${form.descricao} (${i + 1}/${qtdParcelas})` : form.descricao, valor: valorParcela, tipo: form.tipo, contaId: Number(form.contaId), categoriaId: form.categoriaId ? Number(form.categoriaId) : null, subcategoriaId: subCatId, cartaoId: cartaoSelecionado, data: dataParcela.toISOString() });
    }
    if (contaAtual) {
      const novoSaldo = form.tipo === 'receita' ? contaAtual.saldo + valorTotal : contaAtual.saldo - valorTotal;
      await db.contas.update(contaAtual.id!, { saldo: novoSaldo }); setContas(prev => prev.map(c => c.id === contaAtual.id ? { ...c, saldo: novoSaldo } : c));
    }
    setForm(prev => ({ ...prev, descricao: '', valor: '', categoriaId: '', subcategoriaId: '', cartaoId: '', isParcelado: false, qtdParcelas: '1' }));
    db.transacoes.toArray().then(t => setTransacoes(t));
  };

  const adicionarInvestimento = async (e: React.FormEvent) => { e.preventDefault(); const id = await db.investimentos.add({ nome: novoInvestimento.nome, tipo: novoInvestimento.tipo as any, quantidade: parseFloat(novoInvestimento.quantidade), precoMedio: parseFloat(novoInvestimento.precoMedio), precoAtual: parseFloat(novoInvestimento.precoAtual) }); const inv = await db.investimentos.get(id!); if (inv) setInvestimentos(prev => [...prev, inv]); setNovoInvestimento({ nome: '', tipo: 'Ações', quantidade: '', precoMedio: '', precoAtual: '' }); };
  const atualizarInvestimento = async (id: number, precoAtual: number) => { await db.investimentos.update(id, { precoAtual }); setInvestimentos(prev => prev.map(i => i.id === id ? { ...i, precoAtual } : i)); };
  const removerInvestimento = async (id: number) => { if (confirm("Remover ativo?")) { await db.investimentos.delete(id); setInvestimentos(prev => prev.filter(i => i.id !== id)); } };
  const adicionarMeta = async (e: React.FormEvent) => { e.preventDefault(); const id = await db.metas.add({ nome: novaMeta.nome, valorAlvo: parseFloat(novaMeta.valorAlvo), valorAtual: 0, prazo: new Date(novaMeta.prazo).toISOString() }); const meta = await db.metas.get(id!); if (meta) setMetas(prev => [...prev, meta]); setNovaMeta({ nome: '', valorAlvo: '', prazo: '' }); };
  const removerMeta = async (id: number) => { if (confirm("Remover meta?")) { await db.metas.delete(id); setMetas(prev => prev.filter(m => m.id !== id)); } };
  const aportarMeta = async (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!aporteMeta.metaId || !aporteMeta.valor) return; const metaId = Number(aporteMeta.metaId); const valor = parseFloat(aporteMeta.valor); const metaAtual = metas.find(m => m.id === metaId); if (!metaAtual) return; const novoValor = metaAtual.valorAtual + valor; await db.metas.update(metaId, { valorAtual: novoValor }); setMetas(prev => prev.map(m => m.id === metaId ? { ...m, valorAtual: novoValor } : m)); setAporteMeta({ metaId: '', valor: '' }); };
  const definirOrcamento = async (e: React.FormEvent) => { e.preventDefault(); if (!novoOrcamento.categoriaId || !novoOrcamento.limite) return; const catId = Number(novoOrcamento.categoriaId); const limite = parseFloat(novoOrcamento.limite); const existente = orcamentos.find(o => o.categoriaId === catId); if (existente) { await db.orcamentos.update(existente.id!, { limite }); setOrcamentos(prev => prev.map(o => o.categoriaId === catId ? { ...o, limite } : o)); } else { const id = await db.orcamentos.add({ categoriaId: catId, limite }); const novo = await db.orcamentos.get(id!); if (novo) setOrcamentos(prev => [...prev, novo]); } setNovoOrcamento({ categoriaId: '', limite: '' }); };
  const removerOrcamento = async (catId: number) => { if (confirm("Remover limite?")) { const ex = orcamentos.find(o => o.categoriaId === catId); if (ex) { await db.orcamentos.delete(ex.id!); setOrcamentos(prev => prev.filter(o => o.categoriaId !== catId)); } } };
  const adicionarCategoria = async (e: React.FormEvent) => { e.preventDefault(); if (!novaCat.nome.trim()) return; const id = await db.categorias.add({ nome: novaCat.nome, tipo: novaCat.tipo }); const nova = await db.categorias.get(id!); if (nova) setCategorias(prev => [...prev, nova]); setNovaCat({ nome: '', tipo: 'Despesa' }); };
  const removerCategoria = async (id: number) => { if (confirm("Remover?")) { await db.categorias.delete(id); setCategorias(prev => prev.filter(c => c.id !== id)); } };
  const limparHistorico = async () => { if (confirm("⚠️ Apagar TUDO?")) { await Promise.all([db.transacoes.clear(), db.metas.clear(), db.orcamentos.clear(), db.investimentos.clear(), db.recorrentes.clear(), db.subcategorias.clear()]); await db.contas.toCollection().modify({ saldo: 0 }); setTransacoes([]); setMetas([]); setOrcamentos([]); setInvestimentos([]); setRecorrentes([]); setSubcategorias([]); setContas(prev => prev.map(c => ({ ...c, saldo: 0 }))); } };

  const exportarCSV = async () => {
    const todos = await db.transacoes.toArray(); let csv = "text/csv;charset=utf-8,Data,Descricao,Tipo,Categoria,Subcategoria,Conta,Valor\n";
    todos.forEach(t => { const cat = categorias.find(c => c.id === t.categoriaId)?.nome || 'Geral'; const sub = subcategorias.find(s => s.id === t.subcategoriaId)?.nome || '-'; const conta = contas.find(c => c.id === t.contaId)?.nome || 'Geral'; csv += `${new Date(t.data).toLocaleDateString('pt-BR')},"${t.descricao}",${t.tipo},"${cat}","${sub}","${conta}",${t.valor}\n`; });
    const link = document.createElement("a"); link.href = encodeURI(csv); link.download = "financas.csv"; document.body.appendChild(link); link.click();
  };
  const exportarDados = async () => {
    const senha = prompt("🔒 Proteger backup com senha?\nDeixe vazio para salvar sem senha.");
    const dados = { transacoes: await db.transacoes.toArray(), contas: await db.contas.toArray(), categorias: await db.categorias.toArray(), subcategorias: await db.subcategorias.toArray(), metas: await db.metas.toArray(), orcamentos: await db.orcamentos.toArray(), investimentos: await db.investimentos.toArray(), recorrentes: await db.recorrentes.toArray() };
    const json = JSON.stringify(dados, null, 2); let final = json, nome = `financas_${new Date().toISOString().split('T')[0]}.json`;
    if (senha?.trim()) { final = CryptoJS.AES.encrypt(json, senha).toString(); nome = `financas_seguro_${new Date().toISOString().split('T')[0]}.enc`; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([final], { type: 'application/json' })); a.download = nome; a.click();
  };
  const importarDados = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader();
    reader.onload = async (ev) => {
      try { let txt = ev.target?.result as string;
        if (txt.startsWith("U2FsdGVkX1")) { const senha = prompt("🔐 Arquivo protegido. Digite a senha:"); if (!senha) return; const bytes = CryptoJS.AES.decrypt(txt, senha); txt = bytes.toString(CryptoJS.enc.Utf8); if (!txt) { alert("❌ Senha incorreta."); return; } }
        const d = JSON.parse(txt); await Promise.all([db.transacoes.clear(), db.contas.clear(), db.categorias.clear(), db.subcategorias.clear(), db.metas.clear(), db.orcamentos.clear(), db.investimentos.clear(), db.recorrentes.clear()]);
        if (d.contas) await db.contas.bulkAdd(d.contas); if (d.categorias) await db.categorias.bulkAdd(d.categorias); if (d.subcategorias) await db.subcategorias.bulkAdd(d.subcategorias); if (d.metas) await db.metas.bulkAdd(d.metas); if (d.orcamentos) await db.orcamentos.bulkAdd(d.orcamentos); if (d.investimentos) await db.investimentos.bulkAdd(d.investimentos); if (d.transacoes) await db.transacoes.bulkAdd(d.transacoes); if (d.recorrentes) await db.recorrentes.bulkAdd(d.recorrentes);
        alert("✅ Importado!"); window.location.reload();
      } catch { alert('❌ Erro ao importar.'); }
    }; reader.readAsText(file);
  };

  const despesas = transacoes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
  const saldoContas = contas.reduce((s, c) => s + c.saldo, 0);
  const saldoInvestido = investimentos.reduce((s, i) => s + (i.quantidade * i.precoAtual), 0);
  const patrimonioTotal = saldoContas + saldoInvestido;
  const dadosPizzaInvest = useMemo(() => investimentos.map(i => ({ name: i.nome, value: i.quantidade * i.precoAtual })), [investimentos]);
  const cores = [CORES[corDestaque as keyof typeof CORES].bg, '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];
  const lembretes = useMemo(() => { const hoje = new Date(); const tres = new Date(); tres.setDate(tres.getDate() + 3); return recorrentes.filter(r => { const v = new Date(r.proximoVencimento); return v >= hoje && v <= tres; }); }, [recorrentes]);
  const transacoesFiltradas = useMemo(() => {
    return transacoes.filter(t => { const m = `${new Date(t.data).getFullYear()}-${String(new Date(t.data).getMonth() + 1).padStart(2, '0')}`; if (filtroMes && m !== filtroMes) return false; if (filtroTexto && !t.descricao.toLowerCase().includes(filtroTexto.toLowerCase())) return false; if (filtroCat && t.categoriaId !== Number(filtroCat)) return false; return true; }).sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [transacoes, filtroMes, filtroTexto, filtroCat]);
  const cor = CORES[corDestaque as keyof typeof CORES];

  if (!carregado) return <div className="flex h-screen items-center justify-center">Carregando...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6 pb-20 transition-colors duration-300">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Finanças</h1>
          <div className="flex gap-2 text-sm">
             <label className="cursor-pointer bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded-lg hover:opacity-80 transition" title="Importar">📥</label>
             <input type="file" accept=".json,.enc" className="hidden" onChange={importarDados} />
             <button onClick={exportarDados} style={{backgroundColor: cor.bg}} className="text-white px-3 py-1.5 rounded-lg transition hover:opacity-90" title="Backup">📤</button>
             <button onClick={exportarCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition" title="Excel">📊</button>
          </div>
        </div>
        <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto">
          {(['dashboard', 'investimentos', 'contas', 'metas', 'orcamentos', 'config'] as const).map(tab => (
            <button key={tab} onClick={() => setAbaAtiva(tab)} 
              className={`flex-1 py-2 rounded-lg font-medium transition min-w-[70px] ${abaAtiva === tab ? 'bg-white dark:bg-gray-700 shadow' : 'opacity-60 hover:opacity-100'}`}
              style={abaAtiva === tab ? {color: cor.text} : {}}>
              {tab === 'dashboard' ? 'Dashboard' : tab === 'investimentos' ? 'Invest' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {abaAtiva === 'dashboard' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {lembretes.length > 0 && (
            <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-500 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-lg flex items-center gap-2">
              <span className="text-xl">⏰</span><div><p className="font-bold">Contas a vencer!</p><p className="text-sm">{lembretes.length} conta(s) nos próximos 3 dias.</p></div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-xl"><p className="text-xs opacity-70">Patrimônio</p><p className="text-lg font-bold">R$ {patrimonioTotal.toFixed(0)}</p></div>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-xl"><p className="text-xs opacity-70">Saldo</p><p className="text-lg font-bold">R$ {saldoContas.toFixed(2)}</p></div>
            <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-xl"><p className="text-xs opacity-70">Investido</p><p className="text-lg font-bold">R$ {saldoInvestido.toFixed(2)}</p></div>
            <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-xl"><p className="text-xs opacity-70">Despesas</p><p className="text-lg font-bold text-red-600">- {despesas.toFixed(0)}</p></div>
          </div>
          <form onSubmit={adicionarTransacao} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Descrição" required className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 outline-none focus:ring-2" style={{'--tw-ring-color': cor.bg} as any} value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} />
              <input type="number" step="0.01" placeholder="Valor" required className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 outline-none focus:ring-2" style={{'--tw-ring-color': cor.bg} as any} value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} />
            </div>
            <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 outline-none focus:ring-2" style={{'--tw-ring-color': cor.bg} as any} value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value as any, categoriaId: '', subcategoriaId: ''})}>
              <option value="despesa">💸 Despesa</option><option value="receita">💰 Receita</option><option value="transferencia">🔄 Transferência</option>
            </select>
            {form.tipo === 'transferencia' ? (
              <div className="grid grid-cols-2 gap-3">
                <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={form.contaId} onChange={e => setForm({...form, contaId: e.target.value})} required>
                  <option value="">Origem</option>{contas.map(c => <option key={c.id} value={c.id}>{c.nome} (R${c.saldo})</option>)}
                </select>
                <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={form.contaDestinoId} onChange={e => setForm({...form, contaDestinoId: e.target.value})} required>
                  <option value="">Destino</option>{contas.filter(c => c.id !== Number(form.contaId)).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={form.contaId} onChange={e => setForm({...form, contaId: e.target.value})} required>{contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={form.categoriaId} onChange={e => setForm({...form, categoriaId: e.target.value, subcategoriaId: ''})}>
                  <option value="">Categoria...</option>{categorias.filter(c => c.tipo === (form.tipo === 'receita' ? 'Receita' : 'Despesa')).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <select className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={form.subcategoriaId} onChange={e => setForm({...form, subcategoriaId: e.target.value})}>
                  <option value="">Subcategoria...</option>{subcategorias.filter(s => s.categoriaPaiId === Number(form.categoriaId)).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                {form.tipo === 'despesa' && (
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg border dark:border-gray-600">
                    <label className="flex items-center gap-1 text-sm cursor-pointer"><input type="checkbox" checked={form.isParcelado} onChange={e => setForm({...form, isParcelado: e.target.checked, qtdParcelas: e.target.checked ? '2' : '1'})} /> 12x</label>
                    {form.isParcelado && <input type="number" min="2" max="48" className="w-12 p-1 border rounded text-center bg-white dark:bg-gray-800" value={form.qtdParcelas} onChange={e => setForm({...form, qtdParcelas: e.target.value})} />}
                  </div>
                )}
              </div>
            )}
            <button type="submit" style={{backgroundColor: cor.bg}} className="w-full text-white p-3 rounded-lg font-bold transition hover:opacity-90">✅ Registrar</button>
          </form>
          <div className="space-y-4">
            <h3 className="font-bold text-lg flex justify-between"><span>Histórico</span><span className="text-sm font-normal opacity-60">{transacoesFiltradas.length} registros</span></h3>
            <div className="flex flex-col sm:flex-row gap-2">
               <input type="month" className="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} />
               <input type="text" placeholder="🔍 Buscar..." className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)} />
               <select className="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value={filtroCat} onChange={e => setFiltroCat(e.target.value)}><option value="">Todas</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transacoesFiltradas.map(t => {
                const cat = categorias.find(c => c.id === t.categoriaId)?.nome || '';
                const sub = subcategorias.find(s => s.id === t.subcategoriaId)?.nome;
                return (
                  <div key={t.id} className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-lg shadow border-l-4 text-sm" style={{borderLeftColor: cor.bg}}>
                    <div><p className="font-bold">{t.descricao} {sub && <span className="text-xs opacity-60 ml-1">({sub})</span>}</p><p className="text-xs opacity-60">{new Date(t.data).toLocaleDateString('pt-BR')} • {cat}</p></div>
                    <p className={t.tipo === 'receita' ? 'text-green-600 font-bold' : t.tipo === 'transferencia' ? 'opacity-60 font-bold' : 'text-red-600 font-bold'}>{t.tipo === 'receita' ? '+' : t.tipo === 'transferencia' ? '↔' : '-'} R$ {t.valor.toFixed(2)}</p>
                  </div>
                );
              })}
              {transacoesFiltradas.length === 0 && <p className="text-center opacity-50 py-4">Nenhum registro.</p>}
            </div>
          </div>
        </div>
      )}

      {abaAtiva === 'investimentos' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
              <h2 className="text-xl font-bold">Adicionar Ativo</h2>
              <form onSubmit={adicionarInvestimento} className="space-y-3">
                <input type="text" placeholder="Nome" required className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.nome} onChange={e => setNovoInvestimento({...novoInvestimento, nome: e.target.value})} />
                <div className="grid grid-cols-2 gap-3">
                  <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.tipo} onChange={e => setNovoInvestimento({...novoInvestimento, tipo: e.target.value})}><option value="Ações">Ações</option><option value="Cripto">Cripto</option><option value="Renda Fixa">Renda Fixa</option><option value="Fundos">Fundos</option></select>
                  <input type="number" step="any" placeholder="Qtd" required className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.quantidade} onChange={e => setNovoInvestimento({...novoInvestimento, quantidade: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" step="any" placeholder="Preço Médio" required className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.precoMedio} onChange={e => setNovoInvestimento({...novoInvestimento, precoMedio: e.target.value})} />
                  <input type="number" step="any" placeholder="Preço Atual" required className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoInvestimento.precoAtual} onChange={e => setNovoInvestimento({...novoInvestimento, precoAtual: e.target.value})} />
                </div>
                <button type="submit" style={{backgroundColor: cor.bg}} className="w-full text-white p-3 rounded-lg font-bold">💎 Adicionar</button>
              </form>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow">
              <h2 className="text-xl font-bold mb-4">Distribuição</h2>
              <div className="h-64">{dadosPizzaInvest.length > 0 ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dadosPizzaInvest} cx="50%" cy="50%" outerRadius={80} dataKey="value">{dadosPizzaInvest.map((_, i) => <Cell key={i} fill={cores[i % cores.length]} />)}</Pie><Tooltip formatter={(val: any) => `R$ ${Number(val).toFixed(2)}`} /></PieChart></ResponsiveContainer> : <p className="text-center opacity-50 h-full flex items-center justify-center">Sem ativos</p>}</div>
            </div>
          </div>
          <div className="space-y-3">
            {investimentos.map(inv => {
              const total = inv.quantidade * inv.precoAtual; const lucro = total - (inv.quantidade * inv.precoMedio); const perc = ((inv.precoAtual - inv.precoMedio) / inv.precoMedio) * 100;
              return (<div key={inv.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow flex justify-between items-center border dark:border-gray-700"><div><p className="font-bold">{inv.nome} <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded ml-2">{inv.tipo}</span></p><p className="text-sm opacity-60">{inv.quantidade} un. @ R$ {inv.precoMedio.toFixed(2)}</p></div><div className="text-right"><p className="font-bold">R$ {total.toFixed(2)}</p><p className={`text-sm font-bold ${lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{lucro >= 0 ? '+' : ''}{perc.toFixed(2)}%</p><div className="flex gap-2 mt-2 justify-end"><input type="number" step="any" placeholder="Preço" className="w-20 p-1 text-xs border rounded dark:bg-gray-700" onBlur={e => e.target.value && atualizarInvestimento(inv.id!, parseFloat(e.target.value))} /><button onClick={() => removerInvestimento(inv.id!)} className="text-red-500 text-xs">✕</button></div></div></div>);
            })}
          </div>
        </div>
      )}

      {/* ✅ NOVA ABA: CONTAS */}
      {abaAtiva === 'contas' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <h2 className="text-xl font-bold">💳 Gerenciar Contas</h2>
            <form onSubmit={adicionarConta} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input placeholder="Nome (ex: Nubank)" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaConta.nome} onChange={e => setNovaConta({...novaConta, nome: e.target.value})} required />
              <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaConta.tipo} onChange={e => setNovaConta({...novaConta, tipo: e.target.value as any})}>
                <option value="Banco">Banco Digital</option>
                <option value="Dinheiro">Dinheiro/Carteira</option>
                <option value="Cartão">Cartão de Crédito</option>
              </select>
              <input type="number" step="0.01" placeholder="Saldo Inicial" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaConta.saldoInicial} onChange={e => setNovaConta({...novaConta, saldoInicial: e.target.value})} />
              <button style={{backgroundColor: cor.bg}} className="text-white rounded-lg font-bold hover:opacity-90 transition">+ Adicionar</button>
            </form>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contas.map(c => (
              <div key={c.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow border-l-4 relative hover:shadow-md transition" style={{borderLeftColor: cor.bg}}>
                <button onClick={() => removerConta(c.id!)} className="absolute top-3 right-3 opacity-30 hover:opacity-100 transition">✕</button>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-lg">{c.nome}</p>
                    <p className="text-xs uppercase tracking-wide opacity-60 mt-1">{c.tipo}</p>
                  </div>
                  <p className={`text-2xl font-bold ${c.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>R$ {c.saldo.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {abaAtiva === 'metas' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <h2 className="text-xl font-bold">Nova Meta</h2>
            <form onSubmit={adicionarMeta} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input placeholder="Nome" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaMeta.nome} onChange={e => setNovaMeta({...novaMeta, nome: e.target.value})} required />
              <input type="number" placeholder="Alvo" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaMeta.valorAlvo} onChange={e => setNovaMeta({...novaMeta, valorAlvo: e.target.value})} required />
              <input type="date" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaMeta.prazo} onChange={e => setNovaMeta({...novaMeta, prazo: e.target.value})} required />
              <button style={{backgroundColor: cor.bg}} className="text-white rounded-lg font-bold">+ Criar</button>
            </form>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metas.map(m => (<div key={m.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow border-l-4 relative" style={{borderLeftColor: cor.bg}}><button onClick={() => removerMeta(m.id!)} className="absolute top-3 right-3 opacity-40 hover:opacity-100">✕</button><div className="flex justify-between mb-2"><h3 className="font-bold">{m.nome}</h3><span className="text-sm font-bold" style={{color: cor.text}}>{((m.valorAtual/m.valorAlvo)*100).toFixed(0)}%</span></div><div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full mb-3"><div className="h-2 rounded-full transition-all" style={{width: `${Math.min((m.valorAtual/m.valorAlvo)*100, 100)}%`, backgroundColor: cor.bg}}></div></div><div className="flex justify-between text-xs opacity-60 mb-3"><span>R${m.valorAtual.toFixed(0)}</span><span>R${m.valorAlvo.toFixed(0)}</span></div><form onSubmit={(e) => aportarMeta(e)} className="flex gap-2"><select className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value={aporteMeta.metaId} onChange={e => setAporteMeta({...aporteMeta, metaId: e.target.value})}><option value="">Selecione</option>{metas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select><input type="number" placeholder="R$" className="w-24 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value={aporteMeta.valor} onChange={e => setAporteMeta({...aporteMeta, valor: e.target.value})} /><button style={{backgroundColor: cor.bg}} className="text-white px-3 rounded-lg text-sm font-bold">💰</button></form></div>))}
          </div>
        </div>
      )}

      {abaAtiva === 'orcamentos' && (
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
             <h2 className="text-xl font-bold">Orçamento</h2>
             <form onSubmit={definirOrcamento} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
               <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoOrcamento.categoriaId} onChange={e => setNovoOrcamento({...novoOrcamento, categoriaId: e.target.value})} required><option value="">Categoria...</option>{categorias.filter(c=>c.tipo==='Despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
               <input type="number" placeholder="Limite" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoOrcamento.limite} onChange={e => setNovoOrcamento({...novoOrcamento, limite: e.target.value})} required />
               <button style={{backgroundColor: cor.bg}} className="text-white rounded-lg font-bold">💰 Definir</button>
             </form>
           </div>
           <div className="space-y-3">
             {orcamentos.map(orc => {
               const gasto = transacoes.filter(t => t.categoriaId === orc.categoriaId && t.tipo === 'despesa').reduce((s,t) => s + t.valor, 0);
               const pct = (gasto / orc.limite) * 100; const nome = categorias.find(c => c.id === orc.categoriaId)?.nome || 'Cat';
               return (<div key={orc.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow flex justify-between items-center border-l-4" style={{borderLeftColor: pct>100 ? '#ef4444' : cor.bg}}><div className="flex-1"><div className="flex justify-between mb-1"><h3 className="font-bold">{nome}</h3><span className={`text-sm font-bold ${pct>100?'text-red-600':''}`}>{pct.toFixed(0)}%</span></div><div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full"><div className="h-2 rounded-full" style={{width: `${Math.min(pct, 100)}%`, backgroundColor: pct>100 ? '#ef4444' : cor.bg}}></div></div><p className="text-xs mt-1 opacity-60">Gasto: R${gasto.toFixed(0)} / Limite: R${orc.limite.toFixed(0)}</p></div><button onClick={() => removerOrcamento(orc.categoriaId!)} className="opacity-40 hover:opacity-100">✕</button></div>);
             })}
             {orcamentos.length === 0 && <p className="text-center opacity-50 py-8">Nenhum orçamento.</p>}
           </div>
        </div>
      )}

      {abaAtiva === 'config' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <h2 className="text-xl font-bold">🎨 Aparência</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span>Modo Escuro</span>
                <button onClick={() => setTema(t => t === 'dark' ? 'light' : 'dark')} className={`w-12 h-6 rounded-full p-1 transition ${tema === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full transition transform ${tema === 'dark' ? 'translate-x-6' : ''}`}></div></button>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span>Fonte Grande</span>
                <button onClick={() => setFonteGrande(f => !f)} className={`w-12 h-6 rounded-full p-1 transition ${fonteGrande ? 'bg-gray-600' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full transition transform ${fonteGrande ? 'translate-x-6' : ''}`}></div></button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Cor de Destaque</p>
              <div className="flex gap-3">
                {Object.keys(CORES).map(c => (
                  <button key={c} onClick={() => setCorDestaque(c)} className={`w-10 h-10 rounded-full border-2 transition ${corDestaque === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`} style={{backgroundColor: CORES[c as keyof typeof CORES].bg}}></button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <h2 className="text-xl font-bold">🔄 Recorrentes</h2>
            <form onSubmit={adicionarRecorrente} className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <input placeholder="Descrição" className="sm:col-span-2 p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoRecorrente.descricao} onChange={e => setNovoRecorrente({...novoRecorrente, descricao: e.target.value})} required />
              <input type="number" placeholder="Valor" className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoRecorrente.valor} onChange={e => setNovoRecorrente({...novoRecorrente, valor: e.target.value})} required />
              {novoRecorrente.frequencia === 'Mensal' ? (
                <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoRecorrente.diaVencimento} onChange={e => setNovoRecorrente({...novoRecorrente, diaVencimento: e.target.value})} required>
                  <option value="">Dia</option>{Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}º</option>)}
                </select>
              ) : (
                <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoRecorrente.diaVencimento} onChange={e => setNovoRecorrente({...novoRecorrente, diaVencimento: e.target.value})} required>
                  <option value="">Dia</option><option value="0">Dom</option><option value="1">Seg</option><option value="2">Ter</option><option value="3">Qua</option><option value="4">Qui</option><option value="5">Sex</option><option value="6">Sáb</option>
                </select>
              )}
              <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novoRecorrente.frequencia} onChange={e => setNovoRecorrente({...novoRecorrente, frequencia: e.target.value as any, diaVencimento: ''})}><option value="Mensal">Mensal</option><option value="Semanal">Semanal</option></select>
              <button style={{backgroundColor: cor.bg}} className="text-white rounded-lg font-bold">+ Salvar</button>
            </form>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {recorrentes.map(r => (<div key={r.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-l-4" style={{borderLeftColor: cor.bg}}><div><p className="font-bold">{r.descricao}</p><p className="text-xs opacity-60">{new Date(r.proximoVencimento).toLocaleDateString('pt-BR')}</p></div><div className="flex items-center gap-3"><span className={`font-bold ${r.tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>R$ {r.valor.toFixed(2)}</span><button onClick={() => removerRecorrente(r.id!)} className="opacity-40 hover:opacity-100">🗑️</button></div></div>))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow space-y-4">
            <h2 className="text-xl font-bold">📂 Categorias</h2>
            <form onSubmit={adicionarCategoria} className="flex gap-2">
              <input placeholder="Nome" className="flex-1 p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaCat.nome} onChange={e => setNovaCat({...novaCat, nome: e.target.value})} required />
              <select className="p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value={novaCat.tipo} onChange={e => setNovaCat({...novaCat, tipo: e.target.value as any})}><option value="Despesa">Despesa</option><option value="Receita">Receita</option></select>
              <button style={{backgroundColor: cor.bg}} className="text-white px-4 rounded-lg font-bold">+</button>
            </form>
            <form onSubmit={adicionarSubcategoria} className="flex gap-2 bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg">
               <select className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value={novaSubCat.categoriaPaiId} onChange={e => setNovaSubCat({...novaSubCat, categoriaPaiId: e.target.value})} required><option value="">Pai...</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
               <input placeholder="Subcategoria" className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value={novaSubCat.nome} onChange={e => setNovaSubCat({...novaSubCat, nome: e.target.value})} required />
               <button style={{backgroundColor: cor.bg}} className="text-white px-3 rounded-lg font-bold text-sm">+ Sub</button>
            </form>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {categorias.map(c => {
                const subs = subcategorias.filter(s => s.categoriaPaiId === c.id);
                return (<div key={c.id} className="mb-2"><div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-l-4" style={{borderLeftColor: cor.bg}}><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${c.tipo === 'Receita' ? 'bg-green-500' : 'bg-red-500'}`}></span><span className="font-bold">{c.nome}</span></div><button onClick={() => removerCategoria(c.id!)} className="opacity-40 hover:opacity-100">🗑️</button></div>{subs.length > 0 && <div className="ml-4 mt-1 space-y-1 border-l-2 border-gray-300 dark:border-gray-600 pl-2">{subs.map(s => <div key={s.id} className="p-2 text-sm bg-gray-100 dark:bg-gray-700/30 rounded">↳ {s.nome}</div>)}</div>}</div>);
              })}
            </div>
          </div>
          
          <div className="bg-red-50 dark:bg-red-900/20 p-5 rounded-xl border border-red-200 dark:border-red-800">
            <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">Zona de Perigo</h2>
            <button onClick={limparHistorico} className="w-full bg-red-600 hover:bg-red-700 text-white p-3 rounded-lg font-bold transition">🧹 Limpar Tudo</button>
          </div>
        </div>
      )}
    </div>
  );
}