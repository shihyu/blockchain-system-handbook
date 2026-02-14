# 第7章 Solidity智能合約開發入門

本章目標是建立 Solidity 的可開發能力：能正確建模資料、寫安全函數、理解合約互動界面。

## 7.1 智能合約運作原理與環境搭建 `P0`

### 7.1.1 智能合約的概念 `P0`

智能合約是「部署在鏈上的程式」，特性：
- 可公開驗證
- 狀態可追蹤
- 結果由共識保證

工程重點：一旦部署，修改成本很高，設計需先做風險建模。

智能合約（Smart Contract）這個名詞最早由密碼學家 Nick Szabo 在 1990 年代提出，但直到 Ethereum 出現後才真正被大規模實踐。簡單來說，智能合約就是一段部署在區塊鏈上的程式碼，它按照預先定義好的規則自動執行，任何人都可以驗證其行為是否符合預期。這與傳統的伺服器端程式有根本性的差異——傳統程式運行在某家公司的伺服器上，使用者必須「信任」那台伺服器不會被篡改；智能合約則運行在去中心化的節點網路上，其執行結果由共識機制保證。

從工程角度來看，智能合約最關鍵的特性是「不可變性」（immutability）。一旦合約被部署到鏈上，其程式碼就無法直接修改。這意味著任何 bug 都會永久存在於鏈上，修復的成本遠比傳統軟體高得多。2016 年的 The DAO 事件就是一個經典案例——一個重入漏洞導致了價值約 6000 萬美元的 ETH 被盜，最終迫使 Ethereum 社群進行硬分叉。因此，在寫智能合約之前，工程師必須先進行完整的威脅建模（threat modeling）：列出所有可能的攻擊向量、邊界條件、權限異常情境，再開始撰寫程式碼。

智能合約的另一個重要特性是「確定性」（determinism）。同樣的輸入必須產生同樣的輸出，否則不同節點無法達成共識。這代表智能合約不能使用隨機數（需要透過 oracle 或 VRF）、不能直接呼叫外部 API、不能依賴系統時鐘的精確值。這些限制在設計合約時必須充分考慮。

```text
傳統軟體 vs 智能合約對比：

┌─────────────────┬─────────────────────┬─────────────────────┐
│     比較項目     │     傳統軟體         │     智能合約         │
├─────────────────┼─────────────────────┼─────────────────────┤
│ 部署後修改       │ 隨時可更新           │ 不可變（需 Proxy）   │
│ 執行環境         │ 中心化伺服器         │ 去中心化節點網路     │
│ 信任模型         │ 信任營運方           │ 信任程式碼           │
│ 執行成本         │ 按伺服器資源計費     │ 按 gas 計費          │
│ 錯誤修復         │ 熱修補丁             │ 需部署新版 + 遷移    │
│ 資料透明度       │ 營運方控制           │ 全鏈公開可查         │
└─────────────────┴─────────────────────┴─────────────────────┘
```

### 7.1.2 智能合約的運作機制 `P0`

運作流程：
1. 使用者提交交易
2. 節點執行 EVM 字節碼
3. 產生狀態變更與事件
4. 打包進區塊

```text
Tx -> EVM Execute -> State Change + Event -> Block
```

讓我們更細緻地拆解這個流程。當使用者想要與智能合約互動時，他首先需要構建一筆交易（transaction）。這筆交易包含目標合約地址、要呼叫的函數簽名、傳入的參數、以及支付的 gas 費用。交易構建完成後，使用者用自己的私鑰對交易進行簽名，然後將已簽名的交易廣播到 Ethereum 網路。

當節點接收到這筆交易後，會將其放入交易池（mempool）等待打包。被選中的驗證者（validator）會從 mempool 中選取交易，在 EVM（Ethereum Virtual Machine）中逐一執行。EVM 是一個堆疊式虛擬機器，它讀取合約編譯後的字節碼（bytecode），按照指令集逐步執行。每一條指令都有對應的 gas 消耗量，如果交易附帶的 gas 不足以完成所有指令，交易會被 revert，但已消耗的 gas 不會退還。

```text
詳細運作流程：

  User                    Network                    EVM                     Chain
   │                        │                         │                        │
   │  1. Build Tx           │                         │                        │
   │  (to, data, gas,       │                         │                        │
   │   nonce, value)        │                         │                        │
   │                        │                         │                        │
   │  2. Sign Tx            │                         │                        │
   │  (ECDSA signature)     │                         │                        │
   │                        │                         │                        │
   │  3. Broadcast ────────>│                         │                        │
   │                        │  4. Enter Mempool       │                        │
   │                        │                         │                        │
   │                        │  5. Validator selects ──>│                        │
   │                        │                         │  6. Load bytecode      │
   │                        │                         │  7. Execute opcodes    │
   │                        │                         │  8. Update state ─────>│
   │                        │                         │  9. Emit events ──────>│
   │                        │                         │                        │
   │  10. Get receipt <─────│<─────────────────────────│<───────────────────────│
   │  (status, logs, gas)   │                         │                        │
```

執行完成後，EVM 會產生兩類結果：狀態變更（State Change）和事件日誌（Event Log）。狀態變更是寫入區塊鏈永久儲存的資料，例如帳戶餘額的增減、mapping 中新增的鍵值對等。事件日誌則不會影響鏈上狀態，但會被記錄在交易收據（receipt）中，供外部系統（如前端 DApp、索引服務）監聽和查詢。

一個常見的誤解是「交易提交就代表執行成功」。實際上，交易被打包進區塊只代表它被處理了，但不代表它執行成功。交易收據中的 `status` 欄位為 `1` 才代表成功，為 `0` 代表 revert。工程上必須檢查收據狀態，而非僅確認交易上鏈。

### 7.1.3 智能合約運作三要素 `P0`

三要素：
- `State`：儲存資料
- `Function`：狀態轉移邏輯
- `Event`：對外通知與索引依據

智能合約可以被理解為一個狀態機（state machine），而這個狀態機由三個核心要素組成。理解這三個要素之間的關係，是正確設計合約的前提。

**State（狀態）** 是合約在鏈上持久保存的資料。每個合約都有自己獨立的儲存空間（storage），以 256-bit 的 slot 為單位組織。狀態變數的值會在交易之間持續存在，直到被新的交易修改。例如，一個 ERC-20 token 合約的 `balances` mapping 就是一個典型的狀態——它記錄了每個地址持有的 token 數量。設計狀態時的關鍵考量是：哪些資料真正需要上鏈？上鏈的每一個 byte 都需要支付 gas，因此應該只儲存最必要的資料，其餘資料可以透過事件日誌或鏈下儲存來處理。

**Function（函數）** 是改變狀態的邏輯。函數接收外部輸入（交易的 calldata），按照定義好的規則修改狀態。函數可以有不同的可見性和狀態屬性，這些我們會在後面的章節詳細討論。設計函數時的核心原則是：每個函數的前置條件（precondition）和後置條件（postcondition）都必須清晰明確，並且透過 `require` 或 custom error 來強制執行。

**Event（事件）** 是合約對外部世界的通知機制。事件被記錄在交易日誌中，但不佔用合約的 storage 空間，因此 gas 成本相對較低。事件的主要用途有三個：一是讓前端 DApp 能夠監聽合約狀態變化並即時更新 UI；二是作為鏈下索引服務（如 The Graph）的資料來源；三是作為審計追蹤的依據。一個好的合約設計應該為所有重要的狀態變更都發出對應的事件。

```text
三要素互動關係：

┌──────────────────────────────────────────────────┐
│                Smart Contract                     │
│                                                   │
│   ┌─────────────────────────────────────┐        │
│   │           State (Storage)            │        │
│   │  ┌──────────┐  ┌──────────────────┐ │        │
│   │  │ balances │  │ allowances       │ │        │
│   │  │ mapping  │  │ mapping          │ │        │
│   │  └──────────┘  └──────────────────┘ │        │
│   │  ┌──────────┐  ┌──────────────────┐ │        │
│   │  │ owner    │  │ totalSupply      │ │        │
│   │  │ address  │  │ uint256          │ │        │
│   │  └──────────┘  └──────────────────┘ │        │
│   └─────────────────────────────────────┘        │
│         ▲                                         │
│         │ read/write                              │
│         │                                         │
│   ┌─────┴─────────────────────────────┐          │
│   │         Functions                  │          │
│   │  transfer()  approve()  mint()     │──────> Events
│   │  burn()      pause()               │   Transfer()
│   └───────────────────────────────────┘   Approval()
│         ▲                                         │
│         │ calldata                                │
└─────────┼────────────────────────────────────────┘
          │
    External Call (Transaction)
```

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

開發環境的選擇直接影響開發效率和測試品質。目前主流的 Solidity 開發框架有兩個：**Foundry** 和 **Hardhat**。兩者各有優勢，選擇取決於團隊偏好和專案需求。

**Foundry** 是用 Rust 寫的工具鏈，包含 `forge`（編譯與測試）、`cast`（鏈上互動）、`anvil`（本地測試鏈）三個核心工具。它的最大優勢是測試用 Solidity 本身來寫，不需要在 JavaScript/TypeScript 和 Solidity 之間切換語境。此外，Foundry 內建了 fuzz testing 和 invariant testing 能力，對安全性要求高的專案特別有價值。

```bash
# Foundry 安裝與基本工作流

# 安裝
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 初始化專案
forge init my-contract

# 編譯
forge build

# 測試（含 fuzz testing）
forge test -vvv

# 部署到本地測試鏈
anvil &                         # 啟動本地鏈
forge create src/MyContract.sol:MyContract \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec...

# 部署到測試網
forge create src/MyContract.sol:MyContract \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_KEY
```

**Hardhat** 是用 JavaScript/TypeScript 寫的工具鏈，生態系更成熟，有大量的外掛可用（如 hardhat-deploy、hardhat-gas-reporter 等）。測試用 JavaScript/TypeScript 撰寫，適合前端工程師或已有 JavaScript 經驗的團隊。

```bash
# Hardhat 基本工作流

# 初始化專案
npx hardhat init

# 編譯
npx hardhat compile

# 測試
npx hardhat test

# 部署
npx hardhat run scripts/deploy.js --network sepolia

# 驗證合約
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

**本地測試鏈** 是開發過程中不可或缺的工具。Anvil（Foundry 配套）和 Hardhat Network 都可以在本機啟動一條完整的 Ethereum 模擬鏈，支援即時出塊、時間快轉、狀態快照等功能。使用本地鏈可以大幅加速開發迭代，同時避免在測試網上浪費測試幣。

**OpenZeppelin** 是智能合約開發的標準安全庫，提供了經過審計的 ERC-20、ERC-721、AccessControl、ReentrancyGuard 等常用合約實作。工程上的建議是：凡是 OpenZeppelin 已經實作的功能，都應該優先使用其實作，而非自己從頭寫。自行實作標準功能不僅浪費時間，還容易引入安全漏洞。

```text
開發環境選擇決策樹：

需要 Solidity 原生測試？ ──── Yes ──> Foundry
        │
        No
        │
團隊熟悉 JavaScript？ ──── Yes ──> Hardhat
        │
        No
        │
需要大量外掛支援？ ──── Yes ──> Hardhat
        │
        No
        │
重視編譯與測試速度？ ──── Yes ──> Foundry
        │
        No ──> 兩者皆可，建議 Foundry（業界趨勢）
```

### 7.1.5 Remix環境簡介 `P1`

Remix 適合：
- 快速驗證語法
- 教學與原型
- 小範例除錯

不適合：
- 團隊協作大專案
- 需要完整 CI/CD 的場景

Remix（https://remix.ethereum.org）是一個瀏覽器內的 Solidity IDE，無需安裝任何工具即可開始撰寫和測試智能合約。它內建了 Solidity 編譯器、JavaScript VM（模擬 EVM）、以及合約部署和互動介面。對於初學者來說，Remix 是最快上手的工具。

Remix 最大的優勢在於「零配置」。打開瀏覽器就能開始寫合約、編譯、部署到模擬環境、並透過 UI 直接呼叫合約函數查看結果。這對於快速驗證一個語法概念或測試一段小邏輯非常方便。此外，Remix 還提供了 Solidity 靜態分析外掛，可以檢測常見的安全問題。

然而，Remix 有明顯的局限性。它不支援版本控制（Git）、不方便進行自動化測試、無法整合 CI/CD 流水線、也不適合多人協作。因此，在真正的工程專案中，Remix 通常只用於快速原型驗證和教學演示，正式開發應該使用 Foundry 或 Hardhat。

一個常見的工作流是：先在 Remix 中快速驗證一個想法，確認可行後再到 Foundry/Hardhat 專案中正式實作並撰寫完整的測試。

### 7.1.6 初識Solidity `P0`

第一原則：
- 明確版本（`pragma solidity ^0.8.x`）
- 預設安全（溢位保護、嚴格可見性）
- 儘量用 custom error

Solidity 是一門為 EVM 設計的靜態型別、合約導向的程式語言。它的語法看起來像 JavaScript，但底層行為更接近 C++。理解 Solidity 的設計哲學和基本結構，是後續所有學習的基礎。

**版本宣告** 是每個 Solidity 檔案的第一行。`pragma solidity ^0.8.20;` 表示這個合約兼容 0.8.20 到（不含）0.9.0 的所有編譯器版本。版本宣告非常重要，因為不同版本的 Solidity 在安全特性上有重大差異。例如，0.8.0 之前的版本沒有內建溢位保護，開發者需要手動使用 SafeMath 庫；0.8.0 之後則預設開啟溢位檢查。

**Custom Error** 是 Solidity 0.8.4 引入的特性，相比傳統的 `require(condition, "error message")` 字串錯誤，custom error 在 gas 消耗上更節省，同時提供了更好的結構化錯誤資訊。

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 定義 custom error
error InsufficientBalance(uint256 available, uint256 required);
error Unauthorized(address caller);

contract MyFirstContract {
    address public owner;
    mapping(address => uint256) public balances;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        uint256 bal = balances[msg.sender];
        if (bal < amount) revert InsufficientBalance(bal, amount);

        balances[msg.sender] -= amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");

        emit Withdrawn(msg.sender, amount);
    }
}
```

上面的範例展示了一個最小但完整的合約結構：包含狀態變數、事件宣告、modifier、constructor、以及帶有完整錯誤處理的函數。注意 `withdraw` 函數遵循了 Checks-Effects-Interactions（CEI）模式——先檢查條件、再更新狀態、最後才進行外部呼叫。這是防止重入攻擊的基本實踐。

## 7.2 Solidity基礎語法 `P0`

### 7.2.1 Solidity基礎資料類型 `P0`

常用型別：
- `uint256`, `int256`
- `bool`
- `address`
- `bytes`, `string`

建議：先用 `uint256`，有明確需求再做壓縮。

Solidity 的型別系統與 EVM 的 256-bit 架構緊密相關。EVM 的每個 stack slot 都是 256 bits，因此 `uint256` 和 `int256` 是最「自然」的整數型別，使用它們通常不會產生額外的 gas 成本。

**整數型別** 包括 `uint8` 到 `uint256`（以 8 為步進）和對應的有號整數 `int8` 到 `int256`。一個常見的誤解是「用 `uint8` 比 `uint256` 省 gas」。事實上，EVM 在操作小於 256 bits 的整數時，需要額外的 mask 操作來清除高位元，反而會增加 gas 消耗。只有在 struct 中使用 tight packing 時，較小的整數型別才能真正節省 storage 空間。

```solidity
// 錯誤：以為 uint8 省 gas
uint8 public counter;  // 實際上比 uint256 更貴（獨立 slot 時）

// 正確：在 struct 中 tight packing 才有意義
struct PackedData {
    uint128 balance;    // slot 0 的前 128 bits
    uint64 timestamp;   // slot 0 的中間 64 bits
    uint64 nonce;       // slot 0 的後 64 bits
}
// 整個 struct 只佔一個 storage slot (256 bits)
```

**`address` 型別** 是 20 bytes（160 bits），代表一個 Ethereum 地址。`address` 和 `address payable` 有區別——只有 `address payable` 才有 `transfer` 和 `send` 方法，可以接收 ETH。不過在實際開發中，建議統一使用低層的 `call` 來轉帳，因為 `transfer` 和 `send` 有 2300 gas 限制，可能在某些情境下失敗。

**`bytes` 和 `string`** 都是動態長度的型別。`bytes` 用於存放任意二進位資料，`string` 用於存放 UTF-8 文字。需要注意的是，Solidity 中的 `string` 不支援直接比較（不能用 `==`）、不支援取長度、不支援索引存取。如果需要這些操作，要先將 `string` 轉換為 `bytes`。

```text
Solidity 型別記憶表：

┌─────────────┬──────────────┬───────────────────────────────┐
│   型別       │   大小        │   常見用途                     │
├─────────────┼──────────────┼───────────────────────────────┤
│ uint256     │ 32 bytes     │ 金額、計數器、時間戳            │
│ int256      │ 32 bytes     │ 需要負數的場景（少用）          │
│ bool        │ 1 byte*      │ 開關、狀態旗標                  │
│ address     │ 20 bytes     │ 帳戶、合約地址                  │
│ bytes32     │ 32 bytes     │ Hash 值、固定長度識別碼         │
│ bytes       │ 動態         │ 任意二進位資料                  │
│ string      │ 動態         │ 文字資料（鏈上盡量少用）        │
└─────────────┴──────────────┴───────────────────────────────┘
* bool 在獨立 slot 時仍佔 32 bytes
```

### 7.2.2 函數 `P0`

函數屬性：
- 可見性：`public/external/internal/private`
- 狀態屬性：`view/pure/payable`

工程建議：
- 對外函數先驗參
- 寫操作用 custom error

函數是智能合約與外部世界互動的介面。正確理解函數的可見性和狀態屬性，是寫出安全合約的基礎。

**可見性（Visibility）** 決定了函數可以被誰呼叫。`external` 函數只能被外部交易或其他合約呼叫，不能在合約內部直接呼叫（除非使用 `this.func()`）。`public` 函數既可以被外部呼叫，也可以在內部呼叫。`internal` 函數只能在合約內部或繼承的子合約中呼叫。`private` 函數只能在定義它的合約中呼叫，子合約無法存取。

一個重要的工程實踐是：**對外暴露的函數（`external`/`public`）應該盡量少**。每多暴露一個函數，就多一個攻擊面。遵循最小權限原則，只暴露必要的介面。

```solidity
contract FunctionVisibility {
    // external: 只能從外部呼叫，calldata 不需複製到 memory，省 gas
    function deposit() external payable { ... }

    // public: 內外都能呼叫，但 calldata 需複製
    function getBalance() public view returns (uint256) { ... }

    // internal: 只有本合約和子合約能呼叫
    function _validateInput(uint256 amount) internal pure { ... }

    // private: 只有本合約能呼叫
    function _updateState() private { ... }
}
```

**狀態屬性（State Mutability）** 標示函數是否會修改鏈上狀態。`view` 函數只讀取狀態不修改，`pure` 函數既不讀取也不修改狀態（純計算），`payable` 函數可以接收 ETH。沒有標示的函數（nonpayable）可以修改狀態但不能接收 ETH。

```solidity
contract StateMutability {
    uint256 public total;

    // payable: 可以接收 ETH
    function deposit() external payable {
        total += msg.value;
    }

    // view: 只讀取狀態
    function getTotal() external view returns (uint256) {
        return total;
    }

    // pure: 不存取任何狀態
    function add(uint256 a, uint256 b) external pure returns (uint256) {
        return a + b;
    }

    // nonpayable（預設）: 修改狀態但不接收 ETH
    function reset() external {
        total = 0;
    }
}
```

**常見陷阱**：忘記在 `external` 函數開頭做輸入驗證。所有來自外部的輸入都應該被視為不可信的，必須在函數開頭進行完整的參數檢查。

```solidity
// 不好的寫法：沒有驗證輸入
function transfer(address to, uint256 amount) external {
    balances[msg.sender] -= amount;  // 可能 underflow（0.8.x 會 revert）
    balances[to] += amount;
}

// 好的寫法：先驗證，再執行
function transfer(address to, uint256 amount) external {
    if (to == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();
    if (balances[msg.sender] < amount) revert InsufficientBalance();

    balances[msg.sender] -= amount;
    balances[to] += amount;
    emit Transfer(msg.sender, to, amount);
}
```

### 7.2.3 修飾符 `P0`

modifier 典型用途：
- 權限控制
- 防重入
- 狀態檢查

Modifier 是 Solidity 提供的一種程式碼重用機制，允許開發者將常見的前置檢查邏輯抽取出來，避免在每個函數中重複撰寫相同的檢查程式碼。

Modifier 的執行流程是：先執行 modifier 中 `_` 之前的程式碼，然後執行被修飾的函數本體，最後執行 modifier 中 `_` 之後的程式碼（如果有的話）。多個 modifier 可以組合使用，它們會按照宣告的順序依次嵌套執行。

```solidity
contract ModifierExamples {
    address public owner;
    bool private _locked;
    bool public paused;

    // 權限控制 modifier
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // 防重入 modifier（與 OpenZeppelin ReentrancyGuard 類似）
    modifier nonReentrant() {
        if (_locked) revert ReentrancyDetected();
        _locked = true;
        _;
        _locked = false;
    }

    // 狀態檢查 modifier
    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // 組合使用多個 modifier
    function withdraw(uint256 amount) external
        nonReentrant
        whenNotPaused
    {
        // 實際業務邏輯
    }
}
```

**最佳實踐**：modifier 中不應該包含複雜的業務邏輯，它的職責僅限於「檢查條件」。如果 modifier 中的邏輯太複雜，應該將其拆分為獨立的 internal 函數。另外，modifier 中修改狀態（如 `_locked = true`）雖然是合法的，但應該謹慎使用，因為這會讓程式碼的控制流變得不直觀。

### 7.2.4 內建對象 `P1`

常用對象：
- `msg`, `block`, `tx`

注意：避免使用 `tx.origin` 做授權。

Solidity 提供了幾個全域可用的內建對象，讓合約可以存取交易和區塊鏈的上下文資訊。

**`msg` 對象** 包含了當前交易的資訊：
- `msg.sender`：直接呼叫者的地址（可以是 EOA 或合約）
- `msg.value`：隨交易發送的 ETH 數量（以 wei 為單位）
- `msg.data`：完整的 calldata
- `msg.sig`：calldata 的前 4 bytes（函數選擇器）

**`block` 對象** 包含了當前區塊的資訊：
- `block.timestamp`：區塊時間戳（秒）
- `block.number`：區塊編號
- `block.basefee`：區塊的 base fee

**`tx` 對象** 包含了交易層級的資訊：
- `tx.origin`：交易的原始發起者（一定是 EOA）
- `tx.gasprice`：交易的 gas 價格

**重要安全提醒**：`tx.origin` 和 `msg.sender` 的區別在於，當 A 呼叫 B、B 再呼叫 C 時，C 中的 `msg.sender` 是 B，但 `tx.origin` 是 A。因此，使用 `tx.origin` 做授權檢查是危險的——攻擊者可以誘騙使用者呼叫惡意合約，惡意合約再呼叫目標合約，此時 `tx.origin` 仍然是使用者。

```text
tx.origin 攻擊示意：

User (EOA)  ───> Malicious Contract ───> Target Contract
                                          │
tx.origin = User     ← 危險！             │
msg.sender = Malicious Contract ← 應該用這個
```

### 7.2.5 內建函數 `P1`

常見內建能力：
- `keccak256`
- `abi.encode/encodePacked`
- `ecrecover`

這些內建函數在智能合約開發中非常常用，理解它們的用途和注意事項很重要。

**`keccak256`** 是 Ethereum 使用的雜湊函數，接受 `bytes` 類型的輸入，輸出 32 bytes 的雜湊值。它常用於生成唯一識別碼、驗證資料完整性、以及在 merkle tree 中計算節點雜湊。

**`abi.encode` 和 `abi.encodePacked`** 用於將多個值編碼為 bytes。兩者的差異在於 `abi.encode` 會為每個值補齊到 32 bytes（標準 ABI 編碼），而 `abi.encodePacked` 不補齊，直接拼接。後者產生的資料更短，但存在碰撞風險——不同的輸入組合可能產生相同的編碼結果。

```solidity
// abi.encodePacked 碰撞範例
abi.encodePacked("ab", "c")   // 結果: 0x616263
abi.encodePacked("a", "bc")   // 結果: 0x616263  ← 相同！

// 安全做法：使用 abi.encode 或加入分隔
abi.encode("ab", "c")         // 結果不同於 abi.encode("a", "bc")
```

**`ecrecover`** 用於從 ECDSA 簽名中恢復簽名者的地址。這是實作 meta-transaction、permit 模式、以及鏈下簽名驗證的基礎。使用時必須注意簽名延展性（signature malleability）問題，建議使用 OpenZeppelin 的 ECDSA 庫來做安全的簽名恢復。

### 7.2.6 事務控制 `P0`

- `require`：輸入與條件檢查
- `revert`：主動回滾
- `assert`：不變量檢查

錯誤處理是智能合約安全性的核心。Solidity 提供了三種錯誤處理機制，它們的用途和行為各不相同。

**`require`** 用於驗證外部輸入和前置條件。當條件不滿足時，交易會 revert，未消耗的 gas 會退還。`require` 是最常用的錯誤處理方式，通常放在函數開頭，用於驗證呼叫者權限、參數合法性、狀態前置條件等。

**`revert`** 可以搭配 custom error 使用，提供更省 gas 且更有結構的錯誤資訊。在 Solidity 0.8.4+ 的專案中，建議用 `revert CustomError()` 取代 `require(condition, "string")`。

**`assert`** 用於檢查不變量（invariant）——即在任何情況下都不應該違反的條件。如果 `assert` 失敗，通常代表合約存在 bug。在 Solidity 0.8.0+ 中，`assert` 失敗會 revert 並退還 gas（之前版本會消耗所有 gas）。

```solidity
contract ErrorHandling {
    uint256 public totalDeposits;
    uint256 public totalWithdrawals;
    mapping(address => uint256) public balances;

    error InsufficientBalance(uint256 available, uint256 requested);
    error ZeroAmount();

    function withdraw(uint256 amount) external {
        // require: 驗證外部輸入
        if (amount == 0) revert ZeroAmount();

        // require: 驗證前置條件
        uint256 bal = balances[msg.sender];
        if (bal < amount) revert InsufficientBalance(bal, amount);

        // 更新狀態
        balances[msg.sender] -= amount;
        totalWithdrawals += amount;

        // assert: 檢查不變量（如果失敗代表有 bug）
        assert(totalDeposits >= totalWithdrawals);

        // 外部呼叫
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }
}
```

### 7.2.7 自訂修飾符 `P0`

建議將通用安全檢查抽象成 modifier，避免漏檢。

自訂 modifier 是提升合約程式碼品質的重要工具。當同一個檢查邏輯在多個函數中重複出現時，將其抽取為 modifier 不僅減少了程式碼重複，更重要的是避免了「某個函數忘記加檢查」的風險。

在實際專案中，最常見的自訂 modifier 包括：

```solidity
contract CustomModifiers {
    address public owner;
    mapping(address => bool) public operators;
    uint256 public lastActionTime;

    // 角色權限檢查
    modifier onlyOperator() {
        if (!operators[msg.sender]) revert NotOperator(msg.sender);
        _;
    }

    // 金額範圍檢查
    modifier validAmount(uint256 amount, uint256 min, uint256 max) {
        if (amount < min || amount > max) revert AmountOutOfRange(amount, min, max);
        _;
    }

    // 時間間隔限制（防止頻繁操作）
    modifier cooldown(uint256 interval) {
        if (block.timestamp < lastActionTime + interval) revert CooldownActive();
        _;
        lastActionTime = block.timestamp;
    }

    // 組合使用
    function executeAction(uint256 amount) external
        onlyOperator
        validAmount(amount, 1 ether, 100 ether)
        cooldown(1 hours)
    {
        // 業務邏輯
    }
}
```

**最佳實踐**：modifier 的命名應該清晰表達其檢查的條件，如 `onlyOwner`、`whenNotPaused`、`nonReentrant`。避免在 modifier 中放太多邏輯，保持它的「守門人」角色。

## 7.3 複合資料型態與資料結構 `P0`

### 7.3.1 自訂結構 `P0`

用 `struct` 建模業務狀態，如帳戶、訂單、提案。

Struct 是 Solidity 中最重要的資料建模工具。好的 struct 設計可以讓合約的狀態結構一目了然，同時透過 tight packing 優化 storage 成本。

```solidity
// 一個完整的訂單管理範例
contract OrderBook {
    enum OrderStatus { Created, Filled, Cancelled }

    struct Order {
        address maker;       // slot 0: 20 bytes
        uint96 amount;       // slot 0: 12 bytes（與 maker 共用一個 slot）
        address taker;       // slot 1: 20 bytes
        uint64 createdAt;    // slot 1: 8 bytes
        uint32 orderId;      // slot 1: 4 bytes
        OrderStatus status;  // slot 2: 1 byte
    }

    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId;

    function createOrder(uint96 amount) external returns (uint256) {
        uint256 id = nextOrderId++;
        orders[id] = Order({
            maker: msg.sender,
            amount: amount,
            taker: address(0),
            createdAt: uint64(block.timestamp),
            orderId: uint32(id),
            status: OrderStatus.Created
        });
        return id;
    }
}
```

**Storage 佈局優化** 是 struct 設計的重要考量。EVM 的 storage 以 32 bytes（256 bits）為一個 slot，讀寫一個 slot 是一次 SSTORE/SLOAD 操作。如果 struct 中的多個小型欄位可以塞進同一個 slot，就能減少 storage 操作次數，節省 gas。

```text
Storage Slot 佈局示意（上面 Order struct）：

Slot 0: |-- maker (20 bytes) --|-- amount (12 bytes) --|
Slot 1: |-- taker (20 bytes) --|-- createdAt (8 bytes) --|-- orderId (4 bytes) --|
Slot 2: |-- status (1 byte) --|------ unused (31 bytes) ------|

如果不注意排列順序，可能浪費 slot：
// 壞的排列（浪費空間）
struct BadOrder {
    address maker;       // slot 0: 20 bytes + 12 bytes 浪費
    uint256 amount;      // slot 1: 32 bytes（獨佔一個 slot）
    address taker;       // slot 2: 20 bytes + 12 bytes 浪費
}
// 用了 3 個 slot

// 好的排列（tight packing）
struct GoodOrder {
    uint256 amount;      // slot 0: 32 bytes
    address maker;       // slot 1: 20 bytes
    address taker;       //        + 20 bytes... 不行，超過 32 bytes
}
// 所以實際上要用 uint96 等較小型別來做 packing
```

### 7.3.2 數組和動態數組 `P0`

- 固定長度陣列：成本可預期
- 動態陣列：彈性高，需留意 gas

Solidity 中的陣列分為固定長度和動態長度兩種。固定長度陣列在編譯時就確定大小，storage 佈局可預測；動態陣列的大小在運行時決定，其元素儲存在由 `keccak256(slot)` 計算出的位置。

```solidity
contract ArrayExamples {
    // 固定長度陣列：適合已知大小的資料
    address[3] public admins;

    // 動態陣列：適合大小不確定的資料
    address[] public members;

    // 新增元素
    function addMember(address member) external {
        members.push(member);  // gas 成本隨陣列增長不變（O(1)）
    }

    // 刪除元素（注意：delete 只會清零，不會縮短陣列）
    function removeMember(uint256 index) external {
        // 方法1：與最後一個元素交換後 pop（O(1)，不保順序）
        members[index] = members[members.length - 1];
        members.pop();
    }

    // 遍歷（危險操作！）
    function getAllMembers() external view returns (address[] memory) {
        return members;  // 如果陣列很大，可能超過 gas 上限
    }
}
```

**常見陷阱**：在合約中遍歷一個無界動態陣列是非常危險的做法。如果陣列長度不斷增長，遍歷的 gas 消耗會最終超過區塊 gas 上限，導致函數永遠無法執行。這是一種 DoS（拒絕服務）漏洞。解決方案包括：設定陣列長度上限、使用分批處理（pagination）、或改用 mapping 結構。

### 7.3.3 映射 `P0`

`mapping` 適合做 key-value 狀態索引。

注意：mapping 不可直接遍歷，常需外部索引或輔助陣列。

Mapping 是 Solidity 中最常用的資料結構，類似於其他語言的 hash table 或 dictionary。它的讀寫操作都是 O(1) 的，非常適合做帳戶餘額、授權關係、配置參數等 key-value 形式的狀態儲存。

```solidity
contract MappingExamples {
    // 基本 mapping
    mapping(address => uint256) public balances;

    // 巢狀 mapping（二維索引）
    mapping(address => mapping(address => uint256)) public allowances;

    // mapping + struct
    mapping(uint256 => Order) public orders;

    // mapping 不可遍歷的解法：輔助陣列
    address[] public allUsers;
    mapping(address => bool) public isUser;

    function register() external {
        if (!isUser[msg.sender]) {
            isUser[msg.sender] = true;
            allUsers.push(msg.sender);
        }
    }

    // 可以遍歷 allUsers 陣列來間接「遍歷」mapping
    function getUserCount() external view returns (uint256) {
        return allUsers.length;
    }
}
```

Mapping 的底層儲存方式是：每個 key-value pair 的 storage 位置由 `keccak256(key, slot)` 計算而來。這意味著 mapping 中不存在的 key 會返回型別的預設值（如 `uint256` 返回 0、`address` 返回 `address(0)`、`bool` 返回 `false`），而不會拋出錯誤。這是一個需要特別注意的行為——你無法區分「key 存在但值為 0」和「key 不存在」的情況，除非額外維護一個 `exists` mapping。

### 7.3.4 address類型 `P0`

address 是權限與資產轉移核心型別。

常見操作：
- `address(this)`
- `payable(addr).transfer(...)`

`address` 型別在 Solidity 中佔據核心地位，因為 Ethereum 的帳戶模型就是以地址為基礎的。每個合約、每個外部帳戶都有一個唯一的 20 bytes 地址。

```solidity
contract AddressOperations {
    // 查詢地址的 ETH 餘額
    function getBalance(address addr) external view returns (uint256) {
        return addr.balance;
    }

    // 三種轉帳方式的比較
    function sendETH(address payable to, uint256 amount) external {
        // 方式1: transfer - 固定 2300 gas，失敗會 revert
        // 不推薦：2300 gas 可能不夠（如果接收方是合約）
        to.transfer(amount);

        // 方式2: send - 固定 2300 gas，失敗返回 false
        // 不推薦：容易忘記檢查返回值
        bool success = to.send(amount);
        require(success, "send failed");

        // 方式3: call - 可以指定 gas，推薦使用
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "call failed");
    }

    // 檢查地址是否為合約
    function isContract(address addr) external view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
        // 注意：constructor 執行期間 extcodesize 為 0
    }
}
```

**最佳實踐**：統一使用 `call` 進行 ETH 轉帳，搭配 `require` 檢查返回值。`transfer` 和 `send` 的 2300 gas 上限在 Istanbul 硬分叉後可能導致某些合約的 `receive` 函數無法正常執行。

### 7.3.5 memory與storage `P0`

- `storage`：鏈上持久狀態
- `memory`：函數暫存

常見坑：
- 對 storage 引用誤改全局狀態
- 未理解 copy/reference 行為

資料位置（data location）是 Solidity 中最容易讓新手犯錯的概念之一。理解 `storage`、`memory` 和 `calldata` 的差異，以及它們之間的複製/引用行為，是避免嚴重 bug 的關鍵。

**`storage`** 是區塊鏈上的持久儲存。所有狀態變數都儲存在 storage 中。讀取 storage 的 gas 成本是 2100（cold）或 100（warm），寫入 storage 的成本是 5000（非零值寫入已有 slot）或 20000（零值寫入新 slot）。因此，storage 操作是智能合約中最昂貴的操作之一。

**`memory`** 是函數執行期間的暫存空間。函數結束後 memory 被清除。Memory 的讀寫成本遠低於 storage，但 memory 的大小會影響 gas 消耗（memory 擴展有二次方成本）。

**`calldata`** 是外部函數參數的儲存位置，是只讀的。對於 `external` 函數的陣列和 struct 參數，使用 `calldata` 比 `memory` 更省 gas，因為不需要複製資料。

```solidity
contract DataLocation {
    struct User {
        string name;
        uint256 balance;
    }

    User[] public users;

    // 危險：storage 引用直接修改狀態！
    function dangerousUpdate(uint256 index) internal {
        User storage user = users[index];  // 這是引用，不是複製
        user.balance = 0;  // 直接修改了鏈上狀態！
    }

    // 安全：memory 複製不影響狀態
    function safeRead(uint256 index) internal view returns (uint256) {
        User memory user = users[index];  // 這是複製
        return user.balance;  // 讀取複製的資料
    }

    // 省 gas：calldata 不需複製
    function processData(uint256[] calldata data) external pure returns (uint256) {
        uint256 sum;
        for (uint256 i; i < data.length; ++i) {
            sum += data[i];
        }
        return sum;
    }
}
```

```text
資料位置的複製/引用行為：

storage -> storage  = 引用（指向同一個 slot）
storage -> memory   = 複製（獨立副本）
memory  -> storage  = 複製（寫入鏈上）
memory  -> memory   = 引用（指向同一段 memory）
calldata -> memory  = 複製
calldata -> storage = 複製
```

## 7.4 Solidity物件導向編程 `P0`

### 7.4.1 接口 `P0`

interface 用於描述外部合約函數簽名，支援跨合約調用。

Interface（介面）在 Solidity 中扮演「合約之間的契約」角色。它定義了一組函數簽名，但不包含任何實作。任何實作該介面的合約都必須提供這些函數的具體實作。這讓不同的合約可以透過一致的介面互相呼叫，而不需要知道對方的內部實作細節。

```solidity
// 定義介面
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

// 透過介面呼叫外部合約
contract TokenVault {
    function depositToken(address token, uint256 amount) external {
        // 不需要知道 token 合約的具體實作
        // 只需要知道它實作了 IERC20 介面
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
}
```

介面的限制：不能有狀態變數、不能有 constructor、不能有 modifier、所有函數必須是 `external`。這些限制確保了介面只描述「行為」而不描述「實作」。

在實際專案中，ERC 標準（如 ERC-20、ERC-721）就是以介面的形式定義的。使用標準介面可以確保合約與現有的生態系統（錢包、交易所、DApp）相容。

### 7.4.2 函數選擇器與接口ID `P0`

- selector：函數簽名 hash 前 4 bytes
- interface id：常見於 ERC-165 能力探測

當外部交易呼叫合約函數時，EVM 如何知道要執行哪個函數？答案是「函數選擇器」（function selector）。交易的 calldata 前 4 bytes 就是函數選擇器，它是函數簽名的 keccak256 hash 的前 4 bytes。

```solidity
contract SelectorExample {
    // transfer(address,uint256) 的選擇器
    // keccak256("transfer(address,uint256)") = 0xa9059cbb...
    // 取前 4 bytes: 0xa9059cbb

    function getSelector() external pure returns (bytes4) {
        return this.transfer.selector;  // 0xa9059cbb
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        // ...
    }
}
```

**Interface ID** 是 ERC-165 標準定義的概念。一個介面的 ID 是該介面中所有函數選擇器的 XOR 結果。合約可以實作 `supportsInterface(bytes4)` 函數，讓外部查詢者知道這個合約支援哪些介面。這在 NFT 市場、DApp 等場景中很常用——例如，一個 NFT 市場需要檢查某個合約是否真的是 ERC-721 合約。

```solidity
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

contract MyNFT is IERC165 {
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC721).interfaceId
            || interfaceId == type(IERC165).interfaceId;
    }
}
```

### 7.4.3 library `P1`

library 適合抽離通用邏輯，提升重用性。

Library 是 Solidity 中一種特殊的合約型別，用於封裝可重用的邏輯。Library 不能有狀態變數，不能接收 ETH，不能被繼承。它的函數可以透過 `using ... for` 語法附加到任何型別上，使程式碼更易讀。

```solidity
// 定義一個 library
library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "overflow");
        return c;
    }
}

// 自定義型別的 library（更實用的範例）
library ArrayUtils {
    /// @dev 在陣列中查找元素，返回 index。找不到返回 type(uint256).max
    function indexOf(address[] storage arr, address target)
        internal view returns (uint256)
    {
        for (uint256 i; i < arr.length; ++i) {
            if (arr[i] == target) return i;
        }
        return type(uint256).max;
    }

    /// @dev 安全移除元素（swap and pop）
    function removeByValue(address[] storage arr, address target) internal {
        uint256 idx = indexOf(arr, target);
        require(idx != type(uint256).max, "not found");
        arr[idx] = arr[arr.length - 1];
        arr.pop();
    }
}

contract MemberRegistry {
    using ArrayUtils for address[];

    address[] private members;

    function removeMember(address member) external {
        members.removeByValue(member);  // 像呼叫方法一樣使用 library
    }
}
```

**部署方式**：Library 中的 `internal` 函數會被內聯到呼叫合約中（不產生 DELEGATECALL）。`public` 或 `external` 函數則會被獨立部署，呼叫時使用 DELEGATECALL。在大多數情況下，建議將 library 函數標記為 `internal`，以避免跨合約呼叫的額外 gas 成本。

### 7.4.4 合約繼承 `P0`

繼承可以重用代碼，但要注意線性化與 override 規則。

Solidity 支援多重繼承，使用 C3 線性化（C3 linearization）來解決繼承順序的歧義。理解線性化規則對於正確使用繼承非常重要，特別是在使用 `super` 關鍵字時。

```solidity
// 繼承範例
contract Ownable {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        owner = newOwner;
    }
}

contract Pausable is Ownable {
    bool public paused;

    modifier whenNotPaused() {
        require(!paused);
        _;
    }

    function pause() external onlyOwner {
        paused = true;
    }
}

// 多重繼承
contract MyToken is Ownable, Pausable {
    mapping(address => uint256) public balances;

    // 必須 override 所有父合約的同名函數
    function transferOwnership(address newOwner) public override onlyOwner {
        // 呼叫 super 會按照 C3 線性化順序呼叫父合約
        super.transferOwnership(newOwner);
    }

    function transfer(address to, uint256 amount) external whenNotPaused {
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }
}
```

```text
C3 線性化範例：

contract A { }
contract B is A { }
contract C is A { }
contract D is B, C { }  // 繼承順序：D -> C -> B -> A

呼叫 super 時的執行順序：
D.func() -> C.func() -> B.func() -> A.func()
```

**常見陷阱**：
1. 繼承順序影響 storage layout，修改順序可能破壞已部署合約的狀態
2. `virtual` 和 `override` 關鍵字必須正確使用，否則編譯失敗
3. Constructor 的執行順序是從最基底的合約開始，到最衍生的合約結束

### 7.4.5 abstract關鍵字 `P1`

abstract contract 用於定義未完整實作的基底規範。

Abstract contract 介於 interface 和完整合約之間。它可以包含已實作的函數和狀態變數，但同時也可以包含未實作的（abstract）函數。Abstract contract 不能被直接部署，必須被子合約繼承並實作所有 abstract 函數後才能部署。

```solidity
abstract contract BaseVault {
    address public owner;
    uint256 public totalDeposits;

    // 已實作的通用邏輯
    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        totalDeposits += msg.value;
        _onDeposit(msg.sender, msg.value);  // 呼叫抽象函數
    }

    // 抽象函數：子合約必須實作
    function _onDeposit(address user, uint256 amount) internal virtual;

    // 抽象函數：提款策略由子合約決定
    function withdraw(uint256 amount) external virtual;
}

// 具體實作：簡單金庫
contract SimpleVault is BaseVault {
    mapping(address => uint256) public balances;

    function _onDeposit(address user, uint256 amount) internal override {
        balances[user] += amount;
    }

    function withdraw(uint256 amount) external override {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
    }
}

// 具體實作：定期金庫（有鎖定期）
contract TimelockVault is BaseVault {
    mapping(address => uint256) public balances;
    mapping(address => uint256) public lockUntil;
    uint256 public lockDuration = 30 days;

    function _onDeposit(address user, uint256 amount) internal override {
        balances[user] += amount;
        lockUntil[user] = block.timestamp + lockDuration;
    }

    function withdraw(uint256 amount) external override {
        require(block.timestamp >= lockUntil[msg.sender], "locked");
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
    }
}
```

Abstract contract 最適合用在「框架模式」——定義好通用的流程和介面，讓具體的實作由子合約來決定。這在 DeFi 協議中非常常見，例如一個借貸協議的 BasePool 可以定義通用的存款/提款流程，而不同的資產池（ETH Pool、USDC Pool）各自實作利率計算邏輯。

## 7.5 章節回顧與工程思維整理

本章從智能合約的基本概念出發，涵蓋了 Solidity 語言的核心語法、資料結構、以及物件導向設計。以下是幾個需要銘記的工程原則：

**狀態建模是合約設計的核心。** 在寫任何一行 Solidity 程式碼之前，先問自己：這個合約需要追蹤哪些狀態？這些狀態之間的轉換規則是什麼？誰有權觸發狀態轉換？把這些問題想清楚，合約的骨架就出來了。

**權限控制不是可選的。** 每一個可以修改狀態的 external/public 函數，都需要考慮：誰應該被允許呼叫？在什麼條件下可以呼叫？呼叫的參數有什麼限制？遺漏任何一個檢查，都可能成為攻擊向量。

**錯誤處理決定了合約的健壯性。** 使用 custom error 取代 require 字串，不僅省 gas，還能提供更好的錯誤資訊。為所有不變量（invariant）加上 assert 檢查，可以在早期發現邏輯錯誤。

**Gas 意識應該從第一天就建立。** 不需要過早優化，但需要知道哪些操作是昂貴的（storage 寫入、大陣列遍歷、跨合約呼叫），哪些操作是便宜的（memory 操作、pure 計算）。在設計階段就做出正確的資料結構選擇，比後期優化有效得多。

**測試先行，部署謹慎。** 智能合約不像 Web 應用可以隨時修補，一旦部署就很難修改。因此，完整的測試覆蓋率（包括 edge case、fuzz testing、invariant testing）不是奢侈品，而是必需品。先用 Foundry 或 Hardhat 在本地鏈上徹底測試，再部署到測試網，最後才上主網。

## 白話總結

Solidity 就是寫在區塊鏈上的程式，跟你平常寫的後端程式最大的不同在於：一旦部署就改不了（或者說改的成本超高），而且每一行程式碼跑起來都要燒錢（gas fee）。所以你不能像寫 Web App 一樣「先上線再說、有 bug 明天修」，而是要在寫之前就把所有可能出包的情況想清楚。合約本質上就是一個狀態機，有三個核心元素：State 存資料、Function 改資料、Event 通知外面的人「資料改了」。寫函數的時候最重要的是先做各種檢查（誰有權限呼叫？參數合不合法？狀態對不對？），檢查完了再改資料，最後才做外部呼叫——這就是 CEI 模式。資料結構方面，mapping 是你的好朋友，但要記得它不能遍歷；陣列可以遍歷但別讓它無限增長。Storage 和 memory 的差異一定要搞懂，搞混了輕則浪費 gas，重則直接改到鏈上狀態。開發環境推薦用 Foundry，測試寫在 Solidity 裡面比較直覺，而且內建 fuzz testing 很實用。最後記住：OpenZeppelin 已經實作好的東西就直接用，不要自己重新發明輪子。
