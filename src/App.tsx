import { useState, useEffect, useMemo } from 'react';
import { db, type Transacao, type Conta, type Categoria, type Meta, type Orcamento, type Investimento, type Recorrente, type Subcategoria } from './db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import CryptoJS from 'crypto-js';

const CORES = {
  blue: { bg: '#2563eb', hover: '#1d4ed8', light: '#dbeafe', text: '#1e40af' },
  green: { bg: '#059669', hover: '#047857', light: '#d1fae5', text: '#065f46' },
  purple: { bg: '#7c3aed', hover: '#6d28d9', light: '#ede9fe', text: '#5b21b6' },
  amber: { bg: '#d97706', hover: '#b45309', light: '#fef3c7', text: '#92400e' }
};

const GRAFICO_CORES = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

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
  const [novaConta, setNovaConta] = useState({ nome: '', tipo: 'Banco' as 'Dinheiro' | 'Banco' | 'Cartão', saldoInicial: '0' });

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
  const lembretes = useMemo(() => { const hoje = new Date(); const tres = new Date(); tres.setDate(tres.getDate() + 3); return recorrentes.filter(r => { const v = new Date(r.proximoVencimento); return v >= hoje && v <= tres; }); }, [recorrentes]);
  const transacoesFiltradas = useMemo(() => {
    return transacoes.filter(t => { const m = `${new Date(t.data).getFullYear()}-${String(new Date(t.data).getMonth() + 1).padStart(2, '0')}`; if (filtroMes && m !== filtroMes) return false; if (filtroTexto && !t.descricao.toLowerCase().includes(filtroTexto.toLowerCase())) return false; if (filtroCat && t.categoriaId !== Number(filtroCat)) return false; return true; }).sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [transacoes, filtroMes, filtroTexto, filtroCat]);
  const dadosGastos = useMemo(() => {
    const mapa: Record<string, number> = {};
    transacoes.filter(t => t.tipo === 'despesa').forEach(t => { const cat = categorias.find(c => c.id === t.categoriaId)?.nome || 'Outros'; mapa[cat] = (mapa[cat] || 0) + t.valor; });
    return Object.entries(mapa).map(([name, value]) => ({ name, value }));
  }, [transacoes, categorias]);

  const cor = CORES[corDestaque as keyof typeof CORES];

  if (!carregado) return <div className="flex h-screen items-center justify-center bg-[#0f1117] text-white text-lg">Carregando Dashboard...</div>;

  return (
    <div className="flex h-screen bg-[#0f1117] text-gray-300 font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-20 lg:w-64 bg-[#161b22] flex flex-col border-r border-gray-800 transition-all shrink-0">
        <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-gray-800">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white shrink-0`} style={{backgroundColor: cor.bg}}>F</div>
          <span className="ml-3 font-bold text-white text-lg hidden lg:block">Finanças</span>
        </div>
        <nav className="flex-1 py-6 space-y-1 px-3">
          {[
            { id: 'dashboard', icon: '📊', label: 'Dashboard' },
            { id: 'contas', icon: '💳', label: 'Contas' },
            { id: 'investimentos', icon: '📈', label: 'Investimentos' },
            { id: 'metas', icon: '🎯', label: 'Metas' },
            { id: 'orcamentos', icon: '📋', label: 'Orçamentos' },
            { id: 'config', icon: '⚙️', label: 'Configurações' }
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setAbaAtiva(item.id as any)}
              className={`w-full flex items-center p-3 rounded-xl transition-all ${abaAtiva === item.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="ml-3 font-medium hidden lg:block">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
           <div className="flex items-center gap-3 justify-center lg:justify-start">
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 shrink-0"></div>
             <div className="hidden lg:block">
               <p className="text-sm font-bold text-white">Usuário</p>
             </div>
           </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8 bg-[#0f1117]">
        
        {/* HEADER */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
          <div>
            <h1 className="text-2xl font-bold text-white capitalize">{abaAtiva === 'dashboard' ? 'Visão Geral' : abaAtiva === 'investimentos' ? 'Investimentos' : abaAtiva === 'contas' ? 'Contas & Bancos' : abaAtiva === 'metas' ? 'Metas' : abaAtiva === 'orcamentos' ? 'Orçamentos' : 'Configurações'}</h1>
            <p className="text-gray-500 text-sm mt-1">{abaAtiva === 'dashboard' ? 'Resumo financeiro do mês' : abaAtiva === 'config' ? 'Personalize seu app' : 'Gerencie suas finanças'}</p>
          </div>
          <div className="flex gap-3">
            <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition border border-gray-700 flex items-center gap-2">📥 Importar<input type="file" accept=".json,.enc" className="hidden" onChange={importarDados} /></label>
            <button onClick={exportarDados} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition border border-gray-700">📤 Backup</button>
            <button onClick={exportarCSV} className="px-4 py-2 text-white font-bold rounded-lg text-sm transition shadow-lg flex items-center gap-2" style={{backgroundColor: cor.bg}}>📊 Excel</button>
          </div>
        </header>

        {abaAtiva === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* KPI CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#161b22] p-5 rounded-2xl border border-gray-800 hover:border-gray-700 transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">Patrimônio Total</p>
                    <h2 className="text-2xl lg:text-3xl font-bold text-white mt-2">R$ {patrimonioTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">💰</div>
                </div>
                <p className="text-green-400 text-sm mt-3 flex items-center gap-1">▲ <span className="text-gray-500">Saldo + Investimentos</span></p>
              </div>
              <div className="bg-[#161b22] p-5 rounded-2xl border border-gray-800 hover:border-gray-700 transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">Saldo em Contas</p>
                    <h2 className="text-2xl lg:text-3xl font-bold text-white mt-2">R$ {saldoContas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">🏦</div>
                </div>
                <p className="text-gray-500 text-sm mt-3">Disponível imediato</p>
              </div>
              <div className="bg-[#161b22] p-5 rounded-2xl border border-gray-800 hover:border-gray-700 transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">Investido</p>
                    <h2 className="text-2xl lg:text-3xl font-bold text-white mt-2">R$ {saldoInvestido.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">📈</div>
                </div>
                <p className="text-purple-400 text-sm mt-3">{investimentos.length} ativos cadastrados</p>
              </div>
              <div className="bg-[#161b22] p-5 rounded-2xl border border-gray-800 hover:border-gray-700 transition relative overflow-hidden">
                 <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl"></div>
                 <div className="flex justify-between items-start relative">
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">Despesas (Mês)</p>
                    <h2 className="text-2xl lg:text-3xl font-bold text-red-400 mt-2">- R$ {despesas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">📉</div>
                </div>
                <p className="text-red-400/50 text-sm mt-3">Total gasto este mês</p>
              </div>
            </div>

            {/* CHARTS & QUICK ADD GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* LEFT: CHARTS & TRANSACTIONS */}
              <div className="xl:col-span-2 space-y-6">
                
{/* Quick Add Form */}
                <div className="bg-[#161b22] p-6 rounded-2xl border border-gray-800">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2">➕ Nova Transação Rápida</h3>
                  <form onSubmit={adicionarTransacao} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input type="text" placeholder="Descrição (ex: Supermercado)" required className="w-full bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none transition" value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} />
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" step="0.01" placeholder="R$ Valor" required className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none transition" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} />
                        <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value as any, categoriaId: '', subcategoriaId: ''})}>
                          <option value="despesa">💸 Despesa</option>
                          <option value="receita">💰 Receita</option>
                        </select>
                      </div>
                    </div>
                    
                    {form.tipo !== 'transferencia' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={form.contaId} onChange={e => setForm({...form, contaId: e.target.value})} required>
                          <option value="">Selecionar Conta...</option>
                          {contas.map(c => <option key={c.id} value={c.id}>{c.nome} (R${c.saldo.toFixed(2)})</option>)}
                        </select>
                        <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={form.categoriaId} onChange={e => setForm({...form, categoriaId: e.target.value, subcategoriaId: ''})}>
                          <option value="">Categoria...</option>
                          {categorias.filter(c => c.tipo === (form.tipo === 'receita' ? 'Receita' : 'Despesa')).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                        <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={form.subcategoriaId} onChange={e => setForm({...form, subcategoriaId: e.target.value})}>
                          <option value="">Subcategoria...</option>
                          {subcategorias.filter(s => s.categoriaPaiId === Number(form.categoriaId)).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={form.contaId} onChange={e => setForm({...form, contaId: e.target.value})} required>
                          <option value="">Conta Origem</option>
                          {contas.map(c => <option key={c.id} value={c.id}>{c.nome} (R${c.saldo})</option>)}
                        </select>
                        <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={form.contaDestinoId} onChange={e => setForm({...form, contaDestinoId: e.target.value})} required>
                          <option value="">Conta Destino</option>
                          {contas.filter(c => c.id !== Number(form.contaId)).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 pt-2">
                      {/* BOTÃO REGISTRAR (AQUI ESTAVA FALTANDO OU ERRADO) */}
                      <button type="submit" className="flex-1 text-white font-bold py-3 rounded-xl transition shadow-lg hover:opacity-90 flex items-center justify-center gap-2" style={{backgroundColor: cor.bg}}>
                        ✅ Registrar
                      </button>
                      
                      {/* Botão Toggle Transferência */}
                      <button 
                        type="button" 
                        onClick={() => setForm(prev => ({...prev, tipo: prev.tipo === 'transferencia' ? 'despesa' : 'transferencia'}))} 
                        className="px-4 py-3 bg-gray-800 text-gray-300 rounded-xl hover:bg-gray-700 transition text-sm border border-gray-700"
                      >
                        {form.tipo === 'transferencia' ? 'Voltar' : '↔ Transf.'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Transactions Table */}
                <div className="bg-[#161b22] rounded-2xl border border-gray-800 overflow-hidden">
                  <div className="p-5 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <h3 className="font-bold text-white">Histórico de Transações</h3>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                       <input type="month" className="bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} />
                       <input type="text" placeholder="🔍 Buscar..." className="flex-1 sm:w-40 bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none" value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)} />
                       <select className="bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none" value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
                         <option value="">Todas Categorias</option>
                         {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                       </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#0d1117] text-gray-500 uppercase text-xs">
                        <tr>
                          <th className="p-4">Descrição</th>
                          <th className="p-4 hidden sm:table-cell">Categoria</th>
                          <th className="p-4 hidden md:table-cell">Data</th>
                          <th className="p-4 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {transacoesFiltradas.slice(0, 10).map(t => {
                          const cat = categorias.find(c => c.id === t.categoriaId)?.nome || 'Geral';
                          const sub = subcategorias.find(s => s.id === t.subcategoriaId)?.nome;
                          return (
                            <tr key={t.id} className="hover:bg-gray-800/30 transition group">
                              <td className="p-4">
                                <p className="font-medium text-white group-hover:text-gray-200">{t.descricao}</p>
                                {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
                              </td>
                              <td className="p-4 hidden sm:table-cell"><span className="bg-gray-800 text-gray-400 px-2 py-1 rounded text-xs">{cat}</span></td>
                              <td className="p-4 text-gray-500 hidden md:table-cell">{new Date(t.data).toLocaleDateString('pt-BR')}</td>
                              <td className={`p-4 text-right font-bold ${t.tipo === 'receita' ? 'text-green-400' : t.tipo === 'transferencia' ? 'text-gray-400' : 'text-red-400'}`}>
                                {t.tipo === 'receita' ? '+' : t.tipo === 'transferencia' ? '↔' : '-'} R$ {t.valor.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                        {transacoesFiltradas.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-500">Nenhuma transação encontrada.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {transacoesFiltradas.length > 10 && (
                    <div className="p-3 text-center border-t border-gray-800">
                      <p className="text-xs text-gray-500">Mostrando 10 de {transacoesFiltradas.length} registros</p>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: WIDGETS */}
              <div className="space-y-6">
                
                {/* Alerts */}
                {lembretes.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-2xl flex items-center gap-3">
                    <span className="text-2xl">⏰</span>
                    <div>
                      <p className="font-bold text-sm">Contas a vencer!</p>
                      <p className="text-xs opacity-80">{lembretes.length} conta(s) nos próximos 3 dias.</p>
                    </div>
                  </div>
                )}

                {/* Spending Pie Chart */}
                <div className="bg-[#161b22] p-5 rounded-2xl border border-gray-800">
                   <h3 className="font-bold text-white mb-4 text-sm">Gastos por Categoria</h3>
                   <div className="h-56">
                     {dadosGastos.length > 0 ? (
                       <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie data={dadosGastos} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                             {dadosGastos.map((_, i) => <Cell key={i} fill={GRAFICO_CORES[i % GRAFICO_CORES.length]} />)}
                           </Pie>
                           <Tooltip contentStyle={{backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#fff'}} formatter={(val: any) => `R$ ${Number(val).toFixed(2)}`} />
                         </PieChart>
                       </ResponsiveContainer>
                     ) : <div className="flex items-center justify-center h-full text-gray-500 text-sm">Sem dados de gastos</div>}
                   </div>
                   <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                     {dadosGastos.map((g, i) => (
                       <div key={g.name} className="flex justify-between items-center text-xs">
                         <div className="flex items-center gap-2">
                           <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: GRAFICO_CORES[i % GRAFICO_CORES.length]}}></div>
                           <span className="text-gray-300">{g.name}</span>
                         </div>
                         <span className="text-white font-medium">R$ {g.value.toFixed(0)}</span>
                       </div>
                     ))}
                   </div>
                </div>

                {/* Accounts Quick View */}
                <div className="bg-[#161b22] p-5 rounded-2xl border border-gray-800">
                   <div className="flex justify-between items-center mb-4">
                     <h3 className="font-bold text-white text-sm">Suas Contas</h3>
                     <button onClick={() => setAbaAtiva('contas')} className="text-xs text-green-400 hover:underline">Gerenciar</button>
                   </div>
                   <div className="space-y-2">
                     {contas.map(c => (
                       <div key={c.id} className="flex justify-between items-center p-3 bg-[#0d1117] rounded-xl border border-gray-800 hover:border-gray-700 transition">
                          <div className="flex items-center gap-3">
                             <div className={`w-2 h-8 rounded-full shrink-0 ${c.tipo === 'Banco' ? 'bg-blue-500' : c.tipo === 'Cartão' ? 'bg-purple-500' : 'bg-green-500'}`}></div>
                             <div>
                               <p className="text-sm font-bold text-white">{c.nome}</p>
                               <p className="text-xs text-gray-500">{c.tipo}</p>
                             </div>
                          </div>
                          <p className="font-bold text-white text-sm">R$ {c.saldo.toFixed(2)}</p>
                       </div>
                     ))}
                   </div>
                </div>

                {/* Investments Quick View */}
                <div className="bg-[#161b22] p-5 rounded-2xl border border-gray-800">
                   <div className="flex justify-between items-center mb-4">
                     <h3 className="font-bold text-white text-sm">Carteira de Investimentos</h3>
                     <button onClick={() => setAbaAtiva('investimentos')} className="text-xs text-green-400 hover:underline">Detalhes</button>
                   </div>
                   <div className="space-y-2">
                     {investimentos.slice(0, 3).map(inv => (
                       <div key={inv.id} className="flex justify-between items-center p-3 bg-[#0d1117] rounded-xl border border-gray-800">
                          <div>
                            <p className="text-sm font-bold text-white">{inv.nome}</p>
                            <p className="text-xs text-gray-500">{inv.quantidade} un.</p>
                          </div>
                          <p className="text-green-400 font-bold text-sm">R$ {(inv.quantidade * inv.precoAtual).toFixed(2)}</p>
                       </div>
                     ))}
                     {investimentos.length === 0 && <p className="text-center text-gray-500 text-xs py-4">Nenhum investimento.</p>}
                     {investimentos.length > 3 && <p className="text-center text-gray-500 text-xs pt-2">+ {investimentos.length - 3} outros ativos</p>}
                   </div>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* CONTAS */}
        {abaAtiva === 'contas' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-[#161b22] p-6 rounded-2xl border border-gray-800">
              <h2 className="text-lg font-bold text-white mb-4">💳 Adicionar Nova Conta</h2>
              <form onSubmit={adicionarConta} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <input placeholder="Nome da Conta (ex: Nubank)" className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none" value={novaConta.nome} onChange={e => setNovaConta({...novaConta, nome: e.target.value})} required />
                <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novaConta.tipo} onChange={e => setNovaConta({...novaConta, tipo: e.target.value as any})}>
                  <option value="Banco">🏦 Banco Digital</option>
                  <option value="Dinheiro">💵 Dinheiro/Carteira</option>
                  <option value="Cartão">💳 Cartão de Crédito</option>
                </select>
                <input type="number" step="0.01" placeholder="Saldo Inicial (R$)" className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none" value={novaConta.saldoInicial} onChange={e => setNovaConta({...novaConta, saldoInicial: e.target.value})} />
                <button className="text-white rounded-xl font-bold hover:opacity-90 transition" style={{backgroundColor: cor.bg}}>+ Adicionar Conta</button>
              </form>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {contas.map(c => (
                <div key={c.id} className="bg-[#161b22] p-6 rounded-2xl border border-gray-800 relative hover:border-gray-700 transition group">
                  <button onClick={() => removerConta(c.id!)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition">✕</button>
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${c.tipo === 'Banco' ? 'bg-blue-500/20' : c.tipo === 'Cartão' ? 'bg-purple-500/20' : 'bg-green-500/20'}`}>
                      {c.tipo === 'Banco' ? '🏦' : c.tipo === 'Cartão' ? '💳' : '💵'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-lg truncate">{c.nome}</p>
                      <p className="text-xs uppercase tracking-wide text-gray-500 mt-1">{c.tipo}</p>
                      <p className={`text-2xl font-bold mt-3 ${c.saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>R$ {c.saldo.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INVESTIMENTOS */}
        {abaAtiva === 'investimentos' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-[#161b22] p-6 rounded-2xl border border-gray-800">
                <h2 className="text-lg font-bold text-white mb-4">➕ Novo Ativo</h2>
                <form onSubmit={adicionarInvestimento} className="space-y-4">
                  <input type="text" placeholder="Nome (ex: PETR4, Bitcoin)" required className="w-full bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none" value={novoInvestimento.nome} onChange={e => setNovoInvestimento({...novoInvestimento, nome: e.target.value})} />
                  <div className="grid grid-cols-2 gap-3">
                    <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novoInvestimento.tipo} onChange={e => setNovoInvestimento({...novoInvestimento, tipo: e.target.value})}>
                      <option value="Ações">Ações</option><option value="Cripto">Cripto</option><option value="Renda Fixa">Renda Fixa</option><option value="Fundos">Fundos</option>
                    </select>
                    <input type="number" step="any" placeholder="Quantidade" required className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novoInvestimento.quantidade} onChange={e => setNovoInvestimento({...novoInvestimento, quantidade: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" step="any" placeholder="Preço Médio" required className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novoInvestimento.precoMedio} onChange={e => setNovoInvestimento({...novoInvestimento, precoMedio: e.target.value})} />
                    <input type="number" step="any" placeholder="Preço Atual" required className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novoInvestimento.precoAtual} onChange={e => setNovoInvestimento({...novoInvestimento, precoAtual: e.target.value})} />
                  </div>
                  <button type="submit" className="w-full text-white p-3 rounded-xl font-bold transition hover:opacity-90" style={{backgroundColor: cor.bg}}>💎 Adicionar Ativo</button>
                </form>
              </div>
              
              <div className="lg:col-span-2 bg-[#161b22] p-6 rounded-2xl border border-gray-800">
                <h2 className="text-lg font-bold text-white mb-4">📊 Distribuição da Carteira</h2>
                <div className="h-64">
                  {dadosPizzaInvest.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={dadosPizzaInvest} cx="50%" cy="50%" outerRadius={80} innerRadius={40} dataKey="value" paddingAngle={5}>
                          {dadosPizzaInvest.map((_, i) => <Cell key={i} fill={GRAFICO_CORES[i % GRAFICO_CORES.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#fff'}} formatter={(val: any) => `R$ ${Number(val).toFixed(2)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <div className="flex items-center justify-center h-full text-gray-500">Nenhum investimento cadastrado</div>}
                </div>
              </div>
            </div>

            <div className="bg-[#161b22] rounded-2xl border border-gray-800 overflow-hidden">
              <div className="p-5 border-b border-gray-800">
                <h3 className="font-bold text-white">Meus Ativos</h3>
              </div>
              <div className="divide-y divide-gray-800">
                {investimentos.map(inv => {
                  const total = inv.quantidade * inv.precoAtual; 
                  const lucro = total - (inv.quantidade * inv.precoMedio); 
                  const perc = ((inv.precoAtual - inv.precoMedio) / inv.precoMedio) * 100;
                  return (
                    <div key={inv.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-800/30 transition">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-sm">{inv.tipo.substring(0,2)}</div>
                        <div>
                          <p className="font-bold text-white">{inv.nome} <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded ml-2">{inv.tipo}</span></p>
                          <p className="text-sm text-gray-500">{inv.quantidade} unidades @ R$ {inv.precoMedio.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="font-bold text-white">R$ {total.toFixed(2)}</p>
                          <p className={`text-sm font-medium ${lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>{lucro >= 0 ? '+' : ''}{perc.toFixed(2)}%</p>
                        </div>
                        <div className="flex items-center gap-2">
                           <input type="number" step="any" placeholder="Atualizar Preço" className="w-28 bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none" onBlur={e => e.target.value && atualizarInvestimento(inv.id!, parseFloat(e.target.value))} />
                           <button onClick={() => removerInvestimento(inv.id!)} className="text-gray-500 hover:text-red-400 p-2 transition">🗑️</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {investimentos.length === 0 && <div className="p-8 text-center text-gray-500">Nenhum ativo cadastrado. Adicione seu primeiro investimento acima.</div>}
              </div>
            </div>
          </div>
        )}

        {/* METAS */}
        {abaAtiva === 'metas' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-[#161b22] p-6 rounded-2xl border border-gray-800">
              <h2 className="text-lg font-bold text-white mb-4">🎯 Nova Meta</h2>
              <form onSubmit={adicionarMeta} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <input placeholder="Nome da Meta (ex: Viagem)" className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none" value={novaMeta.nome} onChange={e => setNovaMeta({...novaMeta, nome: e.target.value})} required />
                <input type="number" placeholder="Valor Alvo (R$)" className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none" value={novaMeta.valorAlvo} onChange={e => setNovaMeta({...novaMeta, valorAlvo: e.target.value})} required />
                <input type="date" className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novaMeta.prazo} onChange={e => setNovaMeta({...novaMeta, prazo: e.target.value})} required />
                <button className="text-white rounded-xl font-bold hover:opacity-90 transition" style={{backgroundColor: cor.bg}}>+ Criar Meta</button>
              </form>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {metas.map(m => (
                <div key={m.id} className="bg-[#161b22] p-6 rounded-2xl border border-gray-800 relative hover:border-gray-700 transition group">
                  <button onClick={() => removerMeta(m.id!)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition">✕</button>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-white text-lg">{m.nome}</h3>
                      <p className="text-sm text-gray-500 mt-1">Prazo: {new Date(m.prazo).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span className="text-lg font-bold" style={{color: cor.text}}>{((m.valorAtual/m.valorAlvo)*100).toFixed(0)}%</span>
                  </div>
                  <div className="h-3 bg-[#0d1117] rounded-full mb-4 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{width: `${Math.min((m.valorAtual/m.valorAlvo)*100, 100)}%`, backgroundColor: cor.bg}}></div>
                  </div>
                  <div className="flex justify-between text-sm mb-4">
                    <span className="text-gray-400">Atual: R$ {m.valorAtual.toFixed(0)}</span>
                    <span className="text-gray-400">Alvo: R$ {m.valorAlvo.toFixed(0)}</span>
                  </div>
                  <form onSubmit={(e) => aportarMeta(e)} className="flex gap-3">
                    <select className="flex-1 bg-[#0d1117] border border-gray-700 rounded-xl p-2.5 text-sm text-white outline-none" value={aporteMeta.metaId} onChange={e => setAporteMeta({...aporteMeta, metaId: e.target.value})}>
                      <option value="">Selecionar Meta...</option>
                      {metas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                    <input type="number" placeholder="R$" className="w-28 bg-[#0d1117] border border-gray-700 rounded-xl p-2.5 text-sm text-white outline-none" value={aporteMeta.valor} onChange={e => setAporteMeta({...aporteMeta, valor: e.target.value})} />
                    <button className="text-white px-4 rounded-xl font-bold hover:opacity-90 transition text-sm" style={{backgroundColor: cor.bg}}>💰 Aportar</button>
                  </form>
                </div>
              ))}
              {metas.length === 0 && <div className="col-span-2 p-8 text-center text-gray-500 bg-[#161b22] rounded-2xl border border-gray-800">Nenhuma meta criada. Comece adicionando sua primeira meta financeira!</div>}
            </div>
          </div>
        )}

        {/* ORÇAMENTOS */}
        {abaAtiva === 'orcamentos' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-[#161b22] p-6 rounded-2xl border border-gray-800">
              <h2 className="text-lg font-bold text-white mb-4">📋 Definir Orçamento Mensal</h2>
              <form onSubmit={definirOrcamento} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novoOrcamento.categoriaId} onChange={e => setNovoOrcamento({...novoOrcamento, categoriaId: e.target.value})} required>
                  <option value="">Selecionar Categoria...</option>
                  {categorias.filter(c=>c.tipo==='Despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <input type="number" placeholder="Limite Mensal (R$)" className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none" value={novoOrcamento.limite} onChange={e => setNovoOrcamento({...novoOrcamento, limite: e.target.value})} required />
                <button className="text-white rounded-xl font-bold hover:opacity-90 transition" style={{backgroundColor: cor.bg}}>💰 Definir Limite</button>
              </form>
            </div>
            <div className="space-y-4">
              {orcamentos.map(orc => {
                const gasto = transacoes.filter(t => t.categoriaId === orc.categoriaId && t.tipo === 'despesa').reduce((s,t) => s + t.valor, 0);
                const pct = (gasto / orc.limite) * 100; 
                const nome = categorias.find(c => c.id === orc.categoriaId)?.nome || 'Categoria';
                return (
                  <div key={orc.id} className="bg-[#161b22] p-5 rounded-2xl border border-gray-800 hover:border-gray-700 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-10 rounded-full ${pct > 100 ? 'bg-red-500' : 'bg-green-500'}`}></div>
                        <div>
                          <h3 className="font-bold text-white text-lg">{nome}</h3>
                          <p className="text-sm text-gray-500">Limite: R$ {orc.limite.toFixed(0)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className={`text-2xl font-bold ${pct > 100 ? 'text-red-400' : 'text-white'}`}>{pct.toFixed(0)}%</span>
                          <p className="text-xs text-gray-500 mt-1">Gasto: R$ {gasto.toFixed(0)}</p>
                        </div>
                        <button onClick={() => removerOrcamento(orc.categoriaId!)} className="text-gray-500 hover:text-red-400 p-2 transition">🗑️</button>
                      </div>
                    </div>
                    <div className="h-3 bg-[#0d1117] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${pct > 100 ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${Math.min(pct, 100)}%`}}></div>
                    </div>
                  </div>
                );
              })}
              {orcamentos.length === 0 && <div className="p-8 text-center text-gray-500 bg-[#161b22] rounded-2xl border border-gray-800">Nenhum orçamento definido. Defina limites para suas categorias de despesa.</div>}
            </div>
          </div>
        )}

        {/* CONFIG */}
        {abaAtiva === 'config' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            
            {/* Appearance */}
            <div className="bg-[#161b22] p-6 rounded-2xl border border-gray-800">
              <h2 className="text-lg font-bold text-white mb-6">🎨 Aparência</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
                <div className="flex items-center justify-between p-4 bg-[#0d1117] rounded-xl border border-gray-800">
                  <div>
                    <span className="text-sm font-bold text-white block">Modo Escuro</span>
                    <span className="text-xs text-gray-500">Interface escura</span>
                  </div>
                  <button onClick={() => setTema(t => t === 'dark' ? 'light' : 'dark')} className={`w-12 h-6 rounded-full p-1 transition ${tema === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full transition transform ${tema === 'dark' ? 'translate-x-6' : ''}`}></div></button>
                </div>
                <div className="flex items-center justify-between p-4 bg-[#0d1117] rounded-xl border border-gray-800">
                  <div>
                    <span className="text-sm font-bold text-white block">Fonte Grande</span>
                    <span className="text-xs text-gray-500">Melhor legibilidade</span>
                  </div>
                  <button onClick={() => setFonteGrande(f => !f)} className={`w-12 h-6 rounded-full p-1 transition ${fonteGrande ? 'bg-gray-600' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full transition transform ${fonteGrande ? 'translate-x-6' : ''}`}></div></button>
                </div>
                <div className="p-4 bg-[#0d1117] rounded-xl border border-gray-800">
                  <span className="text-sm font-bold text-white block mb-3">Cor de Destaque</span>
                  <div className="flex gap-3">
                    {Object.keys(CORES).map(c => (
                      <button key={c} onClick={() => setCorDestaque(c)} className={`w-8 h-8 rounded-full border-2 transition ${corDestaque === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`} style={{backgroundColor: CORES[c as keyof typeof CORES].bg}}></button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Recorrentes */}
            <div className="bg-[#161b22] p-6 rounded-2xl border border-gray-800">
              <h2 className="text-lg font-bold text-white mb-4">🔄 Contas Fixas / Recorrentes</h2>
              <p className="text-sm text-gray-500 mb-4">Transações geradas automaticamente todo mês/semana.</p>
              <form onSubmit={adicionarRecorrente} className="grid grid-cols-1 sm:grid-cols-6 gap-3 mb-4">
                <input placeholder="Descrição (ex: Aluguel)" className="sm:col-span-2 bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none" value={novoRecorrente.descricao} onChange={e => setNovoRecorrente({...novoRecorrente, descricao: e.target.value})} required />
                <input type="number" placeholder="Valor" className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none" value={novoRecorrente.valor} onChange={e => setNovoRecorrente({...novoRecorrente, valor: e.target.value})} required />
                {novoRecorrente.frequencia === 'Mensal' ? (
                  <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novoRecorrente.diaVencimento} onChange={e => setNovoRecorrente({...novoRecorrente, diaVencimento: e.target.value})} required>
                    <option value="">Dia do mês</option>{Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}º</option>)}
                  </select>
                ) : (
                  <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novoRecorrente.diaVencimento} onChange={e => setNovoRecorrente({...novoRecorrente, diaVencimento: e.target.value})} required>
                    <option value="">Dia da semana</option><option value="0">Dom</option><option value="1">Seg</option><option value="2">Ter</option><option value="3">Qua</option><option value="4">Qui</option><option value="5">Sex</option><option value="6">Sáb</option>
                  </select>
                )}
                <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novoRecorrente.frequencia} onChange={e => setNovoRecorrente({...novoRecorrente, frequencia: e.target.value as any, diaVencimento: ''})}><option value="Mensal">Mensal</option><option value="Semanal">Semanal</option></select>
                <button className="text-white rounded-xl font-bold hover:opacity-90 transition" style={{backgroundColor: cor.bg}}>+ Salvar</button>
              </form>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {recorrentes.map(r => (
                  <div key={r.id} className="flex justify-between items-center p-3 bg-[#0d1117] rounded-xl border border-gray-800 hover:border-gray-700 transition">
                    <div>
                      <p className="font-bold text-white">{r.descricao}</p>
                      <p className="text-xs text-gray-500">Vence em: {new Date(r.proximoVencimento).toLocaleDateString('pt-BR')} • {r.frequencia}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-bold ${r.tipo === 'receita' ? 'text-green-400' : 'text-red-400'}`}>R$ {r.valor.toFixed(2)}</span>
                      <button onClick={() => removerRecorrente(r.id!)} className="text-gray-500 hover:text-red-400 p-2 transition">🗑️</button>
                    </div>
                  </div>
                ))}
                {recorrentes.length === 0 && <p className="text-center text-gray-500 text-sm py-4">Nenhuma conta fixa cadastrada.</p>}
              </div>
            </div>

            {/* Categorias */}
            <div className="bg-[#161b22] p-6 rounded-2xl border border-gray-800">
              <h2 className="text-lg font-bold text-white mb-4">📂 Categorias & Subcategorias</h2>
              <form onSubmit={adicionarCategoria} className="flex gap-3 mb-3">
                <input placeholder="Nome da Categoria" className="flex-1 bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-green-500 outline-none" value={novaCat.nome} onChange={e => setNovaCat({...novaCat, nome: e.target.value})} required />
                <select className="bg-[#0d1117] border border-gray-700 rounded-xl p-3 text-sm text-white outline-none" value={novaCat.tipo} onChange={e => setNovaCat({...novaCat, tipo: e.target.value as any})}><option value="Despesa">Despesa</option><option value="Receita">Receita</option></select>
                <button className="text-white px-4 rounded-xl font-bold hover:opacity-90 transition" style={{backgroundColor: cor.bg}}>+ Cat</button>
              </form>
              <form onSubmit={adicionarSubcategoria} className="flex gap-3 bg-[#0d1117] p-3 rounded-xl border border-gray-800 mb-4">
                 <select className="flex-1 bg-[#161b22] border border-gray-700 rounded-lg p-2 text-sm text-white outline-none" value={novaSubCat.categoriaPaiId} onChange={e => setNovaSubCat({...novaSubCat, categoriaPaiId: e.target.value})} required><option value="">Categoria Pai...</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                 <input placeholder="Nome da Subcategoria" className="flex-1 bg-[#161b22] border border-gray-700 rounded-lg p-2 text-sm text-white outline-none" value={novaSubCat.nome} onChange={e => setNovaSubCat({...novaSubCat, nome: e.target.value})} required />
                 <button className="text-white px-3 rounded-lg font-bold text-sm hover:opacity-90 transition" style={{backgroundColor: cor.bg}}>+ Sub</button>
              </form>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {categorias.map(c => {
                  const subs = subcategorias.filter(s => s.categoriaPaiId === c.id);
                  return (
                    <div key={c.id} className="mb-2">
                      <div className="flex justify-between items-center p-3 bg-[#0d1117] rounded-xl border border-gray-800 hover:border-gray-700 transition">
                        <div className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full ${c.tipo === 'Receita' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          <span className="font-bold text-white">{c.nome}</span>
                          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{c.tipo}</span>
                        </div>
                        <button onClick={() => removerCategoria(c.id!)} className="text-gray-500 hover:text-red-400 p-2 transition">🗑️</button>
                      </div>
                      {subs.length > 0 && (
                        <div className="ml-6 mt-1 space-y-1 border-l-2 border-gray-800 pl-3">
                          {subs.map(s => (
                            <div key={s.id} className="p-2 text-sm bg-[#0d1117] rounded-lg text-gray-400 flex justify-between items-center">
                              <span>↳ {s.nome}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="bg-red-500/10 p-6 rounded-2xl border border-red-500/30">
              <h2 className="text-lg font-bold text-red-400 mb-2">⚠️ Zona de Perigo</h2>
              <p className="text-sm text-red-300/70 mb-4">Esta ação apagará permanentemente todas as transações, metas, orçamentos, investimentos e recorrentes.</p>
              <button onClick={limparHistorico} className="w-full bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl font-bold transition">🧹 Limpar Todos os Dados</button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}