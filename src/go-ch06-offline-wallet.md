# 第6章 Go 語言離線錢包開發

本章目標是做出「簽名在離線端、查詢在在線端」的實務錢包架構。

## 6.1 區塊鏈錢包原理

### 6.1.1 區塊鏈錢包的核心原理 `P0`

錢包不是資產保險箱，而是：
- 金鑰管理器
- 簽名器
- 地址與交易組裝工具

核心分層：

```text
Key Management -> Tx Builder -> Signer -> Broadcaster -> Index/Query
```

設計原則：
- 私鑰永不出簽名邊界
- 查詢與簽名分離
- 所有交易可重現與可審計

### 6.1.2 助記詞如何生成與驗證 `P0`

建議標準：
- BIP-39（助記詞）
- BIP-32（HD 主私鑰）
- BIP-44（路徑規範）

流程：
1. 生成熵
2. 轉助記詞
3. 助記詞 + passphrase 推導 seed
4. seed 推導主私鑰與子私鑰

常見坑：
- 未檢查 checksum
- passphrase 遺失造成資產永久不可恢復

### 6.1.3 如何存儲私鑰 `P0`

推薦做法：
- 私鑰 at-rest 加密（如 AES-GCM）
- KDF（Argon2/scrypt）保護口令
- 記憶體中使用後清理
- 備份採多地分片或硬體介質

禁止做法：
- 私鑰明文寫 DB/日誌
- 私鑰透過 HTTP 傳輸
- 把助記詞截圖存聊天工具

## 6.2 區塊鏈錢包核心功能實現

### 6.2.1 flag 使用與開發框架搭建 `P1`

CLI 建議命令：
- `wallet init`
- `wallet addr list`
- `wallet coin transfer`
- `wallet token transfer`
- `wallet tx query`

目錄建議：
- `cmd/`
- `internal/key`
- `internal/tx`
- `internal/rpc`
- `internal/store`

### 6.2.2 錢包如何支持 Coin 轉移 `P0`

UTXO 鏈流程：
1. 查可用 UTXO
2. 選擇輸入與找零
3. 建交易
4. 離線簽名
5. 在線廣播

Account 鏈流程：
1. 查 nonce 與 gas
2. 建交易（to/value/data）
3. 離線簽名
4. 在線廣播

### 6.2.3 錢包如何支持 Coin 查詢 `P0`

兩種方式：
- 直連節點 RPC
- 走索引服務 API

查詢策略：
- 即時餘額（pending + confirmed）
- 可花費餘額（按確認數門檻）

### 6.2.4 ERC-20 標準與實現 `P0`

必懂函數：
- `balanceOf`
- `transfer`
- `approve`
- `transferFrom`
- `allowance`

必懂事件：
- `Transfer`
- `Approval`

工程坑點：
- 小數位 `decimals` 處理錯誤
- `approve` 競態（建議先歸零再設新值）

### 6.2.5 錢包如何支持 token 轉移 `P0`

流程：
1. 載入 token ABI
2. `Pack("transfer", to, amount)`
3. 建合約交易
4. 簽名並送出
5. 根據 receipt 與 event 確認結果

### 6.2.6 錢包如何支持 token 查詢 `P0`

查詢項目：
- token 餘額
- allowance
- 持倉清單

工程建議：
- 緩存 metadata（symbol/decimals）
- 多鏈資產用 `chainId + contract + address` 當主鍵

### 6.2.7 交易明細查詢 `P0`

最小交易明細模型：
- `txHash`
- `from`, `to`
- `value` / `tokenAmount`
- `status`
- `blockNumber`
- `timestamp`
- `fee`

狀態機：

```text
created -> signed -> pending -> confirmed -> finalized
                              -> failed/dropped
```

常見坑：
- 只看 tx 成功，不看 event 是否符合預期
- 發生重組時沒有回滾本地狀態

## 本章總結

離線錢包工程的底線：
- 私鑰隔離
- 交易可驗證
- 狀態可追蹤
- 錯誤可恢復

做到這四點，才算可上線的錢包系統。
