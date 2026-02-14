# 7. 智能合約執行模型

## 7.1 合約生命週期

智能合約的生命週期可以類比為傳統軟體工程中的 SDLC（Software Development Life Cycle），但有一個根本性差異：**合約一旦部署上鏈，其程式碼就是不可變的**（除非使用 Proxy 升級模式）。這意味著每一個階段都必須比傳統開發更加謹慎，因為修復錯誤的成本極高——不僅是技術成本，更可能涉及真金白銀的損失。

### 設計階段

設計階段是整個生命週期中最關鍵的環節。工程師需要明確定義以下三個核心要素：

- **規格（Specification）**：合約要解決什麼問題？接受哪些輸入？產出哪些狀態變更？建議使用 NatSpec 格式撰寫函式規格，讓文件與程式碼緊密結合。
- **狀態機（State Machine）**：合約中的狀態轉換必須明確建模。例如一個眾籌合約可能有 `Funding -> GoalReached -> Withdrawn` 或 `Funding -> Failed -> Refunded` 兩條路徑，每個狀態轉換都必須定義清楚的觸發條件與前置檢查。
- **權限模型（Access Control）**：誰能呼叫哪些函式？使用 Role-Based Access Control（RBAC）還是簡單的 `onlyOwner`？權限模型的設計直接決定了合約的安全邊界。

```text
合約狀態機範例（簡化的眾籌合約）：

    ┌──────────┐   達標    ┌──────────────┐   owner提款   ┌────────────┐
    │ Funding  │─────────>│ GoalReached  │────────────>│ Withdrawn  │
    └──────────┘          └──────────────┘             └────────────┘
         │
         │ 超時未達標
         v
    ┌──────────┐   用戶退款  ┌────────────┐
    │  Failed  │──────────>│  Refunded  │
    └──────────┘           └────────────┘
```

### 開發階段

開發階段遵循 TDD 原則，測試策略分為三個層次：

- **單元測試（Unit Test）**：針對每個函式的邏輯正確性。使用 Foundry 的 `forge test` 或 Hardhat 的測試框架，覆蓋率應達 95% 以上。重點測試邊界條件，例如 `uint256` 的溢位、零地址輸入、空陣列等。
- **Fuzz Testing**：讓測試框架隨機產生輸入值，嘗試找出人類測試者不會想到的邊界條件。Foundry 原生支援 fuzz testing，只需在測試函式的參數中加入變數即可。一般建議至少跑 10,000 輪 fuzz。
- **Invariant Testing**：定義系統中「永遠不應被違反」的不變量。例如「Vault 合約的總餘額永遠等於所有用戶存款之和」。Invariant testing 會在隨機操作序列後檢查這些不變量是否仍然成立。

```solidity
// Foundry Fuzz Test 範例
function testFuzz_deposit(uint256 amount) public {
    // 限制輸入範圍
    amount = bound(amount, 1, type(uint128).max);

    token.mint(user, amount);
    vm.prank(user);
    token.approve(address(vault), amount);

    vm.prank(user);
    vault.deposit(amount);

    // 不變量：用戶存款後餘額正確
    assertEq(vault.balanceOf(user), amount);
    assertEq(token.balanceOf(address(vault)), amount);
}
```

### 審計階段

審計是部署前的最後防線，通常結合三種方法：

- **靜態分析（Static Analysis）**：使用工具如 Slither、Mythril 自動掃描常見漏洞模式。靜態分析能快速發現 reentrancy、未檢查的外部呼叫回傳值等問題，但容易產生 false positive。
- **動態分析（Dynamic Analysis）**：實際執行合約並監控行為，包含 symbolic execution（符號執行）。工具如 Echidna（基於 property-based testing）能發現靜態分析無法觸及的路徑問題。
- **人工審計（Manual Audit）**：由經驗豐富的安全研究員逐行檢視程式碼。重點關注業務邏輯的正確性、經濟模型的可操縱性、以及各模組間的交互風險。一份完整的人工審計通常需要 2-4 週。

**最佳實踐**：在審計前先跑完靜態分析並修復所有 high/medium 級別的問題，讓人工審計師能專注在更深層的邏輯問題上。

### 部署階段

部署不僅僅是把合約放上鏈，更重要的是環境管理與權限配置：

- **分環境部署**：Testnet（Sepolia/Goerli）→ Staging（Mainnet fork）→ Mainnet。每個環境都要跑完整測試套件。使用 Foundry 的 `forge script` 搭配 `--fork-url` 可以在 mainnet fork 上模擬真實部署。
- **權限最小化**：部署完成後立即將 owner 轉移到 multisig，而非留在部署者的 EOA。初始化函式只能呼叫一次，必須加上 `initializer` modifier。
- **驗證合約原始碼**：在 Etherscan 上驗證原始碼，讓社群能審查已部署的程式碼與審計報告是否一致。

### 維運階段

合約上鏈後的維運工作同樣關鍵：

- **升級治理**：如果使用 Proxy 模式，升級流程必須經過 Timelock（通常 24-48 小時延遲）和多簽核准。社群應有足夠時間審視升級內容。
- **監控（Monitoring）**：使用 Tenderly、Forta 或自建監控系統，追蹤異常交易模式。例如：大額轉帳、短時間內大量清算、合約餘額驟降等。
- **應急處理（Incident Response）**：預先定義 `pause()` 機制和緊急撤資路徑。建議維護一份 War Room Playbook，明確列出各種緊急情境的處理步驟和負責人。

```text
維運監控架構：

┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  On-chain   │────>│  Event       │────>│  Alert      │
│  Contract   │     │  Indexer     │     │  System     │
└─────────────┘     └──────────────┘     └─────────────┘
                          │                     │
                          v                     v
                    ┌──────────────┐     ┌─────────────┐
                    │  Dashboard   │     │  PagerDuty  │
                    │  (Grafana)   │     │  / Slack    │
                    └──────────────┘     └─────────────┘
```

## 7.2 常見架構

智能合約的架構設計直接影響可維護性、升級彈性和安全性。選擇架構時需要權衡複雜度與靈活性。

### Monolith（單體合約）

最簡單的架構模式，所有邏輯集中在一個合約中。適用於功能單純、不需要升級的場景，例如一次性的 Token Sale 合約或簡單的 NFT Mint 合約。

**優點**：
- 部署簡單，gas 成本低（只需部署一個合約）
- 程式碼易於理解，審計成本低
- 沒有跨合約呼叫的複雜性

**缺點**：
- 一旦部署無法修改任何邏輯
- 合約大小受限於 EIP-170 的 24KB 限制
- 功能耦合度高，難以復用

**適用場景**：Token 合約（ERC-20/721）、簡單的 Escrow、一次性活動合約。

### Modular（模組化架構）

將合約拆分為多個獨立模組，透過 Router（路由器）統一入口，Vault（金庫）管理資金，Library（函式庫）提供共用邏輯。這是中大型 DeFi 協議最常見的架構。

```text
模組化架構圖：

                    ┌──────────────────┐
                    │     Router       │
                    │  (Entry Point)   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              v              v              v
       ┌────────────┐ ┌───────────┐ ┌────────────┐
       │   Module A  │ │  Module B │ │  Module C  │
       │  (Trading)  │ │ (Lending) │ │ (Staking)  │
       └──────┬─────┘ └─────┬─────┘ └──────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                      ┌──────v──────┐
                      │    Vault    │
                      │  (Treasury) │
                      └──────┬──────┘
                             │
                      ┌──────v──────┐
                      │   Library   │
                      │  (Math/    │
                      │   Utils)    │
                      └─────────────┘
```

**真實案例**：Uniswap V4 使用 Singleton 模式將所有流動性池集中在一個合約中，但透過 Hooks 機制實現模組化的自定義邏輯。GMX V2 則使用 Router + DataStore + Handler 的模組化設計，將資料儲存、業務邏輯和入口路由完全分離。

### Proxy Upgrade（代理升級模式）

透過將「狀態儲存」和「邏輯執行」分離，實現合約可升級性。使用者始終與 Proxy 合約互動，Proxy 透過 `delegatecall` 將呼叫轉發到 Implementation（實作合約）。

三種主要的 Proxy 模式：

| 模式 | 升級邏輯位置 | 優點 | 缺點 |
|------|------------|------|------|
| **Transparent Proxy** | Proxy 合約 | 明確分離 admin/user 呼叫 | Gas 稍高（每次檢查 caller） |
| **UUPS** | Implementation 合約 | Gas 更低、更靈活 | 如果忘記在新版本保留升級函式則永久鎖死 |
| **Beacon Proxy** | Beacon 合約 | 多個 Proxy 共享一個 Implementation | 增加一層間接層 |

```solidity
// UUPS Proxy 升級流程虛擬碼
contract MyContractV1 is UUPSUpgradeable {
    uint256 public value;

    function initialize(uint256 _value) public initializer {
        value = _value;
    }

    // 注意：如果 V2 忘記實作這個函式，合約將永遠無法再升級
    function _authorizeUpgrade(address newImpl) internal override onlyOwner {}
}

contract MyContractV2 is UUPSUpgradeable {
    uint256 public value;
    uint256 public newFeature;  // 只能新增 storage variable，不能修改既有的

    function _authorizeUpgrade(address newImpl) internal override onlyOwner {}
}
```

**常見陷阱**：在升級時改變既有 storage variable 的順序或型別會導致 storage collision，這是最危險的 Proxy 相關漏洞之一。務必使用 OpenZeppelin 的 `@openzeppelin/upgrades` 套件來自動檢測 storage layout 衝突。

## 7.3 重要安全議題

智能合約的安全問題可以粗略分為「程式碼層面」和「設計層面」兩類。以下列出最常見且損失最慘重的五大安全議題。

### Reentrancy（重入攻擊）

Reentrancy 是智能合約安全史上最具代表性的漏洞，2016 年的 The DAO 事件因此損失約 360 萬 ETH（當時價值約 6,000 萬美元）。攻擊原理是在合約將資金轉出後、但尚未更新狀態變數之前，攻擊者透過 fallback function 再次呼叫提款函式。

```solidity
// ❌ 有漏洞的寫法
function withdraw(uint256 amount) external {
    require(balances[msg.sender] >= amount);
    (bool ok, ) = msg.sender.call{value: amount}("");  // 1. 先轉帳
    require(ok);
    balances[msg.sender] -= amount;  // 2. 才更新狀態 → 攻擊者可在步驟1重入
}

// ✅ 安全的寫法（Checks-Effects-Interactions 模式）
function withdraw(uint256 amount) external nonReentrant {
    require(balances[msg.sender] >= amount);  // Check
    balances[msg.sender] -= amount;           // Effect（先更新狀態）
    (bool ok, ) = msg.sender.call{value: amount}("");  // Interaction（最後才外部互動）
    require(ok);
}
```

**防禦策略**：
1. 遵循 CEI（Checks-Effects-Interactions）模式
2. 使用 OpenZeppelin 的 `ReentrancyGuard`（`nonReentrant` modifier）
3. 在跨合約呼叫時特別注意 read-only reentrancy（攻擊者重入的是另一個合約的 view function，讀到過時的狀態）

### Access Control 錯配

權限控制的錯誤配置是最常見的漏洞類型之一。常見情境包括：忘記給關鍵函式加上權限修飾器、`initialize()` 函式沒有加上 `initializer` modifier 導致任何人可以重新初始化、以及權限轉移過程中的空窗期。

**真實案例**：2022 年 Wintermute 事件中，某合約的 `initialize()` 函式在部署後未被呼叫，攻擊者搶先呼叫並將自己設為 owner，盜走了 1.6 億美元。

**最佳實踐**：使用 OpenZeppelin 的 `AccessControl` 而非手寫 `onlyOwner`。為每個敏感操作定義明確的 role（例如 `MINTER_ROLE`、`PAUSER_ROLE`、`UPGRADER_ROLE`），並在部署腳本中驗證所有 role 的分配。

### Delegatecall 汙染

`delegatecall` 是 Proxy 模式的核心機制，它讓被呼叫合約的程式碼在呼叫者的 storage context 中執行。如果被 delegatecall 的目標合約被惡意替換，或目標合約本身有寫入 storage 的行為，就會汙染 Proxy 合約的狀態。

```text
Delegatecall 執行模型：

Proxy Contract (Storage)          Implementation Contract (Logic)
┌──────────────────────┐          ┌──────────────────────┐
│ slot 0: owner        │  ←───── │ slot 0: owner        │
│ slot 1: balance      │  ←───── │ slot 1: balance      │
│ slot 2: impl address │         │                      │
└──────────────────────┘          └──────────────────────┘
        ↑                                  ↑
        │ storage 存在 Proxy                │ 邏輯定義在 Implementation
        │ 但 delegatecall 讓               │ 但在 Proxy 的 context 執行
        │ Implementation 的程式碼            │
        │ 操作 Proxy 的 storage             │
```

**防禦策略**：Implementation 合約的 constructor 中呼叫 `_disableInitializers()` 防止直接初始化。確保 Proxy 和 Implementation 的 storage layout 完全一致。

### Storage Slot 衝突（升級相關）

在合約升級時，新版本的 Implementation 合約必須保持與舊版本完全相同的 storage layout。如果在已有的 storage variable 之間插入新變數，或改變變數型別，將導致資料讀取錯位。

```solidity
// V1
contract MyContractV1 {
    uint256 public totalSupply;    // slot 0
    address public owner;          // slot 1
}

// ❌ 錯誤的 V2（插入新變數到中間）
contract MyContractV2 {
    uint256 public totalSupply;    // slot 0
    uint256 public newVariable;    // slot 1 ← 衝突！原本 owner 在這裡
    address public owner;          // slot 2 ← 讀到的是垃圾資料
}

// ✅ 正確的 V2（只在最後新增）
contract MyContractV2 {
    uint256 public totalSupply;    // slot 0
    address public owner;          // slot 1（保持不變）
    uint256 public newVariable;    // slot 2（新增在最後）
}
```

**最佳實踐**：使用 OpenZeppelin 的 `forge inspect` 或 `hardhat-upgrades` 的 storage layout 比對功能，在升級前自動檢測衝突。考慮使用 EIP-7201（Namespaced Storage Layout）來避免 storage collision。

### Oracle 操縱

DeFi 協議高度依賴 Oracle（預言機）提供鏈外資料（價格、利率等）。如果 Oracle 回傳的價格可以被操縱，攻擊者就能以不合理的價格執行交易、清算或鑄造資產。

**常見攻擊手法**：
- **閃電貸操縱 AMM 價格**：攻擊者用閃電貸大量買入某 Token，推高 AMM 的即時價格，利用被操縱的價格在借貸協議中超額借貸，然後歸還閃電貸。
- **TWAP Oracle 延遲利用**：Time-Weighted Average Price 雖然比即時價格更難操縱，但在市場劇烈波動時會有延遲，攻擊者可以利用這個價差。

**防禦策略**：使用 Chainlink 等去中心化 Oracle 網路、設定價格偏差閾值（例如單一區塊內價格變化超過 10% 則拒絕交易）、結合多個 Oracle 來源做交叉驗證。

## 7.4 執行流程圖

理解智能合約的執行流程對於除錯和安全分析至關重要。以下是一筆典型的合約呼叫從進入到完成的完整流程：

```text
                         External Call (tx or internal call)
                                    │
                                    v
                        ┌───────────────────────┐
                        │   Receive ETH?         │
                        │   (msg.value > 0 &&    │
                        │    no calldata)         │
                        └───────┬────────┬───────┘
                           Yes  │        │  No
                                v        v
                        ┌──────────┐  ┌──────────────────────┐
                        │ receive()│  │ Function Selector     │
                        │ /fallback│  │ (first 4 bytes of     │
                        └──────────┘  │  keccak256(signature))│
                                      └──────────┬───────────┘
                                                  │
                                                  v
                                      ┌──────────────────────┐
                                      │ Modifier Chain       │
                                      │ (onlyOwner,          │
                                      │  nonReentrant,       │
                                      │  whenNotPaused...)   │
                                      └──────────┬───────────┘
                                                  │
                                                  v
                                      ┌──────────────────────┐
                                      │ Business Logic       │
                                      │ (require checks,     │
                                      │  state mutations,    │
                                      │  calculations)       │
                                      └──────────┬───────────┘
                                                  │
                              ┌────────────────────┼────────────────────┐
                              │                    │                    │
                              v                    v                    v
                    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                    │ State Write  │    │ External     │    │ Event Emit   │
                    │ (SSTORE)     │    │ Interaction  │    │ (LOG0-LOG4)  │
                    │              │    │ (CALL/       │    │              │
                    │ 每個 slot    │    │  DELEGATECALL│    │ 用於鏈下     │
                    │ 首次寫入     │    │  /STATICCALL)│    │ indexing     │
                    │ 20,000 gas   │    │              │    │              │
                    └──────────────┘    └──────────────┘    └──────────────┘
```

### Gas 成本剖析

理解 EVM 的 gas 成本模型對於撰寫高效合約至關重要：

| 操作 | Gas 成本 | 說明 |
|------|---------|------|
| SLOAD（讀 storage） | 2,100（cold） / 100（warm） | EIP-2929 引入 cold/warm 概念 |
| SSTORE（寫 storage） | 20,000（新 slot） / 5,000（更新） | 最昂貴的操作之一 |
| CALL（外部呼叫） | 2,600（cold） | 加上被呼叫合約的 gas 消耗 |
| LOG（事件） | 375 + 375 * topics + 8 * bytes | Topic 數量和資料長度影響成本 |
| Memory 擴展 | 二次方增長 | 超過一定大小後 gas 急劇增加 |

**Gas 優化技巧**：
- 將多個 `bool` 變數 pack 進同一個 `uint256` storage slot
- 使用 `calldata` 而非 `memory` 作為外部函式的陣列參數
- 將常用的 storage 讀取結果快取到 memory 變數中

## 7.5 最小權限設計

最小權限原則（Principle of Least Privilege）是合約安全設計的基石。在區塊鏈上，權限過度集中不僅是安全風險，更是信任風險——如果一個 EOA 擁有無限權力，那麼所有用戶的資金安全取決於一把私鑰的安全。

### Owner 不直接掌資金

`owner` 角色應只負責協議治理（參數調整、升級等），而非資金管理。資金應由獨立的 Treasury Multisig 控制。這樣即使 owner 私鑰洩露，攻擊者也無法直接提走資金。

```text
權限分離架構：

┌────────────────────────────────────────────────────────┐
│                    Protocol Governance                   │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │ Owner Role   │    │ Treasury     │    │ Emergency  │ │
│  │ (Multisig A) │    │ (Multisig B) │    │ (Multisig C│ │
│  ├──────────────┤    ├──────────────┤    ├────────────┤ │
│  │ - 參數調整   │    │ - 資金轉移   │    │ - pause()  │ │
│  │ - 合約升級   │    │ - 預算分配   │    │ - 緊急提款 │ │
│  │ - 角色管理   │    │ - 薪資發放   │    │            │ │
│  └──────┬───────┘    └──────────────┘    └────────────┘ │
│         │                                                │
│         v                                                │
│  ┌──────────────┐                                        │
│  │  Timelock    │  24-48 小時延遲                         │
│  │  Contract    │  讓社群有時間審查                        │
│  └──────────────┘                                        │
└────────────────────────────────────────────────────────┘
```

### 管理操作進 Timelock

所有重大管理操作（參數調整、升級、新增白名單等）都應通過 Timelock 合約。Timelock 引入強制延遲（通常 24-48 小時），在延遲期間社群可以審查即將執行的操作，必要時可以取消。

**典型流程**：
1. Multisig 提交操作提案到 Timelock
2. Timelock 排入佇列，啟動倒計時（例如 48 小時）
3. 社群透過 on-chain event 看到提案內容
4. 倒計時結束後，任何人都可以執行（execute）該操作
5. 如果社群發現問題，Multisig 可以在執行前取消

### pause 與 unpause 分離角色

緊急暫停機制是應對 0-day 漏洞的最後防線。關鍵設計原則是：**pause 操作應該門檻低（快速反應），但 unpause 操作應該門檻高（確認安全後才恢復）**。

```solidity
// 權限分離範例
bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

// PAUSER_ROLE: 可以是單一可信的 EOA（快速反應）
// UNPAUSER_ROLE: 必須是 Multisig + Timelock（確保安全後才恢復）

function pause() external onlyRole(PAUSER_ROLE) {
    _pause();
}

function unpause() external onlyRole(UNPAUSER_ROLE) {
    _unpause();
}
```

**真實案例**：2022 年 Nomad Bridge 被攻擊時，由於缺乏有效的暫停機制，攻擊在數小時內被多人複製，最終損失約 1.9 億美元。如果有快速暫停機制，損失可以大幅減少。

### 其他最小權限設計建議

- **函式可見性最小化**：能用 `private` 就不用 `internal`，能用 `internal` 就不用 `public`。不需要被外部呼叫的函式絕對不要設為 `external` 或 `public`。
- **Approve 限額控制**：合約與外部協議互動時，只 approve 當次操作所需的金額，操作完成後立即將 allowance 設回 0。避免無限 approve（`type(uint256).max`）造成的潛在風險。
- **角色過期機制**：考慮為某些臨時性角色設定過期時間，例如部署初期的 `MINTER_ROLE` 在 7 天後自動失效。

## 白話總結

智能合約可以想像成一台自動販賣機——一旦放到街上（部署上鏈），你就不能輕易打開它的外殼來修改內部電路了。所以在設計和製造階段，你必須把所有可能的情況都想清楚：如果有人塞假幣怎麼辦？如果有人同時按兩個按鈕怎麼辦？如果停電了（鏈暫停了）怎麼辦？

合約的架構設計就像蓋房子，簡單的需求（一間工具間）用 Monolith 就好，複雜的需求（一棟商業大樓）就需要模組化設計，而如果你預期未來需要改建或擴建，就要用 Proxy 模式預留彈性。但 Proxy 模式也帶來額外的複雜度和風險，特別是 storage layout 衝突的問題，所以不是所有合約都適合用 Proxy。

安全方面，重入攻擊（Reentrancy）是最經典的問題，它的本質就是「在你還沒記帳之前就讓你再付一次錢」。解法很簡單：先記帳再付錢。但現實中的安全問題往往更微妙，比如 Oracle 操縱就像是有人偷改了商品的標價牌，然後以錯誤的價格購買。

權限管理的核心思想是「不要把所有鑰匙交給同一個人」。資金管理用一把鑰匙（Treasury Multisig），參數調整用另一把（Owner Multisig），緊急暫停用第三把（Pauser）。這樣即使某一把鑰匙被偷，損害也會被限制在最小範圍內。

最後，監控和應急機制就像是大樓的消防系統——你希望永遠用不到它，但絕對不能沒有。一個好的合約系統應該能在發現異常的第一時間暫停運作，等待人類判斷和修復，而不是讓攻擊者有幾個小時的時間慢慢搬空資金。
