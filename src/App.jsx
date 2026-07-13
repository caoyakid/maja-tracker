import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Trophy, History, PlusCircle, AlertCircle, Coins, X, Megaphone, UserPlus, Calculator, TrendingUp, Medal, Receipt, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// 預設固定班底
const INITIAL_PRESETS = [
  "JK", "Mochi", "Ryan", "阿傑", "Alan",
  "道道", "嚕卡", "柏鈞", "JS", "萌萌噠"
].map(name => ({ id: name.toLowerCase(), name })); // 改為物件陣列以供備用

const EAST_MONEY_PER_ROUND = 100;

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
  const [expenseLogs, setExpenseLogs] = useState([]); // 新增：公費收支紀錄
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 金額計算狀態
  const [gameIncomeTotal, setGameIncomeTotal] = useState(0); // 打牌累積的
  const [expenseTotal, setExpenseTotal] = useState(0); // 手動花掉的
  const [finalEastMoney, setFinalEastMoney] = useState(0); // 最後顯示的總額

  // UI 狀態
  const [sloganIndex, setSloganIndex] = useState(0);
  const [availablePlayers, setAvailablePlayers] = useState(INITIAL_PRESETS);
  const [showAddPlayer, setShowAddPlayer] = useState(false); // { id: 'xxx', name: 'yyy' }
  const [newPlayerName, setNewPlayerName] = useState("");
  
  // Modals
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [settlementData, setSettlementData] = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false); // 新增：公費管理視窗

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
      calculateStats(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- 3. 新增監聽 Firebase: 公費收支 (Expenses) ---
  useEffect(() => {
    const q = query(collection(db, "expenses"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExpenseLogs(data);
      
      // 計算手動收支總和
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
        setAvailablePlayers(INITIAL_PRESETS); // 如果資料庫是空的，就用預設值
      } else {
        const presetsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAvailablePlayers(presetsData);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 4. 合併計算總公費 ---
  useEffect(() => {
    setFinalEastMoney(gameIncomeTotal + expenseTotal);
  }, [gameIncomeTotal, expenseTotal]);

  // --- 計算邏輯 ---
  const calculateStats = (matchData) => {
    const summary = {};
    let totalGameFund = 0;
    const grandTotalRounds = matchData.reduce((sum, m) => sum + (parseInt(m.rounds) || 1), 0);

    // 1. 先建立一個時間正序的陣列 (最舊 -> 最新)
    const chronologicalMatches = [...matchData].reverse();

    // 2. 改用 chronologicalMatches 跑迴圈
    chronologicalMatches.forEach(match => {
      const matchRounds = parseInt(match.rounds) || 1;
      totalGameFund += matchRounds * EAST_MONEY_PER_ROUND;

      match.records.forEach(record => {
        const pId = record.playerId || record.name.trim(); // 兼容舊資料 (用名字當 id)
        const pName = record.name.trim(); // 名字還是要用最新的
        const amt = parseInt(record.amount) || 0;
        
        if (!summary[pId]) summary[pId] = { 
          name: pName, net: 0, rounds: 0, maxWin: 0, maxLoss: 0, history: [] 
        };
        
        // 累加數值
        summary[pId].name = pName; // 隨時更新為最新的名字
        summary[pId].net += amt;
        summary[pId].rounds += matchRounds;
        if (amt > summary[pId].maxWin) summary[pId].maxWin = amt;
        if (amt < summary[pId].maxLoss) summary[pId].maxLoss = amt;
        
        // 3. 改用 push (因為現在時間是正序，直接往後加就是累積圖)
        summary[pId].history.push({ date: match.date, amount: summary[pId].net });
      });
    });

    setGameIncomeTotal(totalGameFund);

    const sortedStats = Object.entries(summary)
      .map(([name, stat]) => {
        const badges = []; // 這裡的 name 其實是 playerId
        if (stat.net > 2000) badges.push({icon: '🏦', label: '大富豪'});
        if (stat.maxWin >= 1000) badges.push({icon: '🚀', label: '一波流'});
        if (stat.maxLoss <= -1000) badges.push({icon: '💣', label: '自爆兵'});
        if (stat.rounds > 20 && Math.abs(stat.net) < 200) badges.push({icon: '🐢', label: '打工仔'});
        if (stat.net < -2000) badges.push({icon: '💸', label: '慈善家'});

        const attendanceRate = grandTotalRounds > 0 
          ? Math.round((stat.rounds / grandTotalRounds) * 100) 
          : 0;

        return { id: name, ...stat, badges, attendanceRate };
      })
      .sort((a, b) => b.net - a.net);

    setStats(sortedStats);
  };

  // --- 表單處理 ---
  const handlePlayerChange = (index, field, value) => {
    const newPlayers = [...players];
    if (field === 'player') { // 一次設定 id 和 name
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
      // 現在不只是更新本地狀態，而是寫入資料庫
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

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans text-gray-800 pb-20">
      <div className="max-w-md mx-auto space-y-4">
        
        <h1 className="text-3xl font-bold text-emerald-700 text-center py-2 flex items-center justify-center gap-2">
          <span className="text-4xl">🀄</span> 麻將積分榜
        </h1>

        {/* --- 公費卡片 (可點擊) --- */}
        <div className="flex gap-2 h-24">
          <button 
            onClick={() => setShowExpenseModal(true)}
            className="w-1/3 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl p-2 text-white shadow hover:scale-105 transition active:scale-95 flex flex-col justify-center items-center text-center relative overflow-hidden"
          >
            <div className="absolute top-1 right-1 opacity-50"><Receipt size={16}/></div>
            <Coins size={24} className="mb-1 opacity-90" />
            <span className="text-xs opacity-90">目前公費</span>
            <span className="text-xl font-bold">${finalEastMoney}</span>
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

        {/* --- 排行榜 --- */}
        <div className="bg-white p-4 rounded-xl shadow-md">
          <h2 className="text-lg font-bold mb-2 flex items-center gap-2"><Trophy size={18} className="text-yellow-500"/> 排行榜 (點擊看走勢)</h2>
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
                      <div className="flex gap-1 mt-0.5">
                        {s.badges.map((b, i) => <span key={i} title={b.label} className="text-[10px] bg-gray-100 rounded px-1">{b.icon}</span>)}
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
           <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><History size={18} className="text-blue-500" /> 近期戰況</h2>
          <div className="space-y-4">
            {logs.slice(0, 10).map((log) => (
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
            {logs.length === 0 && <p className="text-center text-gray-400 text-sm">暫無紀錄</p>}
          </div>
        </div>
      </div>

      {/* --- Modal: 公費管理 (新增) --- */}
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
              <p className="text-sm text-amber-800">打牌累積收入: <span className="font-bold">${gameIncomeTotal}</span></p>
              <p className="text-sm text-red-600">額外支出/收入: <span className="font-bold">{expenseTotal >=0 ? '+' : ''}{expenseTotal}</span></p>
              <div className="mt-2 border-t border-amber-200 pt-2">
                <p className="text-xs text-gray-500">目前剩餘</p>
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

      {/* --- Modal: 個人走勢圖 (保持不變) --- */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPlayer(null)}>
          <div className="bg-white rounded-xl p-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2"><TrendingUp size={20} className="text-emerald-600"/> {selectedPlayer.name} 的資金曲線</h3>
              <button onClick={() => setSelectedPlayer(null)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...selectedPlayer.history]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{fontSize: 10}} tickFormatter={(val) => val.slice(5)} />
                  <YAxis tick={{fontSize: 10}} width={30} />
                  <Tooltip />
                  <ReferenceLine y={0} stroke="#000" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} dot={{r:3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap justify-center">
              {selectedPlayer.badges.map((b,i) => <span key={i} className="px-2 py-1 bg-yellow-50 text-yellow-700 text-xs rounded border border-yellow-200 font-bold flex items-center gap-1">{b.icon} {b.label}</span>)}
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: 結算小幫手 (保持不變) --- */}
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