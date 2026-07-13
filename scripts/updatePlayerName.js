// /Users/lucaho/maja-app/scripts/updatePlayerName.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

// --- 設定 ---
// 您要修改的玩家 ID
const TARGET_PLAYER_ID = 'js'; 
// 您要更新成的新名字
const NEW_NAME = '魔王';
// --- 設定結束 ---


// 複製您的 firebase.js 中的設定
const firebaseConfig = {
  apiKey: "AIzaSyDZsjsxJhe4JFLHGwiArfH6ItV-k-AzjHg",
  authDomain: "maja-tracker.firebaseapp.com",
  projectId: "maja-tracker",
  storageBucket: "maja-tracker.firebasestorage.app",
  messagingSenderId: "648492219937",
  appId: "1:648492219937:web:aa9710b7d982ace148ad60",
  measurementId: "G-X0GECDXYS8"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateHistoricalNames() {
  console.log(`🚀 開始更新歷史紀錄中 player ID 為 "${TARGET_PLAYER_ID}" 的名稱為 "${NEW_NAME}"...`);

  const matchesCollection = collection(db, 'matches');
  const matchesSnapshot = await getDocs(matchesCollection);
  console.log(`🔍 找到 ${matchesSnapshot.size} 筆比賽紀錄，開始檢查...`);

  const batch = writeBatch(db);
  let updatedDocsCount = 0;

  matchesSnapshot.forEach(matchDoc => {
    const matchData = matchDoc.data();
    let needsUpdate = false;

    const newRecords = matchData.records.map(record => {
      if (record.playerId === TARGET_PLAYER_ID && record.name !== NEW_NAME) {
        needsUpdate = true;
        return { ...record, name: NEW_NAME };
      }
      return record;
    });

    if (needsUpdate) {
      const matchRef = doc(db, 'matches', matchDoc.id);
      batch.update(matchRef, { records: newRecords });
      updatedDocsCount++;
      console.log(`🔄️ 準備更新文件: ${matchDoc.id}`);
    }
  });

  if (updatedDocsCount > 0) {
    await batch.commit();
    console.log(`\n🎉 成功！批次更新了 ${updatedDocsCount} 份文件中的玩家名稱。`);
  } else {
    console.log('\n✅ 資料已是最新，無需更新。');
  }
  
  process.exit(0);
}

updateHistoricalNames().catch(error => {
  console.error('❌ 更新過程中發生錯誤:', error);
  process.exit(1);
});