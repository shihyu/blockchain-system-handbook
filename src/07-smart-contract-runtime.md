# 7. 智能合約執行模型

## 7.1 合約生命週期
- 設計: 規格、狀態機、權限模型
- 開發: 單元測試、fuzz、invariant
- 審計: 靜態/動態/人工
- 部署: 分環境、權限最小化
- 維運: 升級治理、監控、應急

## 7.2 常見架構
- Monolith: 單合約簡單快速
- Modular: Router + Vault + Library
- Proxy Upgrade: UUPS/Transparent/Beacon

## 7.3 重要安全議題
- Reentrancy
- Access control 錯配
- Delegatecall 汙染
- Storage slot 衝突（升級）
- Oracle 操縱

## 7.4 執行流程圖

```text
External Call
   |
   v
Function Selector -> Modifier Check -> Business Logic
   |                                      |
   |                                      +-> External Interaction
   |                                      |
   +-> State Read/Write <-----------------+
                |
                v
              Event Log
```

## 7.5 最小權限設計
- `owner` 不直接掌資金，改由 Treasury Multisig
- 管理操作進 Timelock
- `pause` 與 `unpause` 分離角色

## 白話說明
合約一上鏈就很難改，請把它當成「不可熱修」的核心交易引擎。
