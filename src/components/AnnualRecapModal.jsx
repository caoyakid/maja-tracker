import React, { useState } from 'react';
import { X, Trophy, Medal, Copy, Check, TrendingUp, Flame, Coins, Calendar, RefreshCw, Sparkles, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatLineReport } from '../utils/stats';

export default function AnnualRecapModal({ 
  archive, 
  onClose, 
  onReArchive, 
  isSaving,
  isLivePreview = false,
  onSaveArchive
}) {
  const [copied, setCopied] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  if (!archive) return null;

  const { year, summary, awards, leaderboard, archivedAt } = archive;

  const handleCopyLineReport = async () => {
    try {
      const text = formatLineReport(archive);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('複製失敗:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-6 border border-amber-200 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal 頂部 Header */}
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-emerald-700 text-white p-5 relative">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-1.5 rounded-full bg-black/20 hover:bg-black/30 transition text-white"
          >
            <X size={20} />
          </button>
          
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-white/20 text-xs px-2.5 py-0.5 rounded-full font-bold backdrop-blur-xs flex items-center gap-1">
              <Sparkles size={12} className="text-yellow-300" />
              {isLivePreview ? '即時戰報預覽' : '典藏歷史檔案'}
            </span>
            {archivedAt && (
              <span className="text-[11px] opacity-80">
                封存於 {typeof archivedAt === 'string' ? archivedAt : (archivedAt.toDate ? archivedAt.toDate().toLocaleDateString() : '歷史存檔')}
              </span>
            )}
          </div>

          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <span>🀄</span> {year} 麻將年度英雄榜
          </h2>
          <p className="text-xs text-amber-100 mt-1">年度戰況匯總・榮譽殿堂・最終積分榜</p>

          {/* 數據快速概覽 */}
          <div className="grid grid-cols-4 gap-2 mt-4 text-center">
            <div className="bg-white/10 rounded-xl p-2 backdrop-blur-xs">
              <p className="text-[10px] text-amber-100">總場次</p>
              <p className="text-base font-black">{summary?.totalMatches || 0} <span className="text-xs font-normal">場</span></p>
            </div>
            <div className="bg-white/10 rounded-xl p-2 backdrop-blur-xs">
              <p className="text-[10px] text-amber-100">總將數</p>
              <p className="text-base font-black">{summary?.totalRounds || 0} <span className="text-xs font-normal">將</span></p>
            </div>
            <div className="bg-white/10 rounded-xl p-2 backdrop-blur-xs">
              <p className="text-[10px] text-amber-100">參賽人數</p>
              <p className="text-base font-black">{summary?.totalPlayers || 0} <span className="text-xs font-normal">人</span></p>
            </div>
            <div className="bg-white/10 rounded-xl p-2 backdrop-blur-xs">
              <p className="text-[10px] text-amber-100">公費抽水</p>
              <p className="text-base font-black">${summary?.gameFundTotal || 0}</p>
            </div>
          </div>
        </div>

        {/* Modal 內容區 */}
        <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto">
          
          {/* 操作按鈕群 (複製分享 / 重新歸納) */}
          <div className="flex gap-2">
            <button
              onClick={handleCopyLineReport}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? '已複製 LINE 戰報文案！' : '複製 LINE 年度戰報'}
            </button>

            {isLivePreview && onSaveArchive && (
              <button
                onClick={onSaveArchive}
                disabled={isSaving}
                className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1 transition shadow disabled:opacity-50"
              >
                <RefreshCw size={14} className={isSaving ? 'animate-spin' : ''} />
                {isSaving ? '歸納中...' : '確認封存'}
              </button>
            )}

            {!isLivePreview && onReArchive && (
              <button
                onClick={onReArchive}
                disabled={isSaving}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1 transition"
                title="以最新數據重新歸納覆蓋此檔案"
              >
                <RefreshCw size={13} className={isSaving ? 'animate-spin' : ''} />
                {isSaving ? '更新中' : '重新歸納'}
              </button>
            )}
          </div>

          {/* 榮譽殿堂 (Awards) */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1.5">
              <Trophy size={16} className="text-amber-500" /> 年度榮譽殿堂 (Awards)
            </h3>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* 雀神 MVP */}
              <div className="bg-gradient-to-br from-amber-50 to-yellow-100 border border-amber-200 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-amber-800 bg-amber-200/60 px-1.5 py-0.5 rounded">👑 年度雀神 MVP</span>
                <p className="font-black text-sm text-amber-950 mt-1">{awards?.mvp?.name || '無'}</p>
                <p className="text-[11px] text-emerald-700 font-bold">
                  {awards?.mvp ? `+$${awards.mvp.net}` : '-'}
                  <span className="text-gray-500 font-normal ml-1">({awards?.mvp?.rounds || 0}將)</span>
                </p>
              </div>

              {/* 大慈善家 */}
              <div className="bg-gradient-to-br from-red-50 to-rose-100 border border-red-200 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-red-800 bg-red-200/60 px-1.5 py-0.5 rounded">💸 年度大慈善家</span>
                <p className="font-black text-sm text-red-950 mt-1">{awards?.philanthropist?.name || '無'}</p>
                <p className="text-[11px] text-red-600 font-bold">
                  {awards?.philanthropist ? `$${awards.philanthropist.net}` : '-'}
                  <span className="text-gray-500 font-normal ml-1">({awards?.philanthropist?.rounds || 0}將)</span>
                </p>
              </div>

              {/* 全勤鐵人 */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-blue-800 bg-blue-200/60 px-1.5 py-0.5 rounded">🏃 全勤打牌鐵人</span>
                <p className="font-black text-sm text-blue-950 mt-1">{awards?.attendanceKing?.name || '無'}</p>
                <p className="text-[11px] text-blue-700 font-bold">
                  {awards?.attendanceKing?.rounds || 0} 將
                  <span className="text-gray-500 font-normal ml-1">({awards?.attendanceKing?.attendanceRate || 0}%)</span>
                </p>
              </div>

              {/* 單場破壞王 */}
              <div className="bg-gradient-to-br from-purple-50 to-fuchsia-100 border border-purple-200 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-purple-800 bg-purple-200/60 px-1.5 py-0.5 rounded">🚀 單場破壞王</span>
                <p className="font-black text-sm text-purple-950 mt-1">{awards?.maxBurstWin?.name || '無'}</p>
                <p className="text-[11px] text-purple-700 font-bold">
                  {awards?.maxBurstWin?.amount ? `+$${awards.maxBurstWin.amount}` : '-'}
                  <span className="text-gray-400 font-normal text-[10px] ml-1">({awards?.maxBurstWin?.date?.slice(5) || ''})</span>
                </p>
              </div>

              {/* 核爆受災戶 */}
              <div className="bg-gradient-to-br from-stone-50 to-stone-200 border border-stone-300 p-2.5 rounded-xl col-span-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-bold text-stone-800 bg-stone-300/60 px-1.5 py-0.5 rounded">💣 核爆受災戶 (單場最大失血)</span>
                    <p className="font-black text-sm text-stone-900 mt-1">
                      {awards?.maxSingleLoss?.name || '無'}
                      <span className="text-red-600 font-bold ml-2">
                        {awards?.maxSingleLoss?.amount ? `$${awards.maxSingleLoss.amount}` : '-'}
                      </span>
                    </p>
                  </div>
                  {awards?.maxSingleLoss?.date && (
                    <span className="text-stone-400 text-xs">{awards.maxSingleLoss.date}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 年度完整積分榜 */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <Medal size={16} className="text-emerald-600" /> {year} 最終年度積分榜
              </h3>
              <span className="text-[11px] text-gray-400">點擊看年度走勢</span>
            </div>

            <div className="border rounded-xl overflow-hidden bg-white shadow-xs">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b">
                  <tr>
                    <th className="py-2 pl-3 text-left w-10">名次</th>
                    <th className="py-2 text-left">玩家</th>
                    <th className="py-2 text-center">將數</th>
                    <th className="py-2 text-center">出席率</th>
                    <th className="py-2 pr-3 text-right">年度損益</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(leaderboard || []).map((p, idx) => (
                    <tr 
                      key={p.id} 
                      onClick={() => setSelectedPlayer(p)}
                      className="hover:bg-amber-50/60 cursor-pointer transition"
                    >
                      <td className="py-2.5 pl-3 font-bold text-gray-500">
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                      </td>
                      <td className="py-2.5 font-bold text-gray-800">
                        {p.name}
                        {p.badges && p.badges.length > 0 && (
                          <span className="ml-1 text-[10px]" title={p.badges.map(b=>b.label).join(', ')}>
                            {p.badges[0].icon}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-gray-500">{p.rounds}</td>
                      <td className="py-2.5 text-center text-gray-500">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${p.attendanceRate >= 50 ? 'bg-orange-100 text-orange-700 font-bold' : 'bg-gray-100'}`}>
                          {p.attendanceRate}%
                        </span>
                      </td>
                      <td className={`py-2.5 pr-3 text-right font-black ${p.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {p.net > 0 ? `+${p.net}` : p.net}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 內嵌走勢圖 (點擊玩家時展示) */}
        {selectedPlayer && (
          <div className="border-t bg-slate-50 p-4 animate-fade-in">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-bold text-gray-700 flex items-center gap-1">
                <TrendingUp size={14} className="text-emerald-600" />
                {selectedPlayer.name} 的 {year} 年度資金走勢
              </h4>
              <button 
                onClick={() => setSelectedPlayer(null)}
                className="text-[11px] text-gray-400 hover:text-gray-600"
              >
                收合走勢
              </button>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...(selectedPlayer.history || [])]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{fontSize: 9}} tickFormatter={(val) => val ? val.slice(5) : ''} />
                  <YAxis tick={{fontSize: 9}} width={32} />
                  <Tooltip />
                  <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2.5} dot={{r: 2}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Modal 底部按鈕 */}
        <div className="p-3 bg-gray-50 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-lg transition"
          >
            關閉戰報
          </button>
        </div>
      </div>
    </div>
  );
}
