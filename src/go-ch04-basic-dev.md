# 第4章 Go 語言區塊鏈初級應用開發

本章目標是打通「寫合約 -> 部署 -> 用 Go 調用 -> 簽名送交易 -> 訂閱事件」完整路徑。

## 4.1 智能合約開發

### 4.1.1 合約開發環境搭建 `P0`

建議工具鏈：
- 編譯與測試：`Foundry` 或 `Hardhat`
- 本地鏈：`anvil` 或 `hardhat node`
- Go SDK：`go-ethereum`
- 錢包：測試私鑰/助記詞（僅測試用途）

最小流程：
1. 建立專案與合約目錄
2. 安裝 Solidity 編譯器
3. 跑單元測試
4. 部署到本地鏈並保存 ABI/Bytecode

環境搭建是智能合約開發的第一步，也是很多新手花費最多時間除錯的環節。推薦使用 Foundry 作為主力工具鏈，原因很直接：它用 Rust 寫的，速度快；測試用 Solidity 寫，不需要切換語言；`forge test` 內建 fuzz testing 支援。Hardhat 則適合需要大量 JavaScript 插件生態的場景。

本地鏈的選擇直接影響開發效率。`anvil`（Foundry 內建）和 `hardhat node` 都提供即時出塊的本地 Ethereum 節點。兩者的關鍵差異在於：anvil 啟動更快、支持 fork 主網狀態（可以在本地測試與主網合約的互動），hardhat node 則有更豐富的 console.log 除錯能力。

```text
開發環境架構：

┌─────────────────────────────────────────────────┐
│                 開發者工作站                       │
│                                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ Foundry  │   │ Go App   │   │ 測試私鑰     │ │
│  │ forge    │   │ go-ethereum│  │ (僅開發用)   │ │
│  │ cast     │   │ abigen   │   │              │ │
│  └────┬─────┘   └────┬─────┘   └──────────────┘ │
│       │              │                            │
│       v              v                            │
│  ┌────────────────────────────┐                  │
│  │    anvil (本地鏈)           │                  │
│  │    RPC: http://127.0.0.1:8545                 │
│  │    Chain ID: 31337          │                  │
│  └────────────────────────────┘                  │
└─────────────────────────────────────────────────┘
```

Go 與 Solidity 之間的橋樑是 `abigen`。它讀取合約的 ABI 和 Bytecode，自動生成類型安全的 Go binding。這比手動解析 ABI JSON 可靠得多。生成的 Go 程式碼包含所有合約函數和事件的型別定義，編譯期就能檢查參數類型是否正確。

```bash
# 安裝 Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 建立合約專案
forge init my-contract
cd my-contract

# 編譯合約
forge build

# 產生 Go binding
abigen --abi out/Counter.sol/Counter.abi.json \
       --bin out/Counter.sol/Counter.bin \
       --pkg counter \
       --out counter/counter.go
```

常見坑：
- Solidity 版本與 OpenZeppelin 套件版本不匹配
- 本地鏈 chain id 與簽名 chain id 不一致（anvil 預設 31337，hardhat 預設 31337）
- abigen 版本與 go-ethereum 版本不一致，導致產生的程式碼無法編譯
- 忘記在 foundry.toml 設定 optimizer runs，導致部署 gas 過高

### 4.1.2 初識 Solidity `P0`

關鍵語法：
- `contract`、`state variable`
- `constructor`
- `function`（`view`/`pure`/`payable`）
- `event` 與 `emit`

```solidity
pragma solidity ^0.8.24;

contract Counter {
    uint256 public value;
    event Increased(address indexed caller, uint256 newValue);

    function inc() external {
        value += 1;
        emit Increased(msg.sender, value);
    }
}
```

Solidity 是目前 EVM 生態系統的主流智能合約語言。它的語法看起來像 JavaScript 和 C++ 的混合體，但其執行環境與傳統程式語言截然不同。最關鍵的差異在於：每一行程式碼都有成本（gas），而且一旦部署就無法修改（除非用 proxy 模式）。這意味著合約程式碼的品質要求比一般後端程式碼高很多——bug 修復的代價是部署新合約並遷移所有狀態。

`event` 是 Solidity 中非常重要但容易被忽略的特性。event 不儲存在合約狀態中，而是寫入交易的 log（收據）。這意味著它比 storage 便宜很多（大約是 storage 的 1/5 gas），而且可以被鏈下的 Go 程式透過 `SubscribeFilterLogs` 監聽。設計合約時，任何鏈下系統需要知道的狀態變更都應該 emit 對應的 event。

`indexed` 關鍵字讓事件參數可以被過濾。例如上面的 `Increased` 事件中，`caller` 被標記為 `indexed`，這意味著你可以在 Go 端只監聽特定地址觸發的事件，而不是所有事件。每個事件最多可以有 3 個 indexed 參數。

```solidity
// 更完整的合約範例：包含建構子、修飾符、事件
pragma solidity ^0.8.24;

contract SimpleBank {
    mapping(address => uint256) private balances;
    address public owner;

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        require(msg.value > 0, "must send ETH");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient balance");
        balances[msg.sender] -= amount;
        // Checks-Effects-Interactions: 先改狀態，再轉帳
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }
}
```

### 4.1.3 智能合約有哪些數據類型 `P0`

基礎型別：
- `uint/int`
- `bool`
- `address`
- `bytesN` / `bytes`
- `string`

設計準則：
- 能用 `uint256` 就先用 `uint256`
- 需省 gas 才考慮 packing
- 會擴容的集合用 mapping + index

Solidity 的型別系統表面上簡單，但隱藏了很多 gas 優化的細節。EVM 的原生字長是 256 bits，所有低於 256 bits 的型別（如 `uint8`、`uint128`）在運算時都需要額外的 masking 操作。這意味著單獨使用 `uint8` 反而比 `uint256` 更耗 gas。只有當多個小型別能被打包（packing）到同一個 32 bytes 的 storage slot 時，使用小型別才有意義。

```solidity
// storage packing 範例
// 好的設計：3 個變數打包在同一個 slot (20 + 1 + 8 = 29 bytes < 32 bytes)
contract GoodPacking {
    address public owner;      // 20 bytes
    bool public active;        // 1 byte
    uint64 public timestamp;   // 8 bytes
    // 以上共用一個 storage slot
}

// 壞的設計：每個變數各占一個 slot
contract BadPacking {
    address public owner;      // slot 0
    uint256 public value;      // slot 1 (打斷了 packing)
    bool public active;        // slot 2
    uint64 public timestamp;   // slot 3
}
```

`address` 型別是 Solidity 特有的，代表 20 bytes 的 Ethereum 地址。在 Go 端對應 `common.Address`。`address payable` 是可以接收 ETH 的地址。兩者的區別在於 `address payable` 有 `.transfer()` 和 `.send()` 方法（不過現在推薦用 `.call{value: amount}("")`）。

`mapping` 是 Solidity 中最常用的資料結構，它是一個 hash table，key 被 hash 後決定 storage 位置。需要注意的是：mapping 不支持遍歷（因為沒有儲存 key 列表），如果需要遍歷，必須額外維護一個 array 存放所有 key。

### 4.1.4 什麼是內建對象 `P1`

常見內建上下文：
- `msg.sender`, `msg.value`, `msg.data`
- `tx.origin`（通常不建議用於授權）
- `block.timestamp`, `block.number`

內建對象提供了交易和區塊的上下文資訊。`msg.sender` 是最常用的，代表直接呼叫此函數的地址。注意「直接」兩字：如果 User A 呼叫合約 B，合約 B 再呼叫合約 C，那麼在合約 C 中 `msg.sender` 是合約 B 的地址，而不是 User A。

`tx.origin` 永遠是最初發起交易的 EOA（Externally Owned Account）。很多新手用 `tx.origin` 做權限檢查，這是一個嚴重的安全漏洞。攻擊者可以建立一個惡意合約，誘導 owner 呼叫，然後惡意合約再去呼叫目標合約。此時 `tx.origin` 是 owner，但 `msg.sender` 是惡意合約。

```solidity
// 危險：使用 tx.origin 做權限檢查
contract Vulnerable {
    address public owner;
    function withdraw() external {
        require(tx.origin == owner); // 可被釣魚攻擊！
        payable(msg.sender).transfer(address(this).balance);
    }
}

// 安全：使用 msg.sender 做權限檢查
contract Safe {
    address public owner;
    function withdraw() external {
        require(msg.sender == owner); // 只允許 owner 直接呼叫
        payable(msg.sender).transfer(address(this).balance);
    }
}
```

`block.timestamp` 是礦工/驗證者設定的區塊時間戳，有大約 12-15 秒的誤差範圍。不要用它做精確計時，但用於「24 小時鎖定期」這類粗粒度的時間控制是安全的。

### 4.1.5 智能合約的函數 `P0`

函數可見性：
- `public`, `external`, `internal`, `private`

函數狀態修飾：
- `view`: 不改狀態
- `pure`: 不讀不改狀態
- `payable`: 可收 ETH

函數可見性是合約安全的第一道防線。`external` 和 `public` 的區別在於：`external` 函數的參數從 calldata 讀取（便宜），`public` 函數的參數從 memory 讀取（因為內部也可能呼叫）。如果一個函數只會被外部呼叫，用 `external` 更省 gas。

`view` 和 `pure` 不只是標記，它們也影響呼叫方式。在 Go 端，呼叫 `view`/`pure` 函數時使用 `eth_call`，不需要發交易、不需要付 gas、不需要簽名。而呼叫非 view 函數需要發交易（`eth_sendRawTransaction`），需要 gas 和簽名。

```solidity
contract FunctionExample {
    uint256 public value;

    // external: 只能從外部呼叫，calldata 傳參，最省 gas
    function setValue(uint256 _v) external {
        value = _v;
    }

    // public: 內外部都可呼叫
    function getValue() public view returns (uint256) {
        return value;
    }

    // internal: 只能本合約和繼承合約呼叫
    function _validate(uint256 _v) internal pure returns (bool) {
        return _v > 0 && _v < 1000;
    }

    // private: 只有本合約能呼叫
    function _secret() private view returns (uint256) {
        return value * 2;
    }
}
```

工程建議：
- 對外函數先做參數驗證
- 使用 custom error 降 gas（比 require string 省約 50% gas）
- 函數命名用動詞開頭（`deposit`, `withdraw`, `approve`）
- internal/private 函數用底線前綴（`_validate`, `_transfer`）

### 4.1.6 函數修飾符 `P0`

modifier 用來封裝前置檢查：
- 權限檢查
- 狀態檢查
- 重入鎖

```solidity
modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
}
```

modifier 是 Solidity 中非常強大的程式碼重用機制。`_;` 代表被修飾函數的本體——modifier 中 `_;` 之前的程式碼在函數執行前運行，之後的程式碼在函數執行後運行。這個設計讓「前置條件檢查」和「後置狀態驗證」可以被乾淨地封裝和重用。

重入鎖（reentrancy guard）是最重要的 modifier 之一。重入攻擊是 Solidity 最經典的安全漏洞，2016 年 DAO hack 就是因為重入漏洞導致 6000 萬美元被盜。OpenZeppelin 的 `ReentrancyGuard` 提供了標準實作，建議所有涉及 ETH 或 token 轉帳的函數都加上這個 modifier。

```solidity
// 重入鎖的簡化實作
contract ReentrancyGuard {
    bool private _locked;

    modifier nonReentrant() {
        require(!_locked, "reentrant call");
        _locked = true;
        _;
        _locked = false;
    }
}

// 多重修飾符的組合使用
contract Vault is ReentrancyGuard {
    address public owner;
    mapping(address => uint256) public balances;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier validAmount(uint256 amount) {
        require(amount > 0, "amount must be positive");
        _;
    }

    // 修飾符按順序執行：先檢查 nonReentrant，再檢查 validAmount
    function withdraw(uint256 amount)
        external
        nonReentrant
        validAmount(amount)
    {
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }
}
```

### 4.1.7 巧用複合類型 `P0`

重點：
- `struct` 建模
- `mapping(address => User)` 儲存帳戶資料
- `array` 做可遍歷索引

常見模式：
- mapping 存資料 + array 存 key
- 避免在鏈上做大型遍歷

在智能合約中設計資料結構，必須時刻記住 gas 成本。鏈上儲存（SSTORE）是最昂貴的操作之一，寫入一個新的 storage slot 需要 20,000 gas，修改已有 slot 需要 5,000 gas。因此，資料結構的設計直接影響合約的可用性。

```solidity
// EnumerableMapping 模式：mapping + array 的組合
contract UserRegistry {
    struct User {
        string name;
        uint256 balance;
        bool exists;
    }

    mapping(address => User) private users;
    address[] private userList;

    function register(string calldata name) external {
        require(!users[msg.sender].exists, "already registered");
        users[msg.sender] = User({
            name: name,
            balance: 0,
            exists: true
        });
        userList.push(msg.sender);
    }

    function getUser(address addr) external view returns (User memory) {
        require(users[addr].exists, "not found");
        return users[addr];
    }

    // 注意：遍歷 userList 的 gas 成本隨用戶數線性增長
    // 只適合管理員查詢或鏈下使用，不應在高頻函數中呼叫
    function getUserCount() external view returns (uint256) {
        return userList.length;
    }
}
```

最佳實踐：
- 大型集合永遠不要在鏈上遍歷，改用 event + 鏈下索引
- struct 中的布林值和小整數嘗試 packing
- 刪除 storage 時使用 `delete`，可以獲得 gas refund

### 4.1.8 斷言處理與自定義修飾符 `P0`

錯誤處理：
- `require`: 驗證外部輸入或條件
- `revert`: 主動回滾
- `assert`: 僅用於不變量

```solidity
error AmountTooSmall(uint256 min, uint256 got);

modifier minAmount(uint256 amount) {
    if (amount < 1 ether) revert AmountTooSmall(1 ether, amount);
    _;
}
```

Custom error（自定義錯誤）是 Solidity 0.8.4 引入的特性，強烈建議使用。與 `require(condition, "error string")` 相比，custom error 有兩個顯著優勢：第一，gas 更低——error string 會完整儲存在 bytecode 中，而 custom error 只需要 4 bytes 的 selector；第二，可以攜帶結構化參數，讓鏈下程式更容易解析錯誤原因。

三種錯誤處理機制的使用場景非常明確：`require` 用於驗證外部輸入（「用戶給的參數對不對？」）、`revert` 用於流程中的主動中斷（「走到這一步發現條件不滿足」）、`assert` 用於不變量檢查（「這個條件如果不成立，代表有 bug」）。`assert` 失敗會消耗所有剩餘 gas，而 `require`/`revert` 會退還剩餘 gas。

```solidity
// 完整的錯誤處理範例
error Unauthorized(address caller);
error InsufficientBalance(uint256 required, uint256 available);
error TransferFailed();

contract Treasury {
    address public owner;
    mapping(address => uint256) public balances;

    function withdraw(uint256 amount) external {
        // require: 驗證外部條件
        if (msg.sender != owner) revert Unauthorized(msg.sender);

        // require: 驗證餘額
        uint256 bal = balances[msg.sender];
        if (bal < amount) revert InsufficientBalance(amount, bal);

        // 更新狀態
        balances[msg.sender] = bal - amount;

        // assert: 不變量——總餘額不應為負（理論上不可能，如果觸發說明有 bug）
        assert(balances[msg.sender] <= bal);

        // 外部呼叫
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
```

在 Go 端解析 custom error：

```go
// 解析合約 revert 的 custom error
func parseCustomError(abiObj abi.ABI, data []byte) (string, error) {
    for name, abiError := range abiObj.Errors {
        if bytes.Equal(data[:4], abiError.ID[:4]) {
            values, err := abiError.Inputs.Unpack(data[4:])
            if err != nil {
                return "", err
            }
            return fmt.Sprintf("%s: %v", name, values), nil
        }
    }
    return "", fmt.Errorf("unknown error selector: %x", data[:4])
}
```

### 4.1.9 經典智能合約案例 `P1`

建議三個練習案例：
- 紅包合約：多收款人分配
- 銀行合約：存取款 + 日誌
- 拍賣合約：出價與結算

這三個案例的設計意圖是覆蓋智能合約最常見的設計模式。紅包合約練習 ETH 分配與隨機性問題（鏈上隨機數是偽隨機的，可被礦工操控）。銀行合約練習 Checks-Effects-Interactions 模式和重入保護。拍賣合約練習時間鎖、退款模式（Pull over Push）、以及狀態機設計。

```solidity
// 英式拍賣合約骨架
contract EnglishAuction {
    address public seller;
    uint256 public endTime;
    address public highestBidder;
    uint256 public highestBid;
    mapping(address => uint256) public pendingReturns;
    bool public ended;

    event NewBid(address indexed bidder, uint256 amount);
    event AuctionEnded(address winner, uint256 amount);

    constructor(uint256 _duration) {
        seller = msg.sender;
        endTime = block.timestamp + _duration;
    }

    function bid() external payable {
        require(block.timestamp < endTime, "auction ended");
        require(msg.value > highestBid, "bid too low");

        if (highestBidder != address(0)) {
            // Pull over Push: 不直接退款，讓用戶自己來提
            pendingReturns[highestBidder] += highestBid;
        }
        highestBidder = msg.sender;
        highestBid = msg.value;
        emit NewBid(msg.sender, msg.value);
    }

    // Pull 模式：用戶主動提款
    function withdrawPending() external {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "nothing to withdraw");
        pendingReturns[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }

    function endAuction() external {
        require(block.timestamp >= endTime, "not yet");
        require(!ended, "already ended");
        ended = true;
        emit AuctionEnded(highestBidder, highestBid);
        (bool ok, ) = seller.call{value: highestBid}("");
        require(ok, "transfer failed");
    }
}
```

Pull over Push 是這個案例中最重要的模式。如果在 `bid()` 函數中直接把 ETH 退還給前一個出價者（Push 模式），惡意合約可以讓退款失敗（例如在 `receive()` 函數中 revert），從而阻塞整個拍賣。Pull 模式讓每個人自己來提款，一個人的失敗不會影響其他人。

### 4.1.10 智能合約開發技巧 `P0`

高頻最佳實務：
- Checks-Effects-Interactions
- Pull over Push（提款模式）
- 權限最小化
- 重要參數上鏈事件紀錄
- 導入 fuzz/invariant 測試

Checks-Effects-Interactions（CEI）是智能合約安全的黃金法則。順序是：先檢查條件（Checks），再修改狀態（Effects），最後做外部呼叫（Interactions）。這個順序確保了即使外部呼叫觸發了重入，合約狀態已經更新了，重入時的條件檢查會失敗。

```text
Checks-Effects-Interactions 模式：

┌──────────┐     ┌──────────┐     ┌───────────────┐
│ Checks   │────>│ Effects  │────>│ Interactions  │
│          │     │          │     │               │
│ - 權限   │     │ - 改餘額  │     │ - 轉 ETH     │
│ - 餘額   │     │ - 改狀態  │     │ - 呼叫合約    │
│ - 參數   │     │ - emit   │     │ - 外部呼叫    │
└──────────┘     └──────────┘     └───────────────┘

⚠️ 如果順序錯誤（先 Interactions 再 Effects），重入攻擊可以在
   狀態未更新前重複呼叫函數，導致資金被多次提取。
```

Fuzz testing 是智能合約測試的殺手鐧。Foundry 的 `forge test` 內建支持 fuzz testing——只要函數參數沒有被固定，forge 會自動生成隨機輸入來測試。Invariant testing 則更進一步，讓 fuzzer 隨機呼叫合約的不同函數，檢查是否有任何調用序列能破壞合約的不變量（如「總供應量不變」、「餘額非負」）。

```solidity
// Foundry fuzz test 範例
contract BankTest is Test {
    SimpleBank bank;

    function setUp() public {
        bank = new SimpleBank();
    }

    // forge 會自動用隨機 amount 測試這個函數
    function testFuzz_DepositWithdraw(uint256 amount) public {
        vm.assume(amount > 0 && amount < 100 ether);
        vm.deal(address(this), amount);

        bank.deposit{value: amount}();
        assertEq(bank.balanceOf(address(this)), amount);

        bank.withdraw(amount);
        assertEq(bank.balanceOf(address(this)), 0);
    }
}
```

## 4.2 Go 語言與智能合約調用

### 4.2.1 合約函數如何被調用 `P0`

兩類呼叫：
- `eth_call`：讀取，不上鏈
- `eth_sendRawTransaction`：寫入，上鏈

Go 典型路徑：
1. 載入 ABI
2. 打包 calldata
3. 建交易
4. 簽名
5. 廣播

理解 `eth_call` 和 `eth_sendRawTransaction` 的差異是 Go 區塊鏈開發的基礎。`eth_call` 是一個本地模擬執行——節點在本地的 EVM 上跑你的呼叫，回傳結果，不消耗 gas，不寫入區塊鏈。`eth_sendRawTransaction` 則是把簽好名的交易送進交易池（mempool），等待被打包到區塊中。

```text
兩種呼叫方式對比：

eth_call（讀取）：                    eth_sendRawTransaction（寫入）：

┌────────┐   calldata    ┌──────┐   ┌────────┐  signed tx   ┌──────┐
│ Go App │ ────────────> │ Node │   │ Go App │ ───────────> │ Node │
└────────┘               └──┬───┘   └────────┘              └──┬───┘
                            │                                   │
                         本地模擬                            進入 mempool
                            │                                   │
                         回傳結果                            等待打包
                      （即時、免費）                       （異步、付 gas）
                                                               │
                                                          寫入區塊
                                                               │
                                                          回傳 receipt
```

在 Go 端，如果你用 `abigen` 生成了 Go binding，這兩種呼叫模式被自動封裝了。但理解底層機制仍然重要，特別是在需要手動組裝 calldata 或處理邊界情況時。

### 4.2.2 智能合約被調用的基本步驟 `P0`

```text
Load ABI -> Pack method args -> Build tx -> Sign tx -> Send tx -> Wait receipt
```

Go 實作骨架：

```go
client, _ := ethclient.Dial(rpcURL)
nonce, _ := client.PendingNonceAt(ctx, from)
gasPrice, _ := client.SuggestGasPrice(ctx)

input, _ := abiObj.Pack("transfer", to, amount)
tx := types.NewTransaction(nonce, contractAddr, big.NewInt(0), gasLimit, gasPrice, input)

signedTx, _ := types.SignTx(tx, types.NewEIP155Signer(chainID), privateKey)
_ = client.SendTransaction(ctx, signedTx)
```

讓我們逐步拆解每一行的意義。`PendingNonceAt` 查詢帳戶的下一個可用 nonce（包含 pending 狀態的交易）。nonce 是帳戶的交易計數器，必須嚴格遞增。如果你同時送出兩筆交易，nonce 必須分別是 N 和 N+1，否則第二筆會被拒絕。

`SuggestGasPrice` 向節點查詢當前建議的 gas price。在 EIP-1559 之後，更推薦使用 `SuggestGasTipCap` 和 `baseFee` 來構建 EIP-1559 交易，它們的費用估算更精確。

```go
// 完整的 EIP-1559 交易發送流程
func sendContractTx(ctx context.Context, client *ethclient.Client,
    privateKey *ecdsa.PrivateKey, contractAddr common.Address,
    abiObj abi.ABI, method string, args ...interface{}) (*types.Receipt, error) {

    from := crypto.PubkeyToAddress(privateKey.PublicKey)

    // 1. 取得 nonce
    nonce, err := client.PendingNonceAt(ctx, from)
    if err != nil {
        return nil, fmt.Errorf("get nonce: %w", err)
    }

    // 2. 打包 calldata
    input, err := abiObj.Pack(method, args...)
    if err != nil {
        return nil, fmt.Errorf("pack args: %w", err)
    }

    // 3. 估算 gas
    gasLimit, err := client.EstimateGas(ctx, ethereum.CallMsg{
        From: from, To: &contractAddr, Data: input,
    })
    if err != nil {
        return nil, fmt.Errorf("estimate gas: %w", err)
    }

    // 4. 建立 EIP-1559 交易
    chainID, _ := client.ChainID(ctx)
    tipCap, _ := client.SuggestGasTipCap(ctx)
    head, _ := client.HeaderByNumber(ctx, nil)
    feeCap := new(big.Int).Add(
        tipCap,
        new(big.Int).Mul(head.BaseFee, big.NewInt(2)),
    )

    tx := types.NewTx(&types.DynamicFeeTx{
        ChainID:   chainID,
        Nonce:     nonce,
        GasTipCap: tipCap,
        GasFeeCap: feeCap,
        Gas:       gasLimit,
        To:        &contractAddr,
        Data:      input,
    })

    // 5. 簽名
    signer := types.LatestSignerForChainID(chainID)
    signedTx, err := types.SignTx(tx, signer, privateKey)
    if err != nil {
        return nil, fmt.Errorf("sign tx: %w", err)
    }

    // 6. 廣播
    if err := client.SendTransaction(ctx, signedTx); err != nil {
        return nil, fmt.Errorf("send tx: %w", err)
    }

    // 7. 等待 receipt
    receipt, err := bind.WaitMined(ctx, client, signedTx)
    if err != nil {
        return nil, fmt.Errorf("wait mined: %w", err)
    }

    if receipt.Status != types.ReceiptStatusSuccessful {
        return receipt, fmt.Errorf("tx reverted: %s", signedTx.Hash().Hex())
    }

    return receipt, nil
}
```

常見坑：
- `EstimateGas` 回傳的是最低值，實務上建議乘 1.2-1.5 的安全係數
- `bind.WaitMined` 會阻塞直到交易被打包，對於批量發送場景需要改用異步模式

### 4.2.3 調用合約時如何簽名 `P0`

簽名關鍵：
- 交易欄位完整（nonce, gas, to, data, chain id）
- 選對 signer（EIP-155 / 1559）
- 私鑰僅在簽名端使用

簽名是整個交易流程中安全要求最高的環節。私鑰永遠不應該離開簽名環境——不應該出現在 log 中、不應該透過網路傳輸、不應該存在非加密的儲存中。在生產環境，簽名通常在 HSM（Hardware Security Module）或 KMS（Key Management Service）中完成。

EIP-155 引入了 chain id 保護，防止一條鏈上的交易被在另一條鏈上重放。例如，一筆 Ethereum mainnet（chain id = 1）的交易如果被廣播到 Polygon（chain id = 137），簽名驗證會失敗，因為 chain id 是簽名的一部分。

```go
// 選擇正確的 signer
// Legacy 交易（EIP-155）
signer155 := types.NewEIP155Signer(chainID)

// EIP-1559 交易
signerLatest := types.LatestSignerForChainID(chainID)

// 最佳實踐：永遠用 LatestSignerForChainID，它會自動選擇正確的 signer
signedTx, err := types.SignTx(tx, types.LatestSignerForChainID(chainID), privateKey)
```

常見坑：
- `invalid sender` 多半是 chain id 或 signer 類型錯
- nonce 重複導致交易取代或失敗
- 在 Go 中用 `crypto.HexToECDSA` 載入私鑰時，不要帶 `0x` 前綴
- `bind.NewKeyedTransactorWithChainID` 是更方便的封裝，但要注意它會快取 nonce

### 4.2.4 如何訂閱合約的 event `P0`

事件訂閱用途：
- 業務狀態同步
- 錯誤與風控告警
- 對帳

Go 訂閱骨架：

```go
query := ethereum.FilterQuery{Addresses: []common.Address{contractAddr}}
logs := make(chan types.Log)
sub, _ := client.SubscribeFilterLogs(ctx, query, logs)

for {
    select {
    case err := <-sub.Err():
        _ = err
    case vLog := <-logs:
        _ = vLog // decode event
    }
}
```

事件訂閱是 DApp 後端最核心的功能之一。鏈上合約的狀態變更透過 event 通知鏈下系統，這是 DApp 實現「響應式」的關鍵機制。例如，一個交易所的充值流程：用戶將 token 轉入充值地址 -> 合約 emit Transfer 事件 -> 後端監聽到事件 -> 更新用戶餘額。

`SubscribeFilterLogs` 使用 WebSocket 連線，能即時接收新事件。但 WebSocket 連線不穩定——網路波動、節點重啟、連線超時都會導致斷線。生產系統必須實作健全的重連機制和歷史事件回補。

```go
// 生產級事件監聽器骨架
func watchEvents(ctx context.Context, client *ethclient.Client,
    contractAddr common.Address, startBlock uint64) error {

    for {
        // 1. 先回補從 startBlock 到最新的歷史事件
        currentBlock, err := client.BlockNumber(ctx)
        if err != nil {
            time.Sleep(5 * time.Second)
            continue
        }

        if startBlock < currentBlock {
            query := ethereum.FilterQuery{
                FromBlock: new(big.Int).SetUint64(startBlock),
                ToBlock:   new(big.Int).SetUint64(currentBlock),
                Addresses: []common.Address{contractAddr},
            }
            logs, err := client.FilterLogs(ctx, query)
            if err != nil {
                time.Sleep(5 * time.Second)
                continue
            }
            for _, vLog := range logs {
                processLog(vLog)
            }
            startBlock = currentBlock + 1
        }

        // 2. 訂閱新事件
        logCh := make(chan types.Log)
        sub, err := client.SubscribeFilterLogs(ctx, ethereum.FilterQuery{
            Addresses: []common.Address{contractAddr},
        }, logCh)
        if err != nil {
            time.Sleep(5 * time.Second)
            continue
        }

        // 3. 處理新事件，斷線時跳回外層重連
        func() {
            defer sub.Unsubscribe()
            for {
                select {
                case err := <-sub.Err():
                    log.Printf("subscription error: %v, reconnecting...", err)
                    return
                case vLog := <-logCh:
                    processLog(vLog)
                    startBlock = vLog.BlockNumber + 1
                }
            }
        }()
    }
}
```

常見坑：
- websocket 斷線沒重連
- 只訂閱新事件，漏補歷史區塊
- 處理 event 時沒有考慮 chain reorganization（被 reorg 的區塊中的 event 需要回滾）
- `FilterLogs` 一次查詢的區塊範圍太大，導致節點返回錯誤或超時（建議每次最多查 2000 blocks）
- 沒有持久化 `startBlock`，重啟後從頭開始掃描

## 實訓：編寫一個銀行合約 `P0`

功能要求：
- `deposit()`
- `withdraw(amount)`
- `balanceOf(user)`
- `event Deposited/Withdrawn`

工程要求：
- withdraw 使用重入保護
- 超額提款需回滾
- Go 客戶端可完成存取款與事件監聽

驗收清單：
- 合約單元測試通過
- Go 調用成功並拿到 receipt
- event 可被訂閱並解析

以下是完整的端到端實作思路：

```text
端到端開發流程：

1. 合約開發                2. Go Binding 生成        3. Go 客戶端
┌────────────────┐        ┌──────────────────┐      ┌──────────────────┐
│ Bank.sol       │        │ abigen           │      │ main.go          │
│ BankTest.t.sol │ ─────> │ ABI + Bytecode   │ ──>  │ Deploy           │
│                │  forge  │ -> bank.go       │      │ Deposit          │
│                │  build  │                  │      │ Withdraw         │
└────────────────┘        └──────────────────┘      │ WatchEvents      │
                                                     └──────────────────┘
```

```go
// Go 客戶端使用 abigen 生成的 binding
func main() {
    client, _ := ethclient.Dial("ws://127.0.0.1:8545")
    privateKey, _ := crypto.HexToECDSA("ac0974bec...")
    auth, _ := bind.NewKeyedTransactorWithChainID(privateKey, big.NewInt(31337))

    // 部署合約
    addr, tx, bank, _ := DeployBank(auth, client)
    bind.WaitDeployed(context.Background(), client, tx)
    fmt.Printf("Bank deployed at: %s\n", addr.Hex())

    // 存款 1 ETH
    auth.Value = big.NewInt(1e18) // 1 ETH in wei
    tx, _ = bank.Deposit(auth)
    receipt, _ := bind.WaitMined(context.Background(), client, tx)
    fmt.Printf("Deposit receipt status: %d\n", receipt.Status)
    auth.Value = big.NewInt(0) // reset value

    // 查餘額
    bal, _ := bank.BalanceOf(nil, auth.From)
    fmt.Printf("Balance: %s wei\n", bal.String())

    // 監聽事件
    go func() {
        depositCh := make(chan *BankDeposited)
        sub, _ := bank.WatchDeposited(nil, depositCh, nil)
        defer sub.Unsubscribe()
        for event := range depositCh {
            fmt.Printf("Deposit event: %s deposited %s\n",
                event.Account.Hex(), event.Amount.String())
        }
    }()
}
```

## 章節回顧與工程要點

本章完成了從合約開發到 Go 調用的完整鏈路。以下是每個環節的關鍵工程決策和需要牢記的原則：

**Solidity 開發基礎**：合約程式碼的品質要求遠高於一般後端程式碼，因為部署後無法修改。CEI 模式、重入保護、custom error、event 設計是四個最重要的基礎技能。永遠先寫測試再寫實作，Foundry 的 fuzz testing 是你最好的朋友。

**Go 調用合約完整鏈路**：`abigen` 是 Go 與 Solidity 之間的橋樑，自動生成類型安全的 binding。理解 `eth_call`（讀取、免費、同步）和 `eth_sendRawTransaction`（寫入、付 gas、異步）的區別是基礎中的基礎。

**交易簽名**：私鑰永不出簽名邊界。永遠使用 `LatestSignerForChainID` 確保選對 signer。nonce 管理是高並發場景的核心挑戰。

**事件訂閱**：生產系統必須有重連機制和歷史回補邏輯。永遠持久化處理進度（最後處理的 block number），確保服務重啟後不丟事件。

## 白話總結

這章教你怎麼從零開始跟智能合約互動。首先你得會寫 Solidity 合約——它就像是部署在區塊鏈上的微服務，一旦上線就不能改了，所以品質要求很高。然後你得學會用 Go 去呼叫這些合約，這裡面最關鍵的是搞清楚「讀」和「寫」的區別：讀是免費的、即時的，寫要付 gas、要簽名、要等確認。簽名是整個流程中最敏感的環節，私鑰就像你家的鑰匙，絕對不能讓它出現在不該出現的地方。事件訂閱就像是合約的「通知系統」，讓你的後端能即時知道鏈上發生了什麼事。最容易踩的坑是 WebSocket 斷線沒重連、歷史事件沒回補、nonce 管理混亂。把這些搞定，你就能做出一個能跟鏈上合約完整互動的 Go 後端了。
