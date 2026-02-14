# 第7章 Solidity智能合約開發入門

本章目標是建立 Solidity 的可開發能力：能正確建模資料、寫安全函數、理解合約互動界面。

## 7.1 智能合約運作原理與環境搭建 `P0`

### 7.1.1 智能合約的概念 `P0`
智能合約是「部署在鏈上的程式」，特性：
- 可公開驗證
- 狀態可追蹤
- 結果由共識保證

工程重點：一旦部署，修改成本很高，設計需先做風險建模。

### 7.1.2 智能合約的運作機制 `P0`
運作流程：
1. 使用者提交交易
2. 節點執行 EVM 字節碼
3. 產生狀態變更與事件
4. 打包進區塊

```text
Tx -> EVM Execute -> State Change + Event -> Block
```

### 7.1.3 智能合約運作三要素 `P0`
三要素：
- `State`：儲存資料
- `Function`：狀態轉移邏輯
- `Event`：對外通知與索引依據

### 7.1.4 智能合約開發環境搭建 `P0`
建議環境：
- 編譯測試：Foundry/Hardhat
- 本地鏈：Anvil
- 安全庫：OpenZeppelin

最小命令流：
- 編譯
- 測試
- 部署
- 驗證

### 7.1.5 Remix環境簡介 `P1`
Remix 適合：
- 快速驗證語法
- 教學與原型
- 小範例除錯

不適合：
- 團隊協作大專案
- 需要完整 CI/CD 的場景

### 7.1.6 初識Solidity `P0`
第一原則：
- 明確版本（`pragma solidity ^0.8.x`）
- 預設安全（溢位保護、嚴格可見性）
- 儘量用 custom error

## 7.2 Solidity基礎語法 `P0`

### 7.2.1 Solidity基礎資料類型 `P0`
常用型別：
- `uint256`, `int256`
- `bool`
- `address`
- `bytes`, `string`

建議：先用 `uint256`，有明確需求再做壓縮。

### 7.2.2 函數 `P0`
函數屬性：
- 可見性：`public/external/internal/private`
- 狀態屬性：`view/pure/payable`

工程建議：
- 對外函數先驗參
- 寫操作用 custom error

### 7.2.3 修飾符 `P0`
modifier 典型用途：
- 權限控制
- 防重入
- 狀態檢查

### 7.2.4 內建對象 `P1`
常用對象：
- `msg`, `block`, `tx`

注意：避免使用 `tx.origin` 做授權。

### 7.2.5 內建函數 `P1`
常見內建能力：
- `keccak256`
- `abi.encode/encodePacked`
- `ecrecover`

### 7.2.6 事務控制 `P0`
- `require`：輸入與條件檢查
- `revert`：主動回滾
- `assert`：不變量檢查

### 7.2.7 自訂修飾符 `P0`
建議將通用安全檢查抽象成 modifier，避免漏檢。

## 7.3 複合資料型態與資料結構 `P0`

### 7.3.1 自訂結構 `P0`
用 `struct` 建模業務狀態，如帳戶、訂單、提案。

### 7.3.2 數組和動態數組 `P0`
- 固定長度陣列：成本可預期
- 動態陣列：彈性高，需留意 gas

### 7.3.3 映射 `P0`
`mapping` 適合做 key-value 狀態索引。

注意：mapping 不可直接遍歷，常需外部索引或輔助陣列。

### 7.3.4 address類型 `P0`
address 是權限與資產轉移核心型別。

常見操作：
- `address(this)`
- `payable(addr).transfer(...)`

### 7.3.5 memory與storage `P0`
- `storage`：鏈上持久狀態
- `memory`：函數暫存

常見坑：
- 對 storage 引用誤改全局狀態
- 未理解 copy/reference 行為

## 7.4 Solidity物件導向編程 `P0`

### 7.4.1 接口 `P0`
interface 用於描述外部合約函數簽名，支援跨合約調用。

### 7.4.2 函數選擇器與接口ID `P0`
- selector：函數簽名 hash 前 4 bytes
- interface id：常見於 ERC-165 能力探測

### 7.4.3 library `P1`
library 適合抽離通用邏輯，提升重用性。

### 7.4.4 合約繼承 `P0`
繼承可以重用代碼，但要注意線性化與 override 規則。

### 7.4.5 abstract關鍵字 `P1`
abstract contract 用於定義未完整實作的基底規範。

## 本章總結
- 熟悉語法只是起點，關鍵在「狀態建模 + 權限控制 + 錯誤處理」。
- 任何可寫狀態的函數都要先做威脅建模。
