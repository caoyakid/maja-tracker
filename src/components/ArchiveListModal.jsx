import React from 'react';
import { X, Calendar, Trophy, ChevronRight, Archive, Sparkles, PlusCircle } from 'lucide-react';

export default function ArchiveListModal({ 
  archives, 
  currentYear, 
  onSelectArchive, 
  onTriggerAnnualArchive, 
  onClose 
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-5 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Archive size={20} className="text-amber-400" /> 歷年歷史檔案館
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">點選查看過往年度結算成績與榮譽殿堂</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* 內容列表 */}
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          
          {/* 當年度快速歸納卡片 */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-3.5 rounded-xl">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
                <Sparkles size={14} className="text-amber-600" />
                {currentYear} 當年度戰績進行中
              </span>
              <span className="text-[10px] bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                即時數據
              </span>
            </div>
            <p className="text-xs text-gray-600 mb-3">
              可隨時點擊一鍵歸納試算當年度戰報，並封存至歷史檔案庫。
            </p>
            <button
              onClick={() => onTriggerAnnualArchive(currentYear)}
              className="w-full bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <Archive size={14} /> 一鍵歸納 {currentYear} 年度成績
            </button>
          </div>

          <div className="border-t pt-2">
            <p className="text-xs font-bold text-gray-500 mb-2">已封存之歷史檔案 ({archives.length})</p>
            
            {archives.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs">
                <Calendar size={28} className="mx-auto mb-1.5 opacity-40" />
                尚無歷史年度封存紀錄，點擊上方按鈕即可歸納封存！
              </div>
            ) : (
              <div className="space-y-2">
                {archives.map(archive => (
                  <div
                    key={archive.id}
                    onClick={() => onSelectArchive(archive)}
                    className="p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-emerald-50/60 hover:border-emerald-300 transition cursor-pointer flex justify-between items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-gray-800 text-base">{archive.year} 年度</span>
                        {archive.awards?.mvp && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                            <Trophy size={10} className="text-amber-600" /> 雀神: {archive.awards.mvp.name}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 text-[11px] text-gray-400 mt-1">
                        <span>{archive.summary?.totalMatches || 0} 場對局</span>
                        <span>{archive.summary?.totalRounds || 0} 將</span>
                        <span>共 {archive.summary?.totalPlayers || 0} 位玩家</span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="p-3 bg-gray-50 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-lg transition"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
