// /Users/lucaho/maja-app/scripts/addPlayerIds.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

// 複製您 firebase.js 中的設定，但移除環境變數，直接貼上金鑰
// 因為這是在 Node.js 環境執行，不會讀取 .env 檔案
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

async function migratePlayerIds() {
  console.log('🚀 開始進行資料遷移...');

  // 1. 取得所有玩家 preset，建立一個 name -> id 的對應表
  const presetsCollection = collection(db, 'presets');
  const presetsSnapshot = await getDocs(presetsCollection);
  const nameToIdMap = new Map();
  presetsSnapshot.forEach(doc => {
    nameToIdMap.set(doc.data().name, doc.id);
  });
  console.log('✅ 成功建立玩家 ID 對應表:', nameToIdMap);

  // 2. 取得所有比賽紀錄
  const matchesCollection = collection(db, 'matches');
  const matchesSnapshot = await getDocs(matchesCollection);
  console.log(`🔍 找到 ${matchesSnapshot.size} 筆比賽紀錄，開始檢查...`);

  // 3. 準備批次寫入
  const batch = writeBatch(db);
  let updatedDocsCount = 0;

  matchesSnapshot.forEach(matchDoc => {
    const matchData = matchDoc.data();
    let needsUpdate = false;

    const newRecords = matchData.records.map(record => {
      // 如果紀錄已經有 playerId，或者沒有 name，就跳過
      if (record.playerId || !record.name) {
        return record;
      }

      // 從對應表中尋找 playerId
      const playerId = nameToIdMap.get(record.name.trim());

      if (playerId) {
        needsUpdate = true;
        return { ...record, playerId: playerId };
      } else {
        // 如果在 presets 找不到對應名字，則使用舊的降級相容邏輯 (名字小寫)
        // 這可以處理那些在 presets 建立前就已存在的玩家
        console.warn(`⚠️ 在 presets 中找不到玩家 "${record.name}"，將使用小寫名稱作為 ID。`);
        needsUpdate = true;
        return { ...record, playerId: record.name.trim().toLowerCase() };
      }
    });

    // 如果這份文件有任何更新，就加入到批次作業中
    if (needsUpdate) {
      const matchRef = doc(db, 'matches', matchDoc.id);
      batch.update(matchRef, { records: newRecords });
      updatedDocsCount++;
      console.log(`🔄️ 準備更新文件: ${matchDoc.id}`);
    }
  });

  // 4. 執行批次寫入
  if (updatedDocsCount > 0) {
    await batch.commit();
    console.log(`\n🎉 成功！批次更新了 ${updatedDocsCount} 份文件。`);
  } else {
    console.log('\n✅ 資料已是最新，無需更新。');
  }
  
  // Node.js 腳本需要手動結束
  process.exit(0);
}

// 執行遷移
migratePlayerIds().catch(error => {
  console.error('❌ 遷移過程中發生錯誤:', error);
  process.exit(1);
});
