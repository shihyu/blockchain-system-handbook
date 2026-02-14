# 11. 攻擊面、事故型態與防禦

## 11.1 攻擊面總覽
- 私鑰與簽名端
- 合約程式邏輯
- 預言機與外部資料
- 前端供應鏈
- RPC/節點基礎設施
- 跨鏈橋與治理權限

## 11.2 典型事故分類
- Key compromise
- Contract exploit
- Oracle manipulation
- Governance attack
- Bridge validator compromise

## 11.3 防禦分層

```text
Layer 1: Prevent   -> 最小權限、審計、MPC/Multisig
Layer 2: Detect    -> 監控、異常告警、MEV/價格偏差監測
Layer 3: Respond   -> Pause、限額、黑白名單、應急流程
Layer 4: Recover   -> 財務對帳、法務流程、用戶補償策略
```

## 11.4 合約安全測試矩陣
- Unit test
- Invariant test
- Fuzz test
- Symbolic execution
- Mainnet fork simulation

## 11.5 營運安全
- 簽名設備不連網通用主機
- 交易前模擬與結果比對
- 變更窗口與雙人覆核
- 所有高風險操作強制審批單號

## 白話說明
安全不是審一次 code 就結束，而是整個開發到營運流程都要可驗證、可追責。
