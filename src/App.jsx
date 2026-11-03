import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebase';
import { 
  collection, addDoc, deleteDoc, doc, setDoc, onSnapshot, query, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { 
  Trophy, History, PlusCircle, AlertCircle, Coins, X, Megaphone, UserPlus, 
  Calculator, TrendingUp, Medal, Receipt, Trash2, Archive, Calendar, Sparkles, Filter, Info
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { calculateStats, calculateAnnualArchive, EAST_MONEY_PER_ROUND } from './utils/stats';
import AnnualRecapModal from './components/AnnualRecapModal';
import ArchiveListModal from './components/ArchiveListModal';

// 預設固定班底
const INITIAL_PRESETS = [
  "JK", "Mochi", "Ryan", "阿傑", "Alan",
  "道道", "嚕卡", "柏鈞", "魔王", "萌萌噠"
].map(name => ({ id: name.toLowerCase(), name }));

const SLOGANS = [
  "小賭怡情，大賭郭台銘 💸",
  "小孩沒有天天哭，麻將沒有天天輸 🀄",
  "贏錢吃紅，輸錢裝窮 😂",
  "不打到最後，怎麼知道會輸多少🤫",
  "有錢不賭，愧對父母 😭",
  "沈迷賭博，富可敵國 🔥"
];

// --- 輔助功能：結算算法 ---
const calculateSettlement = (records) => {
  let debtors = records.filter(r => r.amount < 0).sort((a, b) => a.amount - b.amount);
  let creditors = records.filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);
  
  const transactions = [];
  let dIndex = 0;
  let cIndex = 0;

  debtors = debtors.map(d => ({...d}));
  creditors = creditors.map(c => ({...c}));

  while (dIndex < debtors.length && cIndex < creditors.length) {
    let debtor = debtors[dIndex];
    let creditor = creditors[cIndex];
    let amount = Math.min(Math.abs(debtor.amount), creditor.amount);
    
    if (amount > 0) {
      transactions.push(`${debtor.name} ➜ ${creditor.name} $${amount}`);
    }

    debtor.amount += amount;
    creditor.amount -= amount;

    if (Math.abs(debtor.amount) < 1) dIndex++;
    if (creditor.amount < 1) cIndex++;
  }

  debtors.forEach(d => {
    if (Math.abs(d.amount) >= 1) {
       transactions.push(`${d.name} ➜ 💰公費 $${Math.abs(d.amount)}`);
    }
  });

  return transactions;
};

function App() {
  // --- 資料狀態 ---
  const [logs, setLogs] = useState([]);
  const [expenseLogs, setExpenseLogs] = useState([]);
  const [annualArchives, setAnnualArchives] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 年度篩選狀態 (預設當前年份，如 '2026'，或 'all' 代表全歷史)
  const currentCalendarYear = String(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(currentCalendarYear);

  // 金額計算狀態 (公費跨年自動滾動結轉)
  const [allTimeGameIncome, setAllTimeGameIncome] = useState(0); // 歷年所有打牌累積收入
  const [yearGameIncome, setYearGameIncome] = useState(0); // 當前選取年份打牌累積收入
  const [expenseTotal, setExpenseTotal] = useState(0); // 手動花掉的 (全歷史)
  const [finalEastMoney, setFinalEastMoney] = useState(0); // 公費水庫即時總額

  // UI 狀態
  const [sloganIndex, setSloganIndex] = useState(0);
  const [availablePlayers, setAvailablePlayers] = useState(INITIAL_PRESETS);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  
  // Modals 狀態
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [settlementData, setSettlementData] = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showArchiveListModal, setShowArchiveListModal] = useState(false);
  const [showAnnualRecapModal, setShowAnnualRecapModal] = useState(false);
  const [activeArchive, setActiveArchive] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // 表單狀態
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [rounds, setRounds] = useState(2);
  const [players, setPlayers] = useState([
    { id: null, name: '', amount: '' }, { id: null, name: '', amount: '' }, 
    { id: null, name: '', amount: '' }, { id: null, name: '', amount: '' }
  ]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 公費表單狀態
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  // --- 1. 跑馬燈 ---
  useEffect(() => {
    const interval = setInterval(() => {
      setSloganIndex((prev) => (prev + 1) % SLOGANS.length);
    }, 6000); 
    return () => clearInterval(interval);
  }, []);

  // --- 2. 監聽 Firebase: 戰績 (Matches) ---
  useEffect(() => {
    const q = query(collection(db, "matches"), orderBy("date", "desc")); 
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- 3. 監聽 Firebase: 公費收支 (Expenses) ---
  useEffect(() => {
    const q = query(collection(db, "expenses"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExpenseLogs(data);
      const total = data.reduce((sum, item) => sum + (parseInt(item.amount) || 0), 0);
      setExpenseTotal(total);
    });
    return () => unsubscribe();
  }, []);

  // --- 3b. 監聽 Firebase: 固定班底 (Presets) ---
  useEffect(() => {
    const q = query(collection(db, "presets"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setAvailablePlayers(INITIAL_PRESETS);
      } else {
        const presetsData = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (a.createdAt?.toMillis?.() ?? Infinity) - (b.createdAt?.toMillis?.() ?? Infinity));

        const mergedPlayers = [...INITIAL_PRESETS];
        presetsData.forEach(preset => {
          if (!mergedPlayers.some(p => p.id === preset.id || p.name === preset.name)) {
            mergedPlayers.push(preset);
          }
        });
        setAvailablePlayers(mergedPlayers);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 3c. 監聽 Firebase: 年度歷史檔案 (annual_archives) ---
  useEffect(() => {
    const q = query(collection(db, "annual_archives"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const archivesData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.year || 0) - (a.year || 0));
      setAnnualArchives(archivesData);
    });
    return () => unsubscribe();
  }, []);

  // 取得目前資料庫中所有的年份
  const availableYears = useMemo(() => {
    const setYears = new Set();
    logs.forEach(l => {
      if (l.date) setYears.add(l.date.slice(0, 4));
    });
    setYears.add(currentCalendarYear);
    return Array.from(setYears).sort().reverse();
  }, [logs, currentCalendarYear]);

  // 當選取的年份在資料中不存在且非 all 時，預設使用最新年份
  useEffect(() => {
    if (selectedYear !== 'all' && !availableYears.includes(selectedYear) && availableYears.length > 0) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // --- 4. 計算公費與當前顯示的排行榜 ---
  useEffect(() => {
    // 1. 全歷史打牌收入 (用於跨年滾動公費結餘)
    const grandRounds = logs.reduce((sum, m) => sum + (parseInt(m.rounds) || 1), 0);
    const allFund = grandRounds * EAST_MONEY_PER_ROUND;
    setAllTimeGameIncome(allFund);
    setFinalEastMoney(allFund + expenseTotal);

    // 2. 篩選當前選取範圍的對局
    const filteredMatches = selectedYear === 'all'
      ? logs
      : logs.filter(m => m.date && m.date.startsWith(`${selectedYear}-`));

    // 3. 呼叫封裝好的 calculateStats (自動套用「個人近10場」動態標籤)
    const { stats: calculatedStats, totalGameFund } = calculateStats(filteredMatches);
    setStats(calculatedStats);
    setYearGameIncome(totalGameFund);

  }, [logs, selectedYear, expenseTotal]);

  // 當前篩選年份顯示的近期戰況
  const displayedLogs = useMemo(() => {
    if (selectedYear === 'all') return logs;
    return logs.filter(m => m.date && m.date.startsWith(`${selectedYear}-`));
  }, [logs, selectedYear]);

  // --- 表單處理 ---
  const handlePlayerChange = (index, field, value) => {
    const newPlayers = [...players];
    if (field === 'player') {
      newPlayers[index].id = value.id;
      newPlayers[index].name = value.name;
    } else {
      newPlayers[index][field] = value;
    }
    setPlayers(newPlayers);
  };

  const quickAddPlayer = (player) => {
    if (players.some(p => p.id === player.id)) return;
    const emptyIndex = players.findIndex(p => p.name === '');
    if (emptyIndex !== -1) handlePlayerChange(emptyIndex, 'player', player);
  };

  const handleAddNewPlayer = async () => {
    if (newPlayerName.trim() && !availablePlayers.some(p => p.name === newPlayerName.trim())) {
      try {
        await addDoc(collection(db, "presets"), {
          name: newPlayerName.trim(),
          createdAt: serverTimestamp()
        });
        setNewPlayerName("");
        setShowAddPlayer(false);
      } catch (err) {
        console.error("新增固定班底失敗:", err);
      }
    }
  };

  // 送出戰績
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (players.some(p => !p.name.trim())) { setError("❌ 請輸入所有玩家姓名"); return; }
    
    const total = players.reduce((sum, p) => sum + (parseInt(p.amount) || 0), 0);
    const expectedTotal = -(rounds * EAST_MONEY_PER_ROUND);

    if (total !== expectedTotal) {
      setError(`❌ 帳目不合！總和為 ${total} (應為 ${expectedTotal})`);
      return;
    }

    try {
      await addDoc(collection(db, "matches"), {
        date: date,
        rounds: parseInt(rounds),
        createdAt: serverTimestamp(),
        records: players.map(p => ({ 
          playerId: p.id, 
          name: p.name.trim(), 
          amount: parseInt(p.amount) 
        }))
      });
      setPlayers(players.map(p => ({ ...p, amount: '' })));
      setSuccessMsg("✅ 戰績登錄成功！");
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setError("發生錯誤，請檢查網路連線");
    }
  };

  // --- 公費管理功能 ---
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseNote || !expenseAmount) return;

    try {
      await addDoc(collection(db, "expenses"), {
        note: expenseNote,
        amount: parseInt(expenseAmount),
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      });
      setExpenseNote("");
      setExpenseAmount("");
    } catch (err) {
      console.error(err);
      alert("新增失敗");
    }
  };

  const handleDeleteExpense = async (id) => {
    if (window.confirm("確定要刪除這筆紀錄嗎？")) {
      await deleteDoc(doc(db, "expenses", id));
    }
  };

  // --- 年度成績一鍵歸納 ---
  const handleTriggerAnnualArchive = async (year) => {
    const targetYear = String(year);
    const targetArchive = calculateAnnualArchive(targetYear, logs, expenseLogs);
    
    if (targetArchive.summary.totalMatches === 0) {
      alert(`⚠️ ${targetYear} 年度尚無任何比賽紀錄可供歸納！`);
      return;
    }

    const existingArchive = annualArchives.find(a => String(a.year) === targetYear);
    if (existingArchive) {
      const confirmOverwrite = window.confirm(
        `📌 ${targetYear} 年度已存在歷史檔案！\n確定要以最新戰績重新歸納並覆蓋更新嗎？`
      );
      if (!confirmOverwrite) return;
    }

    setIsArchiving(true);
    try {
      await setDoc(doc(db, "annual_archives", targetYear), {
        ...targetArchive,
        archivedAt: serverTimestamp()
      });
      
      setActiveArchive(targetArchive);
      setShowAnnualRecapModal(true);
      setShowArchiveListModal(false);
    } catch (err) {
      console.error("封存年度檔案失敗:", err);
      alert("歸納封存失敗，請檢查網路連線");
    } finally {
      setIsArchiving(false);
    }
  };

  // 即時預覽指定年份的年度戰報 (尚未封存亦可查看)
  const handlePreviewAnnualRecap = (year) => {
    const existing = annualArchives.find(a => String(a.year) === String(year));
    if (existing) {
      setActiveArchive(existing);
    } else {
      const previewData = calculateAnnualArchive(year, logs, expenseLogs);
      setActiveArchive(previewData);
    }
    setShowAnnualRecapModal(true);
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans text-gray-800 pb-20">
      <div className="max-w-md mx-auto space-y-4">
        
        {/* --- 頂部標題 --- */}
        <h1 className="text-3xl font-bold text-emerald-700 text-center py-2 flex items-center justify-center gap-2">
          <span className="text-4xl">🀄</span> 麻將積分榜
        </h1>

        {/* --- 年度切換 & 歷史檔案館入口列 --- */}
        <div className="bg-white p-2 rounded-xl shadow-xs border border-gray-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <span className="text-gray-400 font-bold px-1 flex items-center gap-0.5">
              <Calendar size={13} />
            </span>
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${
                  selectedYear === year 
                    ? 'bg-emerald-600 text-white shadow-xs' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {year}年
              </button>
            ))}
            <button
              onClick={() => setSelectedYear('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${
                selectedYear === 'all' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全歷史
            </button>
          </div>

          <div className="flex items-center gap-1 pl-1 border-l border-gray-200">
            <button
              onClick={() => setShowArchiveListModal(true)}
              className="bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition border border-amber-200 whitespace-nowrap"
            >
              <Archive size={13} className="text-amber-600" />
              歷史檔 ({annualArchives.length})
            </button>
          </div>
        </div>

        {/* --- 公費卡片 (可點擊) --- */}
        <div className="flex gap-2 h-24">
          <button 
            onClick={() => setShowExpenseModal(true)}
            className="w-1/3 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl p-2 text-white shadow hover:scale-105 transition active:scale-95 flex flex-col justify-center items-center text-center relative overflow-hidden"
          >
            <div className="absolute top-1 right-1 opacity-50"><Receipt size={16}/></div>
            <Coins size={22} className="mb-0.5 opacity-90" />
            <span className="text-[11px] opacity-90">目前公費結餘</span>
            <span className="text-xl font-bold">${finalEastMoney}</span>
            {selectedYear !== 'all' && (
              <span className="text-[9px] opacity-80 mt-0.5">{selectedYear}抽水 ${yearGameIncome}</span>
            )}
          </button>

          {/* 跑馬燈 */}
          <div className="w-2/3 bg-white rounded-xl p-3 shadow flex items-center relative overflow-hidden">
             <div className="absolute left-2 top-2 text-emerald-500"><Megaphone size={16} /></div>
             <div className="w-full pl-6 pr-2">
               <p key={sloganIndex} className="text-sm font-medium text-gray-600 animate-fade-in-up">{SLOGANS[sloganIndex]}</p>
             </div>
             <div className="absolute right-2 bottom-2 text-[10px] text-gray-300">每 6 秒切換</div>
          </div>
        </div>

        {/* --- 當年度戰報快速一鍵歸納區塊 (若選特定年份) --- */}
        {selectedYear !== 'all' && (
          <div className="bg-gradient-to-r from-emerald-50 to-amber-50 p-3 rounded-xl border border-emerald-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Sparkles size={16} className="text-amber-500" />
              <div>
                <p className="font-bold text-gray-800">
                  {selectedYear} 年度戰報
                  <span className="ml-1 text-[10px] font-normal text-gray-500">
                    ({displayedLogs.length} 場對局)
                  </span>
                </p>
                <p className="text-[10px] text-gray-500">可一鍵歸納生成榮譽殿堂與 LINE 戰報</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => handlePreviewAnnualRecap(selectedYear)}
                className="bg-white hover:bg-gray-50 text-gray-700 font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 transition shadow-2xs"
              >
                查看戰報
              </button>
              <button
                onClick={() => handleTriggerAnnualArchive(selectedYear)}
                disabled={isArchiving}
                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold px-2.5 py-1.5 rounded-lg transition shadow-2xs flex items-center gap-1 disabled:opacity-50"
              >
                <Archive size={12} />
                {isArchiving ? '歸納中...' : '一鍵歸納'}
              </button>
            </div>
          </div>
        )}

        {/* --- 登錄戰績 --- */}
        <div className="bg-white p-5 rounded-xl shadow-md border-t-4 border-emerald-500">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <PlusCircle size={20} /> 登錄戰績
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="flex-1 p-2 border rounded bg-gray-50 text-sm"/>
              <div className="flex items-center gap-1 border rounded px-2 bg-gray-50">
                <span className="text-sm text-gray-500">將數</span>
                <input type="number" min="1" value={rounds} onChange={e => setRounds(e.target.value)} className="w-12 p-1 bg-transparent text-center font-bold outline-none"/>
              </div>
            </div>

            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-500">點擊加入玩家</span>
                <button type="button" onClick={() => setShowAddPlayer(!showAddPlayer)} className="text-xs flex items-center gap-1 text-emerald-600 font-bold hover:underline">
                  <UserPlus size={14} /> {showAddPlayer ? "取消" : "自訂人物"}
                </button>
              </div>
              {showAddPlayer && (
                <div className="flex gap-2 mb-2 animate-fade-in">
                  <input placeholder="輸入新名字" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} className="flex-1 text-sm p-1 border rounded"/>
                  <button type="button" onClick={handleAddNewPlayer} className="bg-emerald-600 text-white text-xs px-3 rounded hover:bg-emerald-700">新增</button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {availablePlayers.map(player => (
                  <button key={player.id} type="button" onClick={() => quickAddPlayer(player)} disabled={players.some(p => p.id === player.id)}
                    className={`px-2.5 py-1 rounded text-xs border transition ${players.some(p => p.id === player.id) ? 'bg-gray-200 text-gray-400 border-gray-200' : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-500 hover:text-emerald-600 shadow-sm'}`}>
                    {player.name}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              {players.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input placeholder={`玩家 ${i+1}`} value={p.name} readOnly className="flex-1 p-2 border rounded bg-gray-100 text-gray-700 text-sm cursor-not-allowed" onClick={() => { if(p.name) handlePlayerChange(i, 'player', {id: null, name: ''}); }}/>
                  <input placeholder="$" type="number" value={p.amount} onChange={e => handlePlayerChange(i, 'amount', e.target.value)} className={`w-20 p-2 border rounded text-right font-bold text-sm ${parseInt(p.amount) < 0 ? 'text-red-500' : 'text-emerald-600'}`}/>
                  {p.name && <button type="button" onClick={() => handlePlayerChange(i, 'player', {id: null, name: ''})} className="text-gray-400 hover:text-red-500"><X size={16} /></button>}
                </div>
              ))}
            </div>

            {error && <div className="bg-red-50 text-red-600 p-2 rounded text-xs flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}
            {successMsg && <div className="bg-green-50 text-green-600 p-2 rounded text-center text-sm font-bold">{successMsg}</div>}

            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg shadow-md transition transform active:scale-95 text-sm">確認送出</button>
          </form>
        </div>

        {/* --- 排行榜 (支援個人近10場動態標籤) --- */}
        <div className="bg-white p-4 rounded-xl shadow-md">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Trophy size={18} className="text-yellow-500"/>
              {selectedYear === 'all' ? '全歷史' : `${selectedYear} 年度`} 排行榜
            </h2>
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                標籤採近10場動態
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 border-b">
                <tr>
                  <th className="text-left pb-1 pl-2">玩家</th>
                  <th className="text-center pb-1">將數</th>
                  <th className="text-center pb-1">出席率</th>
                  <th className="text-right pb-1 pr-2">損益</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, idx) => (
                  <tr key={s.id} onClick={() => setSelectedPlayer(s)} className="border-b last:border-0 hover:bg-emerald-50 cursor-pointer transition">
                    <td className="py-2 pl-2 font-medium flex flex-col justify-center">
                      <div className="flex items-center gap-1">{idx===0 ? '👑' : ''} {s.name}</div>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {s.badges.map((b, i) => (
                          <span 
                            key={i} 
                            title={b.desc ? `${b.label}: ${b.desc}` : b.label} 
                            className="text-[10px] bg-gray-100 hover:bg-yellow-100 text-gray-700 rounded px-1 flex items-center gap-0.5 cursor-help"
                          >
                            <span>{b.icon}</span>
                            <span className="text-[9px] font-normal">{b.label}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-center text-gray-400">{s.rounds}</td>
                    <td className="text-center text-gray-500 text-xs">
                       <span className={`px-1.5 py-0.5 rounded ${s.attendanceRate > 50 ? 'bg-orange-100 text-orange-700 font-bold' : 'bg-gray-100'}`}>{s.attendanceRate}%</span>
                    </td>
                    <td className={`text-right font-bold pr-2 ${s.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{s.net > 0 ? '+' : ''}{s.net}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- 近期戰況 --- */}
        <div className="bg-white p-4 rounded-xl shadow-md">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <History size={18} className="text-blue-500" /> 
              {selectedYear === 'all' ? '全歷史' : `${selectedYear} 年度`} 戰況
            </h2>
            <span className="text-xs text-gray-400">共 {displayedLogs.length} 場</span>
          </div>

          <div className="space-y-4">
            {displayedLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="border-b last:border-0 pb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-400">{log.date}</span>
                  <div className="flex gap-2">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{log.rounds || 1} 將</span>
                    <button onClick={() => setSettlementData(calculateSettlement(log.records))} className="text-xs flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full hover:bg-blue-100 font-bold">
                      <Calculator size={10} /> 結算
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {log.records.map((r, i) => (
                    <span key={i} className={`text-sm px-2 py-1 rounded ${r.amount >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {r.name}: {r.amount > 0 ? '+' : ''}{r.amount}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {displayedLogs.length === 0 && <p className="text-center text-gray-400 text-sm">此年份暫無比賽紀錄</p>}
          </div>
        </div>
      </div>

      {/* --- Modal: 歷年歷史檔案館 --- */}
      {showArchiveListModal && (
        <ArchiveListModal
          archives={annualArchives}
          currentYear={currentCalendarYear}
          onSelectArchive={(archive) => {
            setActiveArchive(archive);
            setShowAnnualRecapModal(true);
          }}
          onTriggerAnnualArchive={handleTriggerAnnualArchive}
          onClose={() => setShowArchiveListModal(false)}
        />
      )}

      {/* --- Modal: 年度戰報典藏 (AnnualRecapModal) --- */}
      {showAnnualRecapModal && activeArchive && (
        <AnnualRecapModal
          archive={activeArchive}
          isLivePreview={!activeArchive.archivedAt}
          isSaving={isArchiving}
          onSaveArchive={() => handleTriggerAnnualArchive(activeArchive.year)}
          onReArchive={() => handleTriggerAnnualArchive(activeArchive.year)}
          onClose={() => {
            setShowAnnualRecapModal(false);
            setActiveArchive(null);
          }}
        />
      )}

      {/* --- Modal: 公費管理 --- */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExpenseModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Receipt size={20} className="text-amber-500"/> 公費收支管理
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            
            {/* 統計摘要 */}
            <div className="bg-amber-50 p-3 rounded-lg mb-4 text-center">
              <p className="text-sm text-amber-800">全歷史打牌累積: <span className="font-bold">${allTimeGameIncome}</span></p>
              <p className="text-sm text-red-600">額外支出/收入: <span className="font-bold">{expenseTotal >=0 ? '+' : ''}{expenseTotal}</span></p>
              <div className="mt-2 border-t border-amber-200 pt-2">
                <p className="text-xs text-gray-500">目前公費水庫結餘 (自動結轉)</p>
                <p className="text-2xl font-bold text-emerald-700">${finalEastMoney}</p>
              </div>
            </div>

            {/* 新增表單 */}
            <form onSubmit={handleAddExpense} className="flex gap-2 mb-4">
              <div className="flex-1 space-y-2">
                 <input 
                   placeholder="項目 (例: 聚餐)" 
                   value={expenseNote} 
                   onChange={e => setExpenseNote(e.target.value)}
                   className="w-full text-sm p-2 border rounded"
                   required
                 />
                 <input 
                   type="number" 
                   placeholder="金額 (支出請打負號)" 
                   value={expenseAmount} 
                   onChange={e => setExpenseAmount(e.target.value)}
                   className="w-full text-sm p-2 border rounded"
                   required
                 />
              </div>
              <button type="submit" className="bg-amber-500 text-white rounded-lg px-4 font-bold hover:bg-amber-600 self-end h-[74px]">
                新增
              </button>
            </form>

            {/* 收支紀錄列表 */}
            <div className="max-h-60 overflow-y-auto space-y-2 border-t pt-2">
               {expenseLogs.map(log => (
                 <div key={log.id} className="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-100 text-sm">
                   <div>
                     <p className="font-bold text-gray-700">{log.note}</p>
                     <p className="text-xs text-gray-400">{log.date}</p>
                   </div>
                   <div className="flex items-center gap-2">
                     <span className={`font-bold ${log.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                       {log.amount > 0 ? '+' : ''}{log.amount}
                     </span>
                     <button onClick={() => handleDeleteExpense(log.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14}/></button>
                   </div>
                 </div>
               ))}
               {expenseLogs.length === 0 && <p className="text-center text-gray-400 text-xs py-2">尚無額外收支紀錄</p>}
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: 個人走勢圖 (含近10場手風近況) --- */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPlayer(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <TrendingUp size={20} className="text-emerald-600"/> {selectedPlayer.name} 的資金曲線
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  累計 {selectedPlayer.rounds} 將・淨損益 {selectedPlayer.net > 0 ? '+' : ''}{selectedPlayer.net}
                </p>
              </div>
              <button onClick={() => setSelectedPlayer(null)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20}/></button>
            </div>

            {/* 近 10 場動態近況看板 */}
            {selectedPlayer.recentStats && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    ⚡ 個人近 {selectedPlayer.recentStats.count} 場手風近況
                  </span>
                  <span className="text-[10px] text-gray-400">（作為標籤貼除依據）</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mt-2">
                  <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-gray-400">近況淨損益</span>
                    <p className={`font-black ${selectedPlayer.recentStats.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {selectedPlayer.recentStats.net > 0 ? '+' : ''}{selectedPlayer.recentStats.net}
                    </p>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-gray-400">近期單場最高</span>
                    <p className="font-black text-purple-700">+{selectedPlayer.recentStats.maxWin}</p>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-gray-400">近期單場最低</span>
                    <p className="font-black text-red-500">{selectedPlayer.recentStats.maxLoss}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 折線圖 */}
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...selectedPlayer.history]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{fontSize: 10}} tickFormatter={(val) => val ? val.slice(5) : ''} />
                  <YAxis tick={{fontSize: 10}} width={32} />
                  <Tooltip />
                  <ReferenceLine y={0} stroke="#000" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} dot={{r:3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 標籤群 */}
            <div className="mt-4 flex gap-2 flex-wrap justify-center border-t pt-3">
              {selectedPlayer.badges.map((b, i) => (
                <span 
                  key={i} 
                  className="px-2.5 py-1 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-200 font-bold flex items-center gap-1 shadow-2xs"
                >
                  <span>{b.icon}</span> 
                  <span>{b.label}</span>
                  {b.desc && <span className="text-[10px] font-normal text-amber-600">({b.desc})</span>}
                </span>
              ))}
              {selectedPlayer.badges.length === 0 && (
                <span className="text-xs text-gray-400">近期無特殊稱號，平穩發育中</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: 結算小幫手 --- */}
      {settlementData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSettlementData(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2 mx-auto pl-6"><Calculator size={20} className="text-blue-500"/> 建議轉帳路徑</h3>
              <button onClick={() => setSettlementData(null)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <div className="space-y-3">
              {settlementData.length > 0 ? (
                settlementData.map((trans, i) => (
                  <div key={i} className={`p-3 rounded-lg font-bold border text-lg ${trans.includes('公費') ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>{trans}</div>
                ))
              ) : <p className="text-gray-500">帳目已平，無需轉帳 🎉</p>}
            </div>
            <p className="text-xs text-gray-400 mt-4">已自動計算公費與最小轉帳路徑</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
