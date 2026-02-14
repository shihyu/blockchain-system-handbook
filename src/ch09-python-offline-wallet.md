# 第9章 Python語言離線錢包開發

本章目標是做出安全可用的離線錢包方案：私鑰隔離、交易可驗證、查詢可追蹤。

## 9.1 區塊鏈錢包原理 `P0`

### 9.1.1 區塊鏈錢包的核心原理 `P0`
錢包本質：
- 管理私鑰與地址
- 對交易做簽名
- 提供查詢與廣播流程

不是功能：
- 鏈上資產保管（資產在鏈上）

```text
Intent -> Build Tx -> Offline Sign -> Online Broadcast -> Track Status
```

### 9.1.2 助記詞如何產生與驗證 `P0`
建議採用：
- BIP-39 助記詞
- BIP-32/44 派生路徑

安全要點：
- 助記詞離線保存
- passphrase 與助記詞分開保管
- 驗證 checksum

### 9.1.3 如何儲存私鑰 `P0`
推薦做法：
- keystore 加密（口令 + KDF）
- 硬體錢包或 HSM
- 交易簽名與網路隔離

禁忌：
- 私鑰明文存檔
- 私鑰進日誌
- 未授權備份

## 9.2 區塊鏈錢包核心功能實現 `P0`

### 9.2.1 錢包如何支援Coin轉移 `P0`
UTXO 鏈：
- 選 UTXO
- 建 inputs/outputs
- 離線簽名
- 上線廣播

Account 鏈：
- 查 nonce/gas
- 建交易
- 離線簽名
- 上線廣播

### 9.2.2 錢包如何支援Coin查詢 `P0`
查詢來源：
- 節點 RPC
- 索引服務

查詢類型：
- 可用餘額
- 已確認餘額
- 交易歷史

### 9.2.3 ERC-20標準實現與部署 `P0`
核心：
- 實作標準函數與事件
- 部署後驗證合約
- 配置 token metadata

部署注意：
- decimals 一次定義
- mint 權限治理（多簽/時鎖）

### 9.2.4 錢包如何支援Token轉移 `P0`
流程：
1. 載入 ABI
2. `transfer(to, amount)` 打包 data
3. 建交易並簽名
4. 發送交易並追 receipt

### 9.2.5 錢包如何支援Token查詢 `P0`
必要查詢：
- `balanceOf`
- `allowance`
- Token 清單與價格映射（可選）

工程要點：
- 多鏈多 token 用統一主鍵管理
- 對 decimals/symbol 做快取

### 9.2.6 事件訂閱 `P0`
用途：
- 實時更新交易狀態
- 觸發通知與風控
- 事後審計

訂閱策略：
- websocket 實時訂閱
- 定時補塊避免漏事件
- 重組時回滾本地狀態

## Python 工程實作骨架

```python
from web3 import Web3

w3 = Web3(Web3.HTTPProvider(RPC_URL))
acct = w3.eth.account.from_key(PRIVATE_KEY)

tx = {
    "to": to_addr,
    "value": amount_wei,
    "nonce": w3.eth.get_transaction_count(acct.address),
    "gas": 21000,
    "maxFeePerGas": w3.to_wei("30", "gwei"),
    "maxPriorityFeePerGas": w3.to_wei("2", "gwei"),
    "chainId": chain_id,
}

signed = acct.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
```

## 常見坑與修正
- nonce 衝突：引入 nonce manager
- gas 估算偏低：加安全係數 + 模擬
- 盲簽風險：簽名前展示可讀交易摘要
- 事件漏單：補塊掃描 + 去重存儲

## 本章總結
離線錢包不是功能集合，而是安全流程：
- 密鑰隔離
- 簽名可信
- 交易可追
- 事故可回應
