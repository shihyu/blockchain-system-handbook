# 12. 監控、SRE 與工程交付

## 12.1 可觀測性指標
- 鏈高度差（本地 vs 參考）
- RPC 成功率與延遲分位數
- 交易狀態轉換耗時
- 失敗率（revert/drop/replaced）
- 錢包餘額與授權變化

## 12.2 告警分級
- P0: 資金異常、私鑰疑似外洩、跨鏈異常大額
- P1: 交易卡 pending、節點脫節、預言機偏差
- P2: 延遲上升、索引落後

## 12.3 發版流程
1. 測試網部署與回歸
2. Mainnet fork 模擬
3. 審批與變更窗口
4. 小流量灰度
5. 全量啟用
6. 觀察期與回滾預案

## 12.4 Runbook 基本模板
- 觸發條件
- 立即止血動作
- 升級路徑
- 回復步驟
- 對外溝通與法遵

## 12.5 事件追蹤資料
- tx hash / block number
- signer id / policy id
- simulation result hash
- before/after balance snapshot

## 白話說明
Web3 SRE 的核心不是「伺服器活著」，而是「資產與狀態轉移可控、可追蹤、可回應」。
