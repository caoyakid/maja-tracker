import { initializeApp } from 'firebase/app';
import { db } from './firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// 複製 App.jsx 中的預設玩家列表
const INITIAL_PRESETS = [
  "JK", "Mochi", "Ryan", "阿傑", "Alan",
  "道道", "嚕卡", "柏鈞", "JS", "萌萌噠"
];

/**
 * 將預設的固定班底植入 Firestore 的 'presets' 集合。
 * 這是一個一次性的操作，用來初始化玩家數據庫。
 * 我們使用玩家名字的小寫作為文件 ID，以確保唯一性和可預測性。
 */
export const seedInitialPresets = async () => {
  console.log('🚀 開始植入預設固定班底...');

  const presetPromises = INITIAL_PRESETS.map(async (playerName) => {
    const playerId = playerName.toLowerCase(); // 使用小寫名字作為 ID
    const playerRef = doc(db, 'presets', playerId);

    await setDoc(playerRef, {
      name: playerName,
      createdAt: serverTimestamp()
    });
    console.log(`✅ 玩家 "${playerName}" (ID: ${playerId}) 已新增或更新。`);
  });

  await Promise.all(presetPromises);
  console.log('\n🎉 所有預設固定班底已成功植入 Firestore！');
};