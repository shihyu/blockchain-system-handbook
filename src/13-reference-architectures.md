# 13. 參考架構藍圖

## 13.1 消費級 DApp

```text
Frontend (Web/Mobile)
   |
Backend API --- Cache/DB
   |
Tx Service --- Simulation --- Risk Rules
   |
Wallet Adapter (EOA/AA)
   |
RPC Pool -> L2 (main) + L1 (settlement)
```

特性:
- 成本優先，主要跑 L2
- 小額交易可用 account abstraction 改善 UX
- 後台做 nonce/gas/重試策略

## 13.2 機構級資產系統

```text
Client Portal
   |
Workflow Engine (approval)
   |
Treasury Service ---- Accounting Core
   |
MPC/Multisig Cluster ---- HSM
   |
Policy Engine (limit/timelock/allowlist)
   |
Execution Gateway -> Multi-chain Nodes
   |
Monitoring/SIEM + Incident Center
```

特性:
- 安全優先，多簽 + MPC + 冷熱分層
- 完整稽核追蹤與法遵資料
- 強調災難復原演練

## 13.3 DAO 治理架構
- Gov Token + Delegate
- Proposal + Timelock + Execution
- Treasury Multisig 作為過渡控制
- 漸進去中心化路線圖

## 白話說明
小團隊先求可用，機構先求可控，DAO 先求共識。三者的工程重點不同，不可混用。
