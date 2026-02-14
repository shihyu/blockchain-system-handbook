# 5. 錢包、金鑰與簽名流程

## 5.1 錢包類型
- EOA: 單私鑰控制，簡單但單點風險高
- Smart Contract Wallet (AA): 規則可程式化
- MPC Wallet: 私鑰分片，不在單點重建
- Hardware Wallet: 實體隔離簽名

## 5.2 金鑰管理層級
- 熱錢包: 線上簽名，小額快取
- 溫錢包: 半自動簽核，中額調度
- 冷錢包: 離線簽名，大額保管

## 5.3 簽名流程

```text
User Intent
   |
   v
Policy Engine --(額度/名單/時間窗)-> Allow?
   |
   v
Tx Builder -> Simulation -> Risk Check
   |
   v
Signer (EOA/MPC/Multisig)
   |
   v
Broadcast -> Mempool -> Block -> Finality
```

## 5.4 常見錯誤
- 未綁 chain id 導致 replay 風險
- 盲簽（blind signing）未驗證 calldata
- 權限分離不足，營運帳號可直接簽資金交易

## 5.5 防護實務
- EIP-712 typed data
- 簽名前可視化解碼與模擬
- 資金動作必須多簽 + 延遲 + 監控

## 白話說明
錢包不是 UI，而是你的「簽章控制系統」。私鑰一旦失守，鏈上資產通常不可逆追回。
