# 2. 鏈類型與設計取捨

## 2.1 公鏈類型
- UTXO 鏈: Bitcoin 類，強調可審計、並行花費檢查與簡潔腳本
- EUTXO 鏈: Cardano 類，把資料與腳本條件擴充到 UTXO
- Account 鏈: Ethereum 類，全球狀態 + 智能合約為中心
- 高吞吐並行鏈: Solana/Sui 類，偏向執行效能與低延遲
- 模組化鏈: DA / Execution / Settlement 拆分

## 2.2 常見生態定位
| 類型 | 代表 | 優勢 | 代價 |
|---|---|---|---|
| 安全優先 L1 | Bitcoin, Ethereum | 安全預算高、生態成熟 | 成本與吞吐受限 |
| 高性能 L1 | Solana, Sui, Aptos | 低延遲、低費用 | 節點門檻高、中心化壓力 |
| Rollup L2 | Arbitrum, Optimism, zkSync, Base | 低費用、繼承 L1 安全 | 依賴橋與排序器 |
| AppChain/Subnet | Cosmos, Avalanche 子網 | 客製治理與費率 | 生態與流動性切割 |

## 2.3 UTXO / EUTXO / Account 對照
| 維度 | UTXO | EUTXO | Account |
|---|---|---|---|
| 狀態單位 | 未花費輸出 | 帶資料與腳本條件的輸出 | 全域帳戶狀態 |
| 並行性 | 高（不同 UTXO 可並行） | 高（取決於輸入衝突） | 較受 nonce / shared state 影響 |
| 合約表達力 | 傳統較弱 | 中高（函數式條件） | 高（通用 VM） |
| 開發心智模型 | Cashflow/輸入輸出 | 狀態轉移 + datum/redeemer | 物件/狀態機 |
| 常見風險 | UTXO 管理碎片化 | 腳本與 datum 設計複雜 | reentrancy / global state 競態 |

## 2.4 常見 UTXO 鏈（工程實務視角）
| 鏈 | 模型 | 特點 | 常見用途 |
|---|---|---|---|
| Bitcoin | UTXO | 安全與去中心化優先 | 價值儲存、結算 |
| Litecoin | UTXO | 區塊較快、支付友好 | 小額支付 |
| Dogecoin | UTXO | 社群與支付導向 | 零售/打賞 |
| Bitcoin Cash | UTXO | 大區塊路線 | 低費支付 |
| Dash | UTXO | Masternode 特性 | 支付與治理 |
| Zcash | UTXO + Shielded Pool | 隱私交易能力 | 隱私支付 |
| Monero | UTXO-like (RingCT) | 強匿名性 | 隱私導向 |
| Cardano | EUTXO | 函數式合約模型 | UTXO + 合約應用 |
| Nervos CKB | Cell Model(UTXO 變體) | 可編程 Cell | 基礎資產層/擴展 |
| Kaspa | UTXO + DAG | 高吞吐 PoW 路線 | 高頻轉帳 |

## 2.5 三角取捨

```text
             去中心化
                /\
               /  \
              /    \
             /      \
            /        \
   安全性  /__________\  可擴展性
```

工程上不是選一個點，而是做「可接受風險集合」：
- 資產託管系統偏安全/去中心化
- 交易撮合系統偏可擴展/低延遲
- 跨鏈系統偏向可驗證性與失效安全

## 2.6 選鏈評估矩陣
- 安全: 歷史事故、節點分散、客戶端多樣性
- 成本: 平均/尖峰手續費、橋接成本
- 可用性: RPC 穩定度、重組機率、最終性時間
- 開發: SDK/測試工具/審計供給
- 生態: TVL、流動性深度、協議組合性
- 合規: 地區政策、交易監控與稽核需求

## 2.7 什麼時候選 UTXO
- 以「資產可追蹤、可審計、穩定結算」為核心
- 不需要複雜共享狀態合約
- 對簽核流程與輸入輸出控制要求高

## 白話說明
UTXO 可以把每筆錢想成獨立紙鈔，花錢時要拆紙鈔再找零；
Account 像銀行帳戶，直接改餘額。兩種都能做系統，但工程思維完全不同。
