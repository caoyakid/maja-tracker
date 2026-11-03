// 麻將積分與年度歸納計算工具
export const EAST_MONEY_PER_ROUND = 100;

/**
 * 計算對局戰績與玩家排行榜
 * @param {Array} matchData - 比賽紀錄陣列 (date 降序排列)
 */
export const calculateStats = (matchData) => {
  const summary = {};
  let totalGameFund = 0;
  const grandTotalRounds = matchData.reduce((sum, m) => sum + (parseInt(m.rounds) || 1), 0);

  // 1. 建立時間正序陣列 (最舊 -> 最新)
  const chronologicalMatches = [...matchData].reverse();

  // 2. 累加統計
  chronologicalMatches.forEach(match => {
    const matchRounds = parseInt(match.rounds) || 1;
    totalGameFund += matchRounds * EAST_MONEY_PER_ROUND;

    match.records.forEach(record => {
      const pId = record.playerId || record.name.trim();
      const pName = record.name.trim();
      const amt = parseInt(record.amount) || 0;

      if (!summary[pId]) {
        summary[pId] = {
          name: pName,
          net: 0,
          rounds: 0,
          maxWin: 0,
          maxLoss: 0,
          history: [],
          matchRecords: [] // 玩家個人出賽紀錄 (正序)
        };
      }

      summary[pId].name = pName;
      summary[pId].net += amt;
      summary[pId].rounds += matchRounds;
      if (amt > summary[pId].maxWin) summary[pId].maxWin = amt;
      if (amt < summary[pId].maxLoss) summary[pId].maxLoss = amt;

      summary[pId].history.push({ date: match.date, amount: summary[pId].net });
      summary[pId].matchRecords.push({ date: match.date, amount: amt, rounds: matchRounds });
    });
  });

  // 3. 計算標籤：以「個人最近出賽的 10 場」為基準 (動態貼上 / 撕下)
  const sortedStats = Object.entries(summary)
    .map(([id, stat]) => {
      const badges = [];
      const personalMatches = stat.matchRecords;
      const recentMatches = personalMatches.slice(-10); // 最近 10 場
      const recentNet = recentMatches.reduce((acc, m) => acc + m.amount, 0);
      const recentMaxWin = recentMatches.length > 0 ? Math.max(...recentMatches.map(m => m.amount)) : 0;
      const recentMaxLoss = recentMatches.length > 0 ? Math.min(...recentMatches.map(m => m.amount)) : 0;

      // 計算連負 / 連勝場次 (從最新一場往回倒數)
      let consecutiveLosses = 0;
      let consecutiveWins = 0;
      for (let i = recentMatches.length - 1; i >= 0; i--) {
        if (recentMatches[i].amount < 0) {
          if (consecutiveWins === 0) consecutiveLosses++;
        } else if (recentMatches[i].amount > 0) {
          if (consecutiveLosses === 0) consecutiveWins++;
        } else {
          break;
        }
      }

      // 動態標籤規則
      if (recentMatches.length >= 3) {
        if (recentNet >= 3000) badges.push({ icon: '🔥', label: '手感發燙', desc: '近10場淨贏 3000+' });
        if (recentNet <= -3000) badges.push({ icon: '💸', label: '近期大善人', desc: '近10場淨輸 3000+' });
        if (recentMaxLoss <= -2500) badges.push({ icon: '💣', label: '高危自爆兵', desc: '近10場單場輸 2500+' });
        if (recentMaxWin >= 2500) badges.push({ icon: '🚀', label: '單發火箭', desc: '近10場單場贏 2500+' });
        if (recentMatches.length >= 6 && Math.abs(recentNet) < 300) badges.push({ icon: '🐢', label: '打工仔', desc: '近10場損益極平' });
        if (consecutiveLosses >= 4) badges.push({ icon: '🥶', label: '急凍寒流', desc: `連續 ${consecutiveLosses} 場負分` });
      } else if (recentMatches.length > 0) {
        badges.push({ icon: '🌱', label: '新手上路', desc: '出賽未滿 3 場' });
      }

      const attendanceRate = grandTotalRounds > 0 
        ? Math.round((stat.rounds / grandTotalRounds) * 100) 
        : 0;

      return {
        id,
        ...stat,
        badges,
        attendanceRate,
        recentStats: {
          count: recentMatches.length,
          net: recentNet,
          maxWin: recentMaxWin,
          maxLoss: recentMaxLoss,
          consecutiveLosses,
          consecutiveWins
        }
      };
    })
    .sort((a, b) => b.net - a.net);

  return {
    stats: sortedStats,
    totalGameFund,
    grandTotalRounds
  };
};

/**
 * 產生年度歷史檔案快照資料
 */
export const calculateAnnualArchive = (year, matches, expenses) => {
  const targetYearStr = String(year);
  const targetMatches = matches.filter(m => m.date && m.date.startsWith(`${targetYearStr}-`));
  const targetExpenses = expenses.filter(e => e.date && e.date.startsWith(`${targetYearStr}-`));

  const { stats, totalGameFund, grandTotalRounds } = calculateStats(targetMatches);
  const expenseTotal = targetExpenses.reduce((sum, item) => sum + (parseInt(item.amount) || 0), 0);
  const netFundYear = totalGameFund + expenseTotal;

  // 榮譽殿堂運算
  // 1. 單場爆發贏 / 單場自爆輸
  let maxBurstWin = { name: '-', amount: 0, date: '' };
  let maxSingleLoss = { name: '-', amount: 0, date: '' };

  targetMatches.forEach(m => {
    (m.records || []).forEach(r => {
      const amt = parseInt(r.amount) || 0;
      if (amt > maxBurstWin.amount) {
        maxBurstWin = { name: r.name, amount: amt, date: m.date };
      }
      if (amt < maxSingleLoss.amount) {
        maxSingleLoss = { name: r.name, amount: amt, date: m.date };
      }
    });
  });

  const sortedByRounds = [...stats].sort((a, b) => b.rounds - a.rounds);
  const attendanceKing = sortedByRounds.length > 0 && sortedByRounds[0].rounds > 0 
    ? { name: sortedByRounds[0].name, rounds: sortedByRounds[0].rounds, attendanceRate: sortedByRounds[0].attendanceRate }
    : null;

  const mvp = stats.length > 0 && stats[0].net > 0 
    ? { name: stats[0].name, net: stats[0].net, rounds: stats[0].rounds }
    : (stats.length > 0 ? { name: stats[0].name, net: stats[0].net, rounds: stats[0].rounds } : null);

  const philanthropist = stats.length > 0 && stats[stats.length - 1].net < 0
    ? { name: stats[stats.length - 1].name, net: stats[stats.length - 1].net, rounds: stats[stats.length - 1].rounds }
    : null;

  return {
    year: parseInt(targetYearStr, 10),
    summary: {
      totalMatches: targetMatches.length,
      totalRounds: grandTotalRounds,
      totalPlayers: stats.length,
      gameFundTotal: totalGameFund,
      expenseTotal,
      netFundYear
    },
    awards: {
      mvp,
      philanthropist,
      attendanceKing,
      maxBurstWin: maxBurstWin.amount > 0 ? maxBurstWin : null,
      maxSingleLoss: maxSingleLoss.amount < 0 ? maxSingleLoss : null
    },
    leaderboard: stats.map((s, idx) => ({
      rank: idx + 1,
      id: s.id,
      name: s.name,
      net: s.net,
      rounds: s.rounds,
      attendanceRate: s.attendanceRate,
      maxWin: s.maxWin,
      maxLoss: s.maxLoss,
      badges: s.badges,
      history: s.history
    }))
  };
};

/**
 * 產出 LINE 分享文案
 */
export const formatLineReport = (archive) => {
  const { year, summary, awards, leaderboard } = archive;
  const lines = [
    `🀄 【${year} 麻將年度英雄榜 & 榮譽殿堂】 🀄`,
    `═══════════════════`,
    `📊 年度數據總覽：`,
    `• 總出賽場次：${summary.totalMatches} 場 (${summary.totalRounds} 將)`,
    `• 總參賽人數：${summary.totalPlayers} 人`,
    `• 打牌公費抽水：$${summary.gameFundTotal}`,
    `═══════════════════`,
    `🏆 【榮譽殿堂】`
  ];

  if (awards?.mvp) {
    lines.push(`👑 年度雀神 (MVP)：${awards.mvp.name} (+$${awards.mvp.net})`);
  }
  if (awards?.philanthropist) {
    lines.push(`💸 年度大慈善家：${awards.philanthropist.name} ($${awards.philanthropist.net})`);
  }
  if (awards?.attendanceKing) {
    lines.push(`🏃 全勤鐵人：${awards.attendanceKing.name} (${awards.attendanceKing.rounds} 將, ${awards.attendanceKing.attendanceRate}%)`);
  }
  if (awards?.maxBurstWin) {
    lines.push(`🚀 單場破壞王：${awards.maxBurstWin.name} (+$${awards.maxBurstWin.amount} @ ${awards.maxBurstWin.date})`);
  }
  if (awards?.maxSingleLoss) {
    lines.push(`💣 核爆受災戶：${awards.maxSingleLoss.name} ($${awards.maxSingleLoss.amount} @ ${awards.maxSingleLoss.date})`);
  }

  lines.push(`═══════════════════`);
  lines.push(`🏅 【${year} 最終年度積分榜】`);

  (leaderboard || []).forEach((p, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
    const sign = p.net > 0 ? '+' : '';
    lines.push(`${medal} ${p.name}：${sign}$${p.net} (${p.rounds}將)`);
  });

  lines.push(`═══════════════════`);
  lines.push(`🎉 感謝大家這一年來的陪伴與送幸福，新年繼續發大財！🀄✨`);

  return lines.join('\n');
};
