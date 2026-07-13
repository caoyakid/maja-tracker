import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { seedInitialPresets } from './seed.js';

// // --- 執行一次性的植入腳本 ---
// // 執行完畢並確認 Firebase 中有資料後，請註解或刪除此段程式碼
// seedInitialPresets().catch(console.error);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
