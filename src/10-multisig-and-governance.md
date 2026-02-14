# 10. 多簽、金庫與治理結構

## 10.1 多簽核心
多簽（M-of-N）是把單一簽名權分散成多個獨立持有人，降低單點失陷風險。

## 10.2 典型金庫分層
- L0 Root Treasury: 冷層，3/5 或 4/7，高延遲、高安全
- L1 Ops Treasury: 日常營運，2/3 或 3/5
- L2 Hot Wallet: 小額快速支付，1/1 + 低額度

## 10.3 權限分離
- 提案者（Proposer）
- 審核者（Reviewer）
- 執行者（Executor）
- 監督者（Auditor/Observer）

## 10.4 推薦控制項
- Timelock（例如 12h/24h/48h）
- Spend Limit（每日/每週上限）
- Function Allowlist（僅允許特定 selector）
- 目的地址 Allowlist
- 緊急暫停（Pause Guardian）

## 10.5 多簽交易流程

```text
Proposal Created
   |
   v
Policy Check (limit, allowlist, risk score)
   |
   v
Signatures Collected (M of N)
   |
   v
Timelock Queue
   |
   v
Execute On-chain
   |
   v
Post-check + Accounting + Alert
```

## 10.6 治理模型
- Multisig Governance: 快速、適合早期
- Token Governance: 社群參與高，但易受鯨魚影響
- Hybrid: 日常多簽 + 重大事項投票 + Timelock

## 10.7 事故回應設計
- Break-glass Multisig（緊急組）
- Pause 不等於升級，避免濫權
- 事故後必須公開 postmortem 與權限調整

## 10.8 多簽常見失敗模式
- 簽名人實際由同一組織控制（名義分散）
- 硬體設備集中保管
- 簽名流程不看 calldata（盲簽）
- 無備援 signer，關鍵人離線導致停擺

## 10.9 企業實務模板
- 交易分級:
  - P0（緊急止血）: 快速路徑 + 事後審計
  - P1（大額）: 4/7 + 48h timelock
  - P2（日常）: 2/3 + 12h timelock
- 定期輪替:
  - 每季輪替 signer 裝置
  - 每半年演練私鑰失陷與簽名人失聯

## 白話說明
多簽不是「多幾個人按同意」而已，而是把公司內控流程變成可驗證、可追溯的上鏈簽核系統。
