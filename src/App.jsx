import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { Trophy, History, PlusCircle, AlertCircle, Coins, X, Megaphone, UserPlus, Calculator, TrendingUp, Medal, Percent } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// 預設固定班底 (可自行修改)
const INITIAL_PRESETS = [
  "JK", "Mochi", "Ryan", "阿傑", 
  "道道", "嚕卡", "柏鈞", "JS"
];

const EAST_MONEY_PER_ROUND = 100;

// 跑馬燈標語
const SLOGANS = [
  "小賭怡情，大賭郭台銘 💸",
  "小孩沒有天天哭，麻將沒有天天輸 🀄",
  "贏錢吃紅，輸錢裝窮 😂",
  "不打到最後，怎麼知道會輸多少🤫",
  "有錢不賭，愧對父母 😭",
  "沈迷賭博，富可敵國 🔥"
];

// --- 輔助功能：結算算法 (修正版：包含公費) ---
const calculateSettlement = (records) => {
  // 1. 分類贏家與輸家
  // 輸家從小排到大 (例如 -500, -200, -100)，讓輸最多的人先去填補贏家
  let debtors = records.filter(r => r.amount < 0).sort((a, b) => a.amount - b.amount);
  // 贏家從大排到小
  let creditors = records.filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);
  
  const transactions = [];
  let dIndex = 0;
  let cIndex = 0;

  // 深拷貝以免影響原始資料顯示
  debtors = debtors.map(d => ({...d}));
  creditors = creditors.map(c => ({...c}));

  // 2. 進行媒合 (P2P轉帳)
  while (dIndex < debtors.length && cIndex < creditors.length) {
    let debtor = debtors[dIndex];
    let creditor = creditors[cIndex];
    
    // 取「債務人欠款」與「債權人應收」的最小值
    let amount = Math.min(Math.abs(debtor.amount), creditor.amount);
    
    if (amount > 0) {
      transactions.push(`${debtor.name} ➜ ${creditor.name} $${amount}`);
    }

    // 更新餘額
    debtor.amount += amount; // 負數加正數 = 接近0
    creditor.amount -= amount;

    // 如果債務人還清了(變成0)，換下一個債務人
    // 注意：浮點數計算可能有誤差，所以用 < 1 判斷
    if (Math.abs(debtor.amount) < 1) dIndex++;
    // 如果債權人收滿了(變成0)，換下一個債權人
    if (creditor.amount < 1) cIndex++;
  }

  // 3. 檢查剩餘債務 (這些就是東錢/公費)
  debtors.forEach(d => {
    if (Math.abs(d.amount) >= 1) {
       transactions.push(`${d.name} ➜ 💰公費 $${Math.abs(d.amount)}`);
    }
  });

  return transactions;
};

function App() {
  // --- 狀態管理 ---
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eastMoneyTotal, setEastMoneyTotal] = useState(0);
  
  // UI 狀態
  const [sloganIndex, setSloganIndex] = useState(0);
  const [availablePlayers, setAvailablePlayers] = useState(INITIAL_PRESETS);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  
  // Modal 狀態
  const [selectedPlayer, setSelectedPlayer] = useState(null); // 用於顯示圖表
  const [settlementData, setSettlementData] = useState(null); // 用於顯示結算

  // 表單狀態
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [rounds, setRounds] = useState(1);
  const [players, setPlayers] = useState([
    { name: '', amount: '' },
    { name: '', amount: '' },
    { name: '', amount: '' },
    { name: '', amount: '' }
  ]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // --- 1. 跑馬燈特效 ---
  useEffect(() => {
    const interval = setInterval(() => {
      setSloganIndex((prev) => (prev + 1) % SLOGANS.length);
    }, 4000); 
    return () => clearInterval(interval);
  }, []);

  // --- 2. 從 Firebase 讀取資料 ---
  useEffect(() => {
    const q = query(collection(db, "matches"), orderBy("date", "desc")); 
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);
      calculateStats(data); // 觸發計算
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- 3. 計算排行榜、徽章與出席率 ---
  const calculateStats = (matchData) => {
    const summary = {};
    let totalFund = 0;
    
    // 計算總體將數 (作為出席率的分母)
    const grandTotalRounds = matchData.reduce((sum, m) => sum + (parseInt(m.rounds) || 1), 0);

    matchData.forEach(match => {
      const matchRounds = parseInt(match.rounds) || 1;
      totalFund += matchRounds * EAST_MONEY_PER_ROUND;

      match.records.forEach(record => {
        const pName = record.name.trim();
        const amt = parseInt(record.amount) || 0;
        
        if (!summary[pName]) summary[pName] = { 
          net: 0, 
          rounds: 0, 
          maxWin: 0, 
          maxLoss: 0,
          history: [] // 用於畫圖
        };
        
        summary[pName].net += amt;
        summary[pName].rounds += matchRounds;
        if (amt > summary[pName].maxWin) summary[pName].maxWin = amt;
        if (amt < summary[pName].maxLoss) summary[pName].maxLoss = amt;
        
        // 紀錄每一場的累積金額 (為了畫圖)
        summary[pName].history.unshift({ date: match.date, amount: summary[pName].net });
      });
    });

    setEastMoneyTotal(totalFund);

    // 轉成陣列並排序
    const sortedStats = Object.entries(summary)
      .map(([name, stat]) => {
        // --- 徽章邏輯 ---
        const badges = [];
        if (stat.net > 2000) badges.push({icon: '🏦', label: '大富豪'});
        if (stat.maxWin >= 1000) badges.push({icon: '🚀', label: '一波流'});
        if (stat.maxLoss <= -1000) badges.push({icon: '💣', label: '自爆兵'});
        if (stat.rounds > 20 && Math.abs(stat.net) < 200) badges.push({icon: '🐢', label: '打工仔'});
        if (stat.net < -2000) badges.push({icon: '💸', label: '慈善家'});

        // --- 出席率邏輯 ---
        const attendanceRate = grandTotalRounds > 0 
          ? Math.round((stat.rounds / grandTotalRounds) * 100) 
          : 0;

        return { name, ...stat, badges, attendanceRate };
      })
      .sort((a, b) => b.net - a.net);

    setStats(sortedStats);
  };

  // --- 4. 功能函式 ---
  const handlePlayerChange = (index, field, value) => {
    const newPlayers = [...players];
    newPlayers[index][field] = value;
    setPlayers(newPlayers);
  };

  const quickAddPlayer = (name) => {
    if (players.some(p => p.name === name)) return;
    const emptyIndex = players.findIndex(p => p.name === '');
    if (emptyIndex !== -1) {
      handlePlayerChange(emptyIndex, 'name', name);
    }
  };

  const handleAddNewPlayer = () => {
    if (newPlayerName.trim() && !availablePlayers.includes(newPlayerName)) {
      setAvailablePlayers([...availablePlayers, newPlayerName.trim()]);
      setNewPlayerName("");
      setShowAddPlayer(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (players.some(p => !p.name.trim())) {
      setError("❌ 請輸入所有玩家姓名");
      return;
    }
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

  // --- UI Render ---
  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans text-gray-800 pb-20">
      <div className="max-w-md mx-auto space-y-4">
        
        <h1 className="text-3xl font-bold text-emerald-700 text-center py-2 flex items-center justify-center gap-2">
          <span className="text-4xl">🀄</span> 麻將積分榜
        </h1>

        {/* --- 公費 + 佈告欄 --- */}
        <div className="flex gap-2 h-24">
          <div className="w-1/3 bg-amber-500 rounded-xl p-2 text-white shadow flex flex-col justify-center items-center text-center">
            <Coins size={24} className="mb-1 opacity-80" />
            <span className="text-xs opacity-90">累積東錢</span>
            <span className="text-xl font-bold">${eastMoneyTotal}</span>
          </div>
          <div className="w-2/3 bg-white rounded-xl p-3 shadow flex items-center relative overflow-hidden">
             <div className="absolute left-2 top-2 text-emerald-500"><Megaphone size={16} /></div>
             <div className="w-full pl-6 pr-2">
               <p key={sloganIndex} className="text-sm font-medium text-gray-600 animate-fade-in-up">{SLOGANS[sloganIndex]}</p>
             </div>
             <div className="absolute right-2 bottom-2 text-[10px] text-gray-300">每 4 秒切換</div>
          </div>
        </div>

        {/* --- 登錄戰績區 --- */}
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
                {availablePlayers.map(name => (
                  <button key={name} type="button" onClick={() => quickAddPlayer(name)} disabled={players.some(p => p.name === name)}
                    className={`px-2.5 py-1 rounded text-xs border transition ${players.some(p => p.name === name) ? 'bg-gray-200 text-gray-400 border-gray-200' : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-500 hover:text-emerald-600 shadow-sm'}`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              {players.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input placeholder={`玩家 ${i+1}`} value={p.name} readOnly className="flex-1 p-2 border rounded bg-gray-100 text-gray-700 text-sm cursor-not-allowed" onClick={() => { if(p.name) handlePlayerChange(i, 'name', ''); }}/>
                  <input placeholder="$" type="number" value={p.amount} onChange={e => handlePlayerChange(i, 'amount', e.target.value)} className={`w-20 p-2 border rounded text-right font-bold text-sm ${parseInt(p.amount) < 0 ? 'text-red-500' : 'text-emerald-600'}`}/>
                  {p.name && <button type="button" onClick={() => handlePlayerChange(i, 'name', '')} className="text-gray-400 hover:text-red-500"><X size={16} /></button>}
                </div>
              ))}
            </div>

            {error && <div className="bg-red-50 text-red-600 p-2 rounded text-xs flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}
            {successMsg && <div className="bg-green-50 text-green-600 p-2 rounded text-center text-sm font-bold">{successMsg}</div>}

            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg shadow-md transition transform active:scale-95 text-sm">確認送出</button>
          </form>
        </div>

        {/* --- 排行榜 (新增出席率欄位) --- */}
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
                  <tr key={s.name} onClick={() => setSelectedPlayer(s)} className="border-b last:border-0 hover:bg-emerald-50 cursor-pointer transition">
                    <td className="py-2 pl-2 font-medium flex flex-col justify-center">
                      <div className="flex items-center gap-1">
                        {idx===0 ? '👑' : ''} {s.name}
                      </div>
                      <div className="flex gap-1 mt-0.5">
                        {s.badges.map((b, i) => <span key={i} title={b.label} className="text-[10px] bg-gray-100 rounded px-1">{b.icon}</span>)}
                      </div>
                    </td>
                    <td className="text-center text-gray-400">{s.rounds}</td>
                    <td className="text-center text-gray-500 text-xs">
                       <span className={`px-1.5 py-0.5 rounded ${s.attendanceRate > 50 ? 'bg-orange-100 text-orange-700 font-bold' : 'bg-gray-100'}`}>
                         {s.attendanceRate}%
                       </span>
                    </td>
                    <td className={`text-right font-bold pr-2 ${s.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{s.net > 0 ? '+' : ''}{s.net}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- 近期戰況 (含結算功能) --- */}
        <div className="bg-white p-4 rounded-xl shadow-md">
           <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <History size={18} className="text-blue-500" /> 近期戰況
          </h2>
          <div className="space-y-4">
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="border-b last:border-0 pb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-400">{log.date}</span>
                  <div className="flex gap-2">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{log.rounds || 1} 將</span>
                    <button 
                      onClick={() => setSettlementData(calculateSettlement(log.records))}
                      className="text-xs flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full hover:bg-blue-100 font-bold"
                    >
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

      {/* --- Modal: 個人走勢圖 --- */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPlayer(null)}>
          <div className="bg-white rounded-xl p-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <TrendingUp size={20} className="text-emerald-600"/> {selectedPlayer.name} 的資金曲線
              </h3>
              <button onClick={() => setSelectedPlayer(null)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...selectedPlayer.history].reverse()}>
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
              {selectedPlayer.badges.map((b,i) => (
                <span key={i} className="px-2 py-1 bg-yellow-50 text-yellow-700 text-xs rounded border border-yellow-200 font-bold flex items-center gap-1">
                  {b.icon} {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: 結算小幫手 --- */}
      {settlementData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSettlementData(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2 mx-auto pl-6">
                <Calculator size={20} className="text-blue-500"/> 建議轉帳路徑
              </h3>
              <button onClick={() => setSettlementData(null)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <div className="space-y-3">
              {settlementData.length > 0 ? (
                settlementData.map((trans, i) => (
                  <div key={i} className={`p-3 rounded-lg font-bold border text-lg ${trans.includes('公費') ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                    {trans}
                  </div>
                ))
              ) : (
                <p className="text-gray-500">帳目已平，無需轉帳 🎉</p>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-4">已自動計算公費與最小轉帳路徑</p>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;