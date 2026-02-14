# 第8章 Solidity智能合約開發進階

本章目標是把合約能力提升到可上線等級：標準、升級、架構模式、安全最佳實踐與 Python 調用。

## 8.1 Solidity經典案例

### 8.1.1 智能合約開發的一般步驟 `P1`

通用流程：
1. 寫規格與狀態機
2. 先寫測試（unit/fuzz/invariant）
3. 實作合約
4. 審計與修補
5. 部署與監控

智能合約開發不同於傳統軟體開發的最大差異在於：**部署後幾乎不可修改**。這意味著整個開發流程必須「前置重」——在撰寫程式碼之前就投入大量時間在規格設計和威脅建模上。

**第一步：規格與狀態機設計**。在動手寫任何 Solidity 程式碼之前，先用文字或圖表描述合約的狀態轉換。例如一個拍賣合約可以有 `Created -> Bidding -> Ended -> Settled` 四個狀態，每個狀態轉換的條件（誰可以觸發、前置條件、後置條件）都要明確定義。這一步看似多餘，但實際上能避免 80% 的設計錯誤。

```text
拍賣合約狀態機範例：

  ┌──────────┐   startAuction()   ┌──────────┐   endAuction()   ┌──────────┐
  │ Created  │ ─────────────────> │ Bidding  │ ─────────────────> │  Ended   │
  └──────────┘   (onlyOwner)      └──────────┘   (time expired)   └──────────┘
                                       │                               │
                                  bid()│                        settle()│
                                       │                               │
                                  [更新最高出價]                   ┌──────────┐
                                  [退還前一出價]                   │ Settled  │
                                                                  └──────────┘
                                                              [轉帳給賣家]
                                                              [退還未中標出價]
```

**第二步：先寫測試**。TDD（Test-Driven Development）在智能合約開發中不是可選的，而是必要的。使用 Foundry 可以在 Solidity 中直接寫測試，包括：
- **Unit Test**：測試單一函數的正確行為
- **Fuzz Test**：用隨機輸入測試函數在各種邊界條件下的行為
- **Invariant Test**：定義合約的不變量，讓測試框架在大量隨機操作後驗證不變量是否被破壞

```solidity
// Foundry 測試範例
contract AuctionTest is Test {
    Auction auction;

    function setUp() public {
        auction = new Auction();
    }

    // Unit test
    function test_bid_updates_highest_bidder() public {
        auction.startAuction();
        auction.bid{value: 1 ether}();
        assertEq(auction.highestBidder(), address(this));
    }

    // Fuzz test：用隨機金額測試
    function testFuzz_bid_amount(uint256 amount) public {
        vm.assume(amount > 0 && amount < 100 ether);
        vm.deal(address(this), amount);
        auction.startAuction();
        auction.bid{value: amount}();
        assertEq(auction.highestBid(), amount);
    }

    // 測試預期 revert
    function test_cannot_bid_after_end() public {
        auction.startAuction();
        vm.warp(block.timestamp + 7 days + 1);  // 時間快轉
        vm.expectRevert(Auction.AuctionEnded.selector);
        auction.bid{value: 1 ether}();
    }
}
```

**第三步至第五步**：實作合約後，必須經過至少一次外部審計（audit）。對於管理大量資金的合約，建議進行兩次以上的獨立審計。部署後還需要設置監控系統，即時偵測異常交易模式（如短時間內大量資金流出、非預期的函數呼叫等）。

### 8.1.2 土豪發紅包 `P2`

練習重點：
- 批量分發
- 名單驗證
- 防重複領取

「發紅包」是一個很好的入門練習案例，因為它涉及了智能合約開發的幾個核心問題：如何安全地向多個地址分發資金、如何防止同一個人重複領取、以及如何處理剩餘資金。

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RedPacket {
    address public creator;
    uint256 public totalAmount;
    uint256 public remainingAmount;
    uint256 public maxRecipients;
    uint256 public claimedCount;
    bool public isRandom;

    mapping(address => bool) public hasClaimed;

    error AlreadyClaimed();
    error PacketEmpty();
    error NotEnoughFunds();

    event Claimed(address indexed recipient, uint256 amount);
    event Created(address indexed creator, uint256 total, uint256 count);

    constructor(uint256 _maxRecipients, bool _isRandom) payable {
        require(msg.value > 0, "must send ETH");
        require(_maxRecipients > 0, "must have recipients");

        creator = msg.sender;
        totalAmount = msg.value;
        remainingAmount = msg.value;
        maxRecipients = _maxRecipients;
        isRandom = _isRandom;

        emit Created(msg.sender, msg.value, _maxRecipients);
    }

    function claim() external {
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (claimedCount >= maxRecipients) revert PacketEmpty();
        if (remainingAmount == 0) revert PacketEmpty();

        hasClaimed[msg.sender] = true;
        claimedCount++;

        uint256 amount;
        if (claimedCount == maxRecipients) {
            // 最後一個人拿走剩餘全部
            amount = remainingAmount;
        } else if (isRandom) {
            // 隨機金額（注意：鏈上隨機不安全，僅做練習）
            amount = _pseudoRandom() % (remainingAmount * 2 / (maxRecipients - claimedCount + 1));
            if (amount == 0) amount = 1;
        } else {
            // 平均分配
            amount = totalAmount / maxRecipients;
        }

        remainingAmount -= amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");

        emit Claimed(msg.sender, amount);
    }

    function _pseudoRandom() private view returns (uint256) {
        // 不安全的隨機數，僅做練習用途
        return uint256(keccak256(abi.encodePacked(
            block.timestamp, block.prevrandao, msg.sender, claimedCount
        )));
    }
}
```

**工程要點**：
1. **防重複領取**：使用 `mapping(address => bool)` 記錄已領取地址，在函數開頭就檢查
2. **最後一人清底**：避免精度問題導致少量資金永久鎖定在合約中
3. **鏈上隨機數的局限**：`block.prevrandao` 可以被驗證者操控，真正的隨機需要使用 Chainlink VRF 等 oracle 服務
4. **Gas 考量**：批量操作（如一次發給 100 人）可能超過 gas 上限，應該改用 claim 模式（讓接收者主動領取）

### 8.1.3 我要開銀行 `P1`

練習重點：
- 存取款模型
- 權限與限額
- 事件記錄與對帳

銀行合約是理解「狀態管理 + 權限控制 + 安全轉帳」的最佳練習。一個可靠的銀行合約需要處理存款、提款、利息計算、以及管理員操作等邏輯。

```solidity
contract SimpleBank {
    struct Account {
        uint256 balance;
        uint256 lastDepositTime;
        bool isActive;
    }

    address public owner;
    mapping(address => Account) public accounts;
    uint256 public totalDeposits;

    uint256 public constant MAX_WITHDRAWAL = 10 ether;
    uint256 public constant WITHDRAWAL_COOLDOWN = 1 hours;

    mapping(address => uint256) public lastWithdrawalTime;

    error ExceedsLimit(uint256 requested, uint256 limit);
    error CooldownActive(uint256 nextAvailable);
    error InsufficientBalance(uint256 available, uint256 requested);

    event Deposited(address indexed user, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed user, uint256 amount, uint256 newBalance);

    function deposit() external payable {
        require(msg.value > 0, "zero deposit");

        Account storage acct = accounts[msg.sender];
        acct.balance += msg.value;
        acct.lastDepositTime = block.timestamp;
        acct.isActive = true;

        totalDeposits += msg.value;
        emit Deposited(msg.sender, msg.value, acct.balance);
    }

    function withdraw(uint256 amount) external {
        Account storage acct = accounts[msg.sender];

        // 1. 檢查餘額
        if (acct.balance < amount)
            revert InsufficientBalance(acct.balance, amount);

        // 2. 檢查單次限額
        if (amount > MAX_WITHDRAWAL)
            revert ExceedsLimit(amount, MAX_WITHDRAWAL);

        // 3. 檢查冷卻期
        uint256 nextTime = lastWithdrawalTime[msg.sender] + WITHDRAWAL_COOLDOWN;
        if (block.timestamp < nextTime)
            revert CooldownActive(nextTime);

        // 4. 更新狀態（CEI: Effects before Interactions）
        acct.balance -= amount;
        totalDeposits -= amount;
        lastWithdrawalTime[msg.sender] = block.timestamp;

        // 5. 轉帳
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");

        emit Withdrawn(msg.sender, amount, acct.balance);
    }
}
```

這個案例的核心教學點在於：**每一個可能修改資金的操作，都需要多層防護**——餘額檢查、限額檢查、冷卻期檢查、CEI 模式、事件記錄。這些看似繁瑣的檢查，在真實的 DeFi 協議中是標準配備。

### 8.1.4 智能拍賣 `P1`

練習重點：
- 出價排序
- 截止時間
- 未中標退款安全性

拍賣合約是展示「外部呼叫安全性」的經典案例。核心挑戰在於：當有新的最高出價時，需要退還前一個出價者的資金。如果退款失敗（例如接收方是一個會 revert 的合約），整個出價操作都會失敗，導致拍賣被惡意阻塞。

```solidity
contract Auction {
    address public seller;
    uint256 public endTime;
    address public highestBidder;
    uint256 public highestBid;

    // 使用 Pull Payment 模式避免退款失敗阻塞出價
    mapping(address => uint256) public pendingReturns;

    error AuctionEnded();
    error BidTooLow(uint256 current, uint256 minimum);
    error AuctionNotEnded();

    event NewBid(address indexed bidder, uint256 amount);
    event AuctionSettled(address winner, uint256 amount);

    constructor(uint256 duration) {
        seller = msg.sender;
        endTime = block.timestamp + duration;
    }

    function bid() external payable {
        if (block.timestamp >= endTime) revert AuctionEnded();
        if (msg.value <= highestBid) revert BidTooLow(highestBid, highestBid + 1);

        // 將前一個最高出價記入待退款（Pull Payment）
        if (highestBidder != address(0)) {
            pendingReturns[highestBidder] += highestBid;
        }

        highestBidder = msg.sender;
        highestBid = msg.value;

        emit NewBid(msg.sender, msg.value);
    }

    // Pull Payment：出價者主動提取被退回的資金
    function withdrawBid() external {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "nothing to withdraw");

        pendingReturns[msg.sender] = 0;  // CEI: 先清零再轉帳

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function settle() external {
        if (block.timestamp < endTime) revert AuctionNotEnded();

        (bool ok, ) = seller.call{value: highestBid}("");
        require(ok, "settle failed");

        emit AuctionSettled(highestBidder, highestBid);
    }
}
```

```text
Push vs Pull Payment 模式：

Push Payment（危險）：
  bid() -> 直接退款給前一出價者 -> 如果退款失敗，整個 bid 失敗
  攻擊者：部署一個 receive() 會 revert 的合約來阻塞拍賣

Pull Payment（安全）：
  bid() -> 記錄待退款金額 -> 出價正常完成
  withdrawBid() -> 出價者自己來提取退款 -> 失敗只影響自己

┌──────────────────────────────────────────┐
│ Pull Payment 是智能合約中處理退款的       │
│ 標準模式，避免外部呼叫失敗影響核心邏輯   │
└──────────────────────────────────────────┘
```

**真實案例教訓**：2016 年的 King of the Ether 合約就是因為使用了 Push Payment 模式，被惡意合約阻塞退款導致拍賣無法繼續。這個事件推動了 Pull Payment 模式成為業界標準。

## 8.2 ERC標準 `P0`

### 8.2.1 ERC概述 `P0`

ERC 是互操作標準，讓錢包、交易所、DApp 可以一致整合。

ERC（Ethereum Request for Comments）是 Ethereum 社群制定的標準提案系統。ERC 標準的核心價值在於**互操作性**——當一個 token 合約遵循 ERC-20 標準時，任何支援 ERC-20 的錢包、交易所、DApp 都可以無縫整合它，不需要為每個 token 寫客製化的程式碼。

ERC 標準的制定流程是：任何人都可以在 Ethereum 的 GitHub 提交 EIP（Ethereum Improvement Proposal），經過社群討論、修改、審核後成為正式標準。並非所有 EIP 都會成為 ERC——ERC 特指應用層標準（如 token、NFT、帳戶抽象等），而 EIP 還包括核心協議變更、網路層變更等。

```text
主要 ERC 標準一覽：

┌───────────┬─────────────────┬───────────────────────────────┐
│  標準      │  類型            │  用途                          │
├───────────┼─────────────────┼───────────────────────────────┤
│ ERC-20    │ Fungible Token  │ 同質化代幣（USDT, LINK 等）    │
│ ERC-721   │ Non-Fungible    │ NFT（BAYC, CryptoPunks）       │
│ ERC-1155  │ Multi Token     │ 批量 NFT + FT 混合             │
│ ERC-165   │ Interface       │ 合約能力探測                   │
│ ERC-2612  │ Permit          │ 免 approve 的 token 授權       │
│ ERC-4626  │ Tokenized Vault │ 標準化的收益金庫               │
│ ERC-4337  │ Account Abstact │ 帳戶抽象                       │
└───────────┴─────────────────┴───────────────────────────────┘
```

工程上的建議：**永遠使用 OpenZeppelin 的標準實作作為基底**，而不是自己從頭實作 ERC 標準。自行實作不僅容易有 bug，還可能與其他生態系統的實作產生不相容。

### 8.2.2 ERC-20標準 `P0`

核心函數：
- `transfer`
- `approve`
- `transferFrom`
- `balanceOf`

常見坑：
- allowance 覆蓋競態
- decimals 顯示錯誤

ERC-20 是最重要、使用最廣泛的 token 標準。幾乎所有的 DeFi 協議（Uniswap、Aave、Compound 等）都是圍繞 ERC-20 token 建構的。理解 ERC-20 的每一個函數和事件，是進入 DeFi 開發的門票。

**核心互動流程**：ERC-20 的轉帳有兩種模式。第一種是直接轉帳——使用者呼叫 `transfer(to, amount)` 直接將 token 從自己的帳戶轉到目標地址。第二種是授權轉帳——使用者先呼叫 `approve(spender, amount)` 授權某個地址（通常是合約）可以花費自己的 token，然後被授權方呼叫 `transferFrom(from, to, amount)` 來執行轉帳。

```text
ERC-20 兩種轉帳模式：

模式 1: 直接轉帳
User ──── transfer(to, amount) ────> Token Contract
                                         │
                                    balances[user] -= amount
                                    balances[to]   += amount

模式 2: 授權轉帳（DeFi 常用）
Step 1: User ──── approve(DEX, amount) ────> Token Contract
                                                 │
                                            allowance[user][DEX] = amount

Step 2: DEX ──── transferFrom(user, pool, amount) ────> Token Contract
                                                            │
                                                    check: allowance[user][DEX] >= amount
                                                    allowance[user][DEX] -= amount
                                                    balances[user] -= amount
                                                    balances[pool] += amount
```

**Allowance 覆蓋競態（Race Condition）** 是 ERC-20 最著名的安全問題之一。假設 Alice 先 approve Bob 100 token，之後想改為 50 token。如果 Bob 在 Alice 修改之前搶先使用了 100 token 的 allowance，然後 Alice 的新 approve(50) 交易才上鏈，Bob 就能再使用 50 token，總共花了 150 token 而非預期的 50 token。

解決方案有兩個：一是先 approve(0)，再 approve(newAmount)；二是使用 `increaseAllowance` 和 `decreaseAllowance` 函數（OpenZeppelin 提供）。更好的做法是使用 ERC-2612 的 permit 機制，完全避開 approve 步驟。

**Decimals 陷阱**：ERC-20 token 的 `decimals` 只是一個顯示屬性，不影響合約內部的數值運算。例如 USDT 的 decimals 是 6，意味著 1 USDT = 1,000,000（10^6）最小單位。但 DAI 的 decimals 是 18，1 DAI = 10^18 最小單位。在做 token 之間的兌換計算時，必須特別注意 decimals 的差異，否則金額會差好幾個數量級。

```solidity
// Decimals 計算範例
// USDT: 6 decimals, DAI: 18 decimals

// 錯誤：直接比較不同 decimals 的數值
// 1 USDT = 1_000_000
// 1 DAI  = 1_000_000_000_000_000_000
// 這兩個數值完全不同！

// 正確：統一到相同精度後再比較
function normalizeAmount(
    uint256 amount,
    uint8 fromDecimals,
    uint8 toDecimals
) internal pure returns (uint256) {
    if (fromDecimals > toDecimals) {
        return amount / 10**(fromDecimals - toDecimals);
    } else if (fromDecimals < toDecimals) {
        return amount * 10**(toDecimals - fromDecimals);
    }
    return amount;
}
```

### 8.2.3 ERC-165標準 `P0`

用途：合約能力探測（`supportsInterface`）。

ERC-165 解決了一個實際問題：當你有一個合約地址時，如何知道這個合約實作了哪些介面？在傳統軟體中，你可以用反射（reflection）來檢查物件是否實作了某個介面；在 Solidity 中，ERC-165 提供了類似的機制。

```solidity
// ERC-165 的核心介面
interface IERC165 {
    /// @notice 查詢合約是否支援某個介面
    /// @param interfaceId 介面識別碼（4 bytes）
    /// @return true 如果合約實作了該介面
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// 實際應用：NFT 市場在處理拍賣品之前，先檢查合約類型
contract NFTMarketplace {
    bytes4 constant ERC721_ID = 0x80ac58cd;
    bytes4 constant ERC1155_ID = 0xd9b67a26;

    function listItem(address tokenContract, uint256 tokenId) external {
        // 先檢查合約類型
        if (IERC165(tokenContract).supportsInterface(ERC721_ID)) {
            // 按 ERC-721 邏輯處理
            IERC721(tokenContract).transferFrom(msg.sender, address(this), tokenId);
        } else if (IERC165(tokenContract).supportsInterface(ERC1155_ID)) {
            // 按 ERC-1155 邏輯處理
            IERC1155(tokenContract).safeTransferFrom(
                msg.sender, address(this), tokenId, 1, ""
            );
        } else {
            revert("unsupported token standard");
        }
    }
}
```

ERC-165 的 gas 成本很低（只是一個 view 函數），但提供了重要的安全保障——避免盲目呼叫一個不支援預期介面的合約。在編寫需要與多種 token 標準互動的協議（如 NFT 市場、跨鏈橋）時，ERC-165 檢查是必要的前置步驟。

### 8.2.4 ERC-721（NFT標準） `P1`

重點：
- 單 token 唯一性
- metadata 管理
- 批量 mint 與授權策略

ERC-721 是 NFT（Non-Fungible Token）的標準介面。與 ERC-20 不同，ERC-721 中的每個 token 都是獨一無二的，由一個唯一的 `tokenId` 來識別。這使得 ERC-721 適合代表獨特的數位資產，如數位藝術品、遊戲道具、域名、房地產證書等。

```solidity
// ERC-721 的核心函數
interface IERC721 {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}
```

**Metadata 管理** 是 ERC-721 的重要組成部分。每個 NFT 通常需要關聯名稱、描述、圖片等元資料。這些元資料通常不儲存在鏈上（太貴了），而是存放在 IPFS 或其他去中心化儲存系統上，鏈上只存一個 URI（透過 `tokenURI(uint256 tokenId)` 函數返回）。

```text
NFT Metadata 架構：

┌──────────────┐     tokenURI()     ┌──────────────┐     ┌──────────────┐
│  ERC-721     │ ─────────────────> │   IPFS /     │ ──> │  JSON        │
│  Contract    │   返回 URI         │   Arweave    │     │  Metadata    │
│              │                    │              │     │              │
│ tokenId: 42  │                    │ ipfs://Qm... │     │ {            │
│ owner: 0x... │                    └──────────────┘     │   "name":    │
└──────────────┘                                         │   "image":   │
                                                         │   "attrs":[] │
                                                         │ }            │
                                                         └──────────────┘
```

**批量 Mint 優化**：標準 ERC-721 的 mint 操作每次只能 mint 一個 token，每次都需要寫入 storage。ERC-721A（由 Azuki 團隊開發）通過批量 mint 優化大幅降低了 gas 成本——mint N 個 token 的 gas 成本幾乎等於 mint 1 個 token。其原理是延遲初始化：批量 mint 時只記錄起始 tokenId 和擁有者，在後續 transfer 時才逐一初始化。

**安全轉帳**：`safeTransferFrom` 在轉帳前會檢查接收方是否實作了 `onERC721Received` 介面。這防止了 token 被意外發送到無法處理 NFT 的合約地址（導致 token 永久鎖定）。但同時也引入了重入風險——接收方的 `onERC721Received` callback 可能進行惡意操作。

## 8.3 可升級合約 `P0`

### 8.3.1 不可篡改與可升級之間的矛盾 `P0`

矛盾點：
- 不可變保安全與可預期
- 可升級保可維護與修復

平衡做法：
- Proxy + Timelock + 多簽治理

區塊鏈的核心價值之一是「不可篡改」（immutability）——一旦部署的規則就無法被任何人修改，使用者可以信任程式碼就是規則。但現實中，合約可能有 bug 需要修復、功能需要擴展、或者外部依賴（如 oracle）需要更新。這就產生了一個根本性的矛盾。

業界的解決方案是 **Proxy Pattern**（代理模式）。基本原理是：使用者與一個不可變的 Proxy 合約互動，Proxy 合約透過 `delegatecall` 將邏輯執行委託給另一個可替換的 Implementation 合約。更換 Implementation 合約的地址就相當於「升級」了合約。

```text
Proxy 升級模式架構：

使用者視角（地址不變）：
┌──────────┐     ┌──────────────────────┐
│  User    │────>│  Proxy Contract      │  <── 永久地址，使用者只跟它互動
│          │     │  (不可變)             │
└──────────┘     │  - storage 在這裡     │
                 │  - delegatecall ─────>│──┐
                 └──────────────────────┘  │
                                           │
                 ┌──────────────────────┐  │    ┌──────────────────────┐
                 │  Implementation V1   │<─┘    │  Implementation V2   │
                 │  (可替換)            │       │  (升級後的新版)       │
                 │  - 只有邏輯          │       │  - 新增功能 + 修 bug  │
                 │  - 無 storage        │       │  - storage layout 相容│
                 └──────────────────────┘       └──────────────────────┘

升級流程：
1. 部署 Implementation V2
2. 多簽提案：將 Proxy 指向 V2
3. Timelock 延遲（如 48 小時）
4. 執行升級
```

但升級能力本身就是一個攻擊面。如果升級的權限被單一私鑰控制，那麼持有這把私鑰的人可以將合約升級為惡意版本，把所有使用者的資金偷走。因此，升級權限必須有嚴格的治理機制：

1. **多簽錢包（Multisig）**：升級需要 M-of-N 的簽名，例如 3/5 的核心團隊成員同意
2. **時間鎖（Timelock）**：升級提案需要等待一定時間（如 48 小時）才能執行，給社群審查的機會
3. **治理投票（Governance）**：大型協議可能需要 token 持有者投票通過升級提案

### 8.3.2 跨合約調用 `P0`

跨合約是組合能力來源，也是攻擊面來源。

要點：
- 外部調用前先更新內部狀態
- 外部合約回傳值必檢查

跨合約呼叫是 DeFi 「可組合性」（composability）的基礎——一個借貸合約可以呼叫 DEX 合約來清算抵押品，一個收益聚合器可以呼叫多個底層協議來尋找最佳收益。但每一次跨合約呼叫都是一次「控制權轉移」，被呼叫的合約可能執行任何程式碼，包括回呼呼叫方（重入攻擊）。

```solidity
// 跨合約呼叫的正確方式
contract LendingPool {
    IERC20 public token;
    mapping(address => uint256) public deposits;

    function liquidate(address borrower, uint256 amount) external {
        // 1. 先更新內部狀態（CEI 的 Effects）
        deposits[borrower] -= amount;

        // 2. 再做外部呼叫（CEI 的 Interactions）
        // 呼叫 DEX 合約賣出抵押品
        bool success = token.transfer(msg.sender, amount);
        require(success, "transfer failed");

        // 3. 如果外部呼叫有返回值，必須檢查
        // 注意：有些 ERC-20 token 的 transfer 不返回 bool（如 USDT）
        // 使用 OpenZeppelin 的 SafeERC20 可以安全處理這種情況
    }
}
```

```solidity
// 使用 SafeERC20 處理非標準 token
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SafeVault {
    using SafeERC20 for IERC20;

    function deposit(IERC20 token, uint256 amount) external {
        // safeTransferFrom 會自動處理：
        // 1. 不返回值的 token（如 USDT）
        // 2. 返回 false 的 token
        token.safeTransferFrom(msg.sender, address(this), amount);
    }
}
```

### 8.3.3 透過底層函數呼叫合約 `P0`

`call/delegatecall/staticcall` 使用要點：
- 僅在必要時用底層調用
- 必須檢查 success 與返回資料

Solidity 提供了三種底層呼叫方式，它們在不同場景下各有用途：

```text
三種底層呼叫的差異：

┌─────────────┬────────────────────┬───────────────┬────────────────┐
│   方式       │   程式碼來源        │   storage     │   msg.sender   │
├─────────────┼────────────────────┼───────────────┼────────────────┤
│ call        │ 目標合約           │ 目標合約       │ 呼叫方合約      │
│ delegatecall│ 目標合約           │ 呼叫方合約     │ 原始呼叫者      │
│ staticcall  │ 目標合約           │ 只讀           │ 呼叫方合約      │
└─────────────┴────────────────────┴───────────────┴────────────────┘
```

**`call`** 是最常用的底層呼叫方式。它在目標合約的 context 中執行程式碼，使用目標合約的 storage。適用場景：呼叫未知介面的外部合約、轉帳 ETH。

**`delegatecall`** 是 Proxy 模式的核心。它從目標合約載入程式碼，但在呼叫方的 context 中執行，使用呼叫方的 storage 和 msg.sender。這就是為什麼 Proxy 可以「借用」Implementation 的邏輯但保留自己的狀態。

**`staticcall`** 是只讀版的 call。它保證被呼叫的函數不會修改任何狀態。`view` 函數在外部呼叫時就是使用 staticcall。

```solidity
contract LowLevelCalls {
    // call 範例：呼叫未知介面的合約
    function callExternal(address target, bytes calldata data)
        external returns (bool, bytes memory)
    {
        (bool success, bytes memory result) = target.call(data);

        // 必須檢查 success！
        // 不檢查 = 靜默失敗 = 資金損失
        require(success, "call failed");

        return (success, result);
    }

    // delegatecall 範例（Proxy 模式核心）
    fallback() external payable {
        address impl = _getImplementation();

        assembly {
            // 複製 calldata
            calldatacopy(0, 0, calldatasize())

            // delegatecall 到 implementation
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)

            // 複製返回資料
            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
```

**常見陷阱**：底層呼叫失敗時不會自動 revert，而是返回 `success = false`。如果忘記檢查 success，合約會繼續執行後續邏輯，可能導致嚴重的狀態不一致。

### 8.3.4 主—從式可升級合約 `P1`

主從模式可隔離邏輯與配置，但需清楚權限邊界。

主從式（Master-Slave）升級模式是一種相對簡單的升級策略。主合約（Master）持有核心狀態和控制邏輯，從合約（Slave）實作具體的業務邏輯。升級時，部署新的從合約，然後更新主合約中的從合約地址即可。

```solidity
// 主合約：持有狀態和路由邏輯
contract Master {
    address public owner;
    address public calculator;  // 可替換的從合約

    mapping(address => uint256) public balances;

    function setCalculator(address newCalc) external {
        require(msg.sender == owner);
        calculator = newCalc;
    }

    function calculateReward(address user) external view returns (uint256) {
        // 將計算邏輯委託給從合約
        return ICalculator(calculator).compute(balances[user]);
    }
}

// 從合約 V1
contract CalculatorV1 is ICalculator {
    function compute(uint256 balance) external pure returns (uint256) {
        return balance * 5 / 100;  // 5% 獎勵
    }
}

// 從合約 V2（升級後）
contract CalculatorV2 is ICalculator {
    function compute(uint256 balance) external pure returns (uint256) {
        if (balance > 100 ether) return balance * 8 / 100;  // 大戶 8%
        return balance * 5 / 100;  // 一般 5%
    }
}
```

這種模式的優勢是簡單直觀，但缺點是只能升級被隔離出去的邏輯，無法修改主合約本身的程式碼。對於需要更靈活升級能力的場景，應該使用完整的 Proxy 模式。

### 8.3.5 代理程式—儲存式可升級合約 `P0`

Proxy 模式關鍵：
- storage layout 不可破壞
- initializer 只能執行一次
- 升級權限需多簽與延遲

Proxy 模式是目前業界最主流的合約升級方案。OpenZeppelin 提供了三種 Proxy 實作：Transparent Proxy、UUPS（Universal Upgradeable Proxy Standard）、和 Beacon Proxy。

**Transparent Proxy** 是最早也最廣泛使用的 Proxy 模式。它的核心概念是：admin 呼叫 Proxy 時會執行管理函數（如 upgrade），其他人呼叫時會 delegatecall 到 implementation。

**UUPS** 是更新的標準（ERC-1822），升級邏輯放在 implementation 合約中而非 proxy 中。優勢是 proxy 合約更簡單、部署更便宜。

```solidity
// UUPS 可升級合約範例（使用 OpenZeppelin）
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract VaultV1 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    mapping(address => uint256) public balances;
    uint256 public totalDeposits;

    // 不能用 constructor！用 initialize 代替
    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        totalDeposits += msg.value;
    }

    // UUPS: 升級授權函數
    function _authorizeUpgrade(address newImplementation)
        internal override onlyOwner {}
}

// 升級版本 V2
contract VaultV2 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // 必須保留 V1 的所有狀態變數，順序不可變
    mapping(address => uint256) public balances;
    uint256 public totalDeposits;

    // 新增狀態變數只能加在最後面
    uint256 public withdrawalFee;  // 新功能：提款手續費

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        totalDeposits += msg.value;
    }

    // 新增函數
    function setWithdrawalFee(uint256 fee) external onlyOwner {
        withdrawalFee = fee;
    }

    function _authorizeUpgrade(address newImplementation)
        internal override onlyOwner {}
}
```

**Storage Layout 的黃金規則**：
1. 不能刪除已有的狀態變數
2. 不能改變已有狀態變數的順序
3. 不能改變已有狀態變數的型別
4. 新增的狀態變數只能加在最後面
5. 如果使用繼承，不能在父合約中插入新的狀態變數

```text
Storage Layout 正確升級範例：

V1 Layout:                    V2 Layout（正確）:
┌─── slot 0: balances ───┐    ┌─── slot 0: balances ───┐
├─── slot 1: totalDep ───┤    ├─── slot 1: totalDep ───┤
└────────────────────────┘    ├─── slot 2: fee ────────┤  <── 新增在最後
                               └────────────────────────┘

V2 Layout（錯誤！）:
┌─── slot 0: fee ────────┐  <── 插入在前面，破壞了原有佈局！
├─── slot 1: balances ───┤      balances 讀到的值是 totalDep
├─── slot 2: totalDep ───┤      totalDep 讀到的值是 0
└────────────────────────┘
```

**Initializer 只能執行一次**：由於 Proxy 合約不能使用 constructor（constructor 是在部署時執行的，但 Proxy 的邏輯是 delegatecall 來的），初始化邏輯必須放在 `initialize` 函數中，並搭配 `initializer` modifier 確保它只能被呼叫一次。如果忘記加這個保護，任何人都可以重新初始化合約，奪取管理權限。

## 8.4 合約開發最佳實踐 `P0`

### 8.4.1 最佳實務概述 `P0`

- 權限最小化
- 事件完整記錄
- 失敗可回滾
- 測試先行

這四條原則看起來簡單，但在實際開發中經常被忽略。讓我們逐一深入探討。

**權限最小化（Principle of Least Privilege）** 意味著每個函數、每個角色只應該擁有完成其任務所需的最小權限。不要給一個只需要暫停合約的 admin 同時擁有提取所有資金的權限。OpenZeppelin 的 AccessControl 合約提供了基於角色的權限管理，比單一的 `onlyOwner` 更靈活。

```solidity
import "@openzeppelin/contracts/access/AccessControl.sol";

contract SecureVault is AccessControl {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant WITHDRAWER_ROLE = keccak256("WITHDRAWER_ROLE");

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // 不同角色分開授權，避免單一私鑰掌控一切
    }

    function pause() external onlyRole(PAUSER_ROLE) { ... }
    function emergencyWithdraw() external onlyRole(WITHDRAWER_ROLE) { ... }
}
```

**事件完整記錄** 是合約可審計性的基礎。每一個修改狀態的操作都應該 emit 對應的事件，包括操作者、操作內容、操作結果。這不僅是最佳實踐，在某些場景下（如 token 合約）甚至是標準要求。事件也是 DApp 前端和索引服務（The Graph、Dune Analytics）的資料來源。

**失敗可回滾** 意味著合約的任何操作都應該是原子性的——要麼全部成功，要麼全部回滾。Solidity 的 revert 機制天然支持這一點，但在涉及多個外部呼叫的複雜操作中，需要特別注意部分成功的情況。

**測試先行（Test First）** 在智能合約開發中比傳統軟體更加重要。一個好的測試套件應該包括正常路徑測試、邊界條件測試、權限測試（確認未授權用戶被拒絕）、以及 fuzz testing。

### 8.4.2 工廠模式 `P1`

用工廠合約批量部署同類合約，提高一致性。

工廠模式（Factory Pattern）是當你需要部署多個相同類型合約時的標準做法。例如，Uniswap 的 Factory 合約負責為每一個 token pair 部署一個獨立的 Pool 合約。

```solidity
contract PoolFactory {
    mapping(address => mapping(address => address)) public getPool;
    address[] public allPools;

    event PoolCreated(address indexed token0, address indexed token1, address pool);

    function createPool(address tokenA, address tokenB) external returns (address) {
        require(tokenA != tokenB, "identical tokens");
        require(getPool[tokenA][tokenB] == address(0), "pool exists");

        // 使用 CREATE2 確保地址可預測
        bytes32 salt = keccak256(abi.encodePacked(tokenA, tokenB));
        Pool pool = new Pool{salt: salt}(tokenA, tokenB);

        getPool[tokenA][tokenB] = address(pool);
        getPool[tokenB][tokenA] = address(pool);
        allPools.push(address(pool));

        emit PoolCreated(tokenA, tokenB, address(pool));
        return address(pool);
    }
}
```

使用 `CREATE2` 的優勢是合約地址可以在部署前就計算出來，這在許多 DeFi 場景中很有用——例如，前端可以在 Pool 被創建之前就顯示預期的 Pool 地址。

### 8.4.3 儲存註冊表模式 `P1`

中心註冊表管理版本、地址與參數，利於治理。

Registry Pattern 適用於需要管理多個合約地址或配置參數的系統。一個中心化的 Registry 合約儲存所有相關合約的地址和版本資訊，其他合約透過查詢 Registry 來獲取最新的地址。

```solidity
contract Registry {
    address public owner;

    // 名稱 -> 版本 -> 地址
    mapping(bytes32 => mapping(uint256 => address)) public contracts;
    mapping(bytes32 => uint256) public currentVersion;

    event ContractRegistered(bytes32 indexed name, uint256 version, address addr);

    function register(string calldata name, address addr) external {
        require(msg.sender == owner);
        bytes32 key = keccak256(abi.encodePacked(name));
        uint256 version = ++currentVersion[key];
        contracts[key][version] = addr;
        emit ContractRegistered(key, version, addr);
    }

    function getContract(string calldata name) external view returns (address) {
        bytes32 key = keccak256(abi.encodePacked(name));
        return contracts[key][currentVersion[key]];
    }
}

// 其他合約透過 Registry 獲取依賴
contract LendingPool {
    Registry public registry;

    function getPriceOracle() internal view returns (IPriceOracle) {
        address oracle = registry.getContract("PriceOracle");
        return IPriceOracle(oracle);
    }
}
```

Registry 模式的好處是：升級某個子系統時，只需要在 Registry 中更新地址，所有依賴它的合約都會自動使用新版本。但缺點是引入了中心化的依賴——如果 Registry 的 owner 被盜，攻擊者可以將合約指向惡意實作。因此 Registry 的管理權限也需要多簽和時間鎖保護。

### 8.4.4 遍歷表疊代器 `P1`

避免鏈上大迴圈，採分批與游標式遍歷。

在鏈上遍歷大型資料集是一個常見但危險的操作。如果資料集的大小不受限制，遍歷的 gas 消耗最終會超過區塊 gas 上限，導致函數永久無法執行。這是一種 DoS 攻擊向量。

```solidity
contract PaginatedIterator {
    address[] public users;

    // 錯誤做法：無界迴圈
    function distributeRewardsBAD() external {
        // 如果 users 有 10000 個，可能超過 gas 上限
        for (uint256 i; i < users.length; i++) {
            _sendReward(users[i]);
        }
    }

    // 正確做法：分批處理
    function distributeRewards(uint256 startIndex, uint256 batchSize) external {
        uint256 end = startIndex + batchSize;
        if (end > users.length) end = users.length;

        for (uint256 i = startIndex; i < end; i++) {
            _sendReward(users[i]);
        }
    }

    // 更好的做法：使用 Merkle Proof + Claim 模式
    // 不需要遍歷，使用者自己來領取
    bytes32 public merkleRoot;

    function claimReward(
        uint256 amount,
        bytes32[] calldata proof
    ) external {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        require(MerkleProof.verify(proof, merkleRoot, leaf), "invalid proof");
        // 發放獎勵...
    }
}
```

**Merkle Proof + Claim 模式** 是大規模空投或獎勵分發的最佳實踐。運營方在鏈下計算好每個使用者的獎勵金額，構建 Merkle Tree，將 root 存到鏈上。使用者提供 Merkle Proof 來領取自己的獎勵。這種模式完全避免了鏈上遍歷，gas 成本固定且低廉。

### 8.4.5 避免重入攻擊 `P0`

防禦組合：
- CEI
- reentrancy guard
- pull payment

重入攻擊（Reentrancy Attack）是智能合約最著名的安全漏洞，2016 年的 The DAO 被盜事件就是因為這個漏洞。理解重入攻擊的原理和防禦方法，是每個智能合約開發者的必修課。

**攻擊原理**：當合約 A 呼叫合約 B（例如轉帳 ETH）時，B 的 `receive` 或 `fallback` 函數會被觸發。如果 B 在這個函數中回呼 A 的某個函數（例如再次提款），而 A 在第一次呼叫中還沒有更新狀態（如扣除餘額），B 就可以重複提款。

```text
重入攻擊流程：

Attacker                          Vulnerable Contract
   │                                     │
   │  1. withdraw(1 ETH)                 │
   │ ──────────────────────────────────> │
   │                                     │ check: balance[attacker] >= 1 ETH ✓
   │                                     │ send 1 ETH to attacker
   │  2. receive() { withdraw(1 ETH) }  │ <── 還沒扣除餘額！
   │ ──────────────────────────────────> │
   │                                     │ check: balance[attacker] >= 1 ETH ✓（還沒扣！）
   │                                     │ send 1 ETH to attacker
   │  3. receive() { withdraw(1 ETH) }  │ <── 還是沒扣！
   │ ──────────────────────────────────> │
   │                                     │ ... 重複直到合約餘額為零
```

**三層防禦組合**：

```solidity
contract SecureVault {
    mapping(address => uint256) public balances;
    bool private _locked;

    // 防禦 1: Reentrancy Guard
    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    // 防禦 2: CEI (Checks-Effects-Interactions)
    function withdraw(uint256 amount) external nonReentrant {
        // Checks
        require(balances[msg.sender] >= amount, "insufficient");

        // Effects（先更新狀態）
        balances[msg.sender] -= amount;

        // Interactions（最後才做外部呼叫）
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }

    // 防禦 3: Pull Payment（最安全）
    mapping(address => uint256) public pendingWithdrawals;

    function requestWithdrawal(uint256 amount) external {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        pendingWithdrawals[msg.sender] += amount;
    }

    function claimWithdrawal() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0);
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
    }
}
```

**實務建議**：在大多數場景中，CEI + ReentrancyGuard 的組合就足夠了。Pull Payment 主要用在拍賣、空投等需要向多人退款的場景。

### 8.4.6 警惕外部合約調用 `P0`

外部調用要當成不可信：
- 可能回滾
- 可能耗盡 gas
- 可能惡意 callback

外部合約呼叫是智能合約安全的重災區。每一次呼叫外部合約，都相當於把控制權暫時交給了一段你不知道內容的程式碼。

**可能回滾**：被呼叫的合約可能無條件 revert，導致呼叫方的整個交易失敗。如果你的邏輯依賴外部呼叫的成功，需要有備用方案。

**可能耗盡 gas**：被呼叫的合約可能執行大量計算，消耗掉分配給它的所有 gas。在 Solidity 中，外部呼叫預設會轉發除 1/64 外的所有剩餘 gas。

**可能惡意 callback**：如前面討論的重入攻擊，被呼叫的合約可能在 callback 中回呼你的合約。

```solidity
// 安全的外部呼叫模式
contract SafeExternalCall {
    // 1. 使用 try/catch 處理可能失敗的呼叫
    function safeTokenTransfer(IERC20 token, address to, uint256 amount)
        internal returns (bool)
    {
        try token.transfer(to, amount) returns (bool success) {
            return success;
        } catch {
            // 記錄失敗，不讓整個交易 revert
            emit TransferFailed(address(token), to, amount);
            return false;
        }
    }

    // 2. 限制外部呼叫的 gas
    function limitedGasCall(address target, bytes calldata data)
        external returns (bool)
    {
        // 只給 50000 gas，防止被消耗太多
        (bool ok, ) = target.call{gas: 50000}(data);
        return ok;
    }

    // 3. 使用 deadline 防止交易被延遲執行
    function swapWithDeadline(
        address pool,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external {
        require(block.timestamp <= deadline, "expired");
        // ... 執行 swap
    }
}
```

## 8.5 Python與智能合約調用 `P0`

### 8.5.1 RPC原理分析 `P0`

RPC 是節點對外接口，典型方法：
- `eth_call`
- `eth_estimateGas`
- `eth_sendRawTransaction`

JSON-RPC 是 Ethereum 節點對外提供服務的標準協議。理解 RPC 的工作原理，是使用任何 SDK（包括 web3.py）的基礎。

```text
RPC 請求/回應流程：

Client (Python)                    Ethereum Node
     │                                 │
     │  POST /                         │
     │  {                              │
     │    "jsonrpc": "2.0",            │
     │    "method": "eth_getBalance",  │
     │    "params": ["0x...", "latest"]│
     │    "id": 1                      │
     │  }                              │
     │ ──────────────────────────────> │
     │                                 │  查詢鏈上狀態
     │                                 │
     │  {                              │
     │    "jsonrpc": "2.0",            │
     │    "result": "0xDE0B6B3A...",   │
     │    "id": 1                      │
     │  }                              │
     │ <────────────────────────────── │
```

**三種核心 RPC 方法的差異**：

1. **`eth_call`**：模擬執行一個交易但不實際提交到鏈上。用於讀取合約狀態（view/pure 函數）或模擬寫入操作的結果。不消耗 gas，不需要簽名。

2. **`eth_estimateGas`**：估算一筆交易需要多少 gas。節點會模擬執行交易並返回所需的 gas 量。注意：估算值可能不準確，因為鏈上狀態在估算和實際執行之間可能發生變化。

3. **`eth_sendRawTransaction`**：將一筆已簽名的交易提交到節點，由節點廣播到網路。這是唯一會實際修改鏈上狀態的 RPC 方法。

```python
import requests
import json

# 原始 RPC 呼叫範例（通常不需要手動做，SDK 會封裝）
def raw_rpc_call(rpc_url, method, params):
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": 1
    }
    response = requests.post(rpc_url, json=payload)
    result = response.json()

    if "error" in result:
        raise Exception(f"RPC Error: {result['error']}")
    return result["result"]

# 查詢餘額
balance_hex = raw_rpc_call(
    "https://mainnet.infura.io/v3/YOUR_KEY",
    "eth_getBalance",
    ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "latest"]
)
balance_wei = int(balance_hex, 16)
print(f"Balance: {balance_wei / 1e18} ETH")
```

### 8.5.2 Python-SDK簡介 `P1`

常用 `web3.py`：
- 連節點
- 載 ABI
- 發交易
- 查回執

web3.py 是 Python 生態中最成熟的 Ethereum 互動庫。它封裝了 JSON-RPC 呼叫，提供了高階 API 來與節點互動、部署合約、呼叫合約函數。

```python
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

# 連接節點（支援 HTTP、WebSocket、IPC）
w3 = Web3(Web3.HTTPProvider("https://mainnet.infura.io/v3/YOUR_KEY"))

# 如果連接 PoA 鏈（如 BSC），需要注入 middleware
# w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

# 檢查連線狀態
print(f"Connected: {w3.is_connected()}")
print(f"Chain ID: {w3.eth.chain_id}")
print(f"Latest Block: {w3.eth.block_number}")

# 查詢 ETH 餘額
address = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
balance = w3.eth.get_balance(address)
print(f"Balance: {w3.from_wei(balance, 'ether')} ETH")

# 載入合約（需要 ABI 和地址）
import json
with open("MyContract.json") as f:
    abi = json.load(f)["abi"]

contract = w3.eth.contract(
    address="0x1234567890abcdef...",
    abi=abi
)

# 讀取合約狀態（view 函數，不需簽名）
total_supply = contract.functions.totalSupply().call()
print(f"Total Supply: {total_supply}")
```

### 8.5.3 Python呼叫智能合約步驟 `P0`

1. 建立 provider
2. 載入 ABI + address
3. 建 call/tx
4. 簽名與發送

完整的合約呼叫流程可以分為「讀取」和「寫入」兩種場景，寫入需要額外的簽名和 gas 處理。

```python
from web3 import Web3
import json

# === 設定 ===
RPC_URL = "https://sepolia.infura.io/v3/YOUR_KEY"
PRIVATE_KEY = "0x..."  # 永遠不要硬編碼在程式中！
CONTRACT_ADDRESS = "0x..."

w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = w3.eth.account.from_key(PRIVATE_KEY)

# 載入 ABI
with open("ERC20.json") as f:
    abi = json.load(f)

contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=abi)

# === 讀取操作（不需 gas）===
def read_balance(address: str) -> int:
    """查詢 token 餘額"""
    return contract.functions.balanceOf(address).call()

# === 寫入操作（需要 gas 和簽名）===
def transfer_token(to: str, amount: int) -> str:
    """轉帳 token"""
    # 1. 構建交易
    tx = contract.functions.transfer(to, amount).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 100000,  # 預估 gas
        "maxFeePerGas": w3.to_wei("30", "gwei"),
        "maxPriorityFeePerGas": w3.to_wei("2", "gwei"),
        "chainId": w3.eth.chain_id,
    })

    # 2. 簽名
    signed_tx = account.sign_transaction(tx)

    # 3. 發送
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)

    # 4. 等待確認
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    # 5. 檢查狀態
    if receipt["status"] != 1:
        raise Exception(f"Transaction failed: {tx_hash.hex()}")

    return tx_hash.hex()

# === 使用範例 ===
balance = read_balance("0xABCDEF...")
print(f"Balance: {balance}")

tx_hash = transfer_token("0xABCDEF...", 1000 * 10**18)
print(f"Transfer TX: {tx_hash}")
```

### 8.5.4 節點連接 `P0`

建議：
- 主備 RPC
- 請求重試與超時
- 連線健康檢查

在生產環境中，RPC 節點的可靠性直接影響到整個系統的穩定性。單一節點可能因為維護、過載、或網路問題而暫時不可用，因此必須實作容錯機制。

```python
from web3 import Web3
import time
from typing import List, Optional

class ResilientProvider:
    """帶有故障轉移和重試的 RPC Provider"""

    def __init__(self, rpc_urls: List[str], timeout: int = 10, max_retries: int = 3):
        self.providers = [Web3.HTTPProvider(url, request_kwargs={"timeout": timeout})
                          for url in rpc_urls]
        self.current_index = 0
        self.max_retries = max_retries

    def get_web3(self) -> Web3:
        """獲取可用的 Web3 實例"""
        for attempt in range(self.max_retries):
            for i in range(len(self.providers)):
                idx = (self.current_index + i) % len(self.providers)
                w3 = Web3(self.providers[idx])
                try:
                    if w3.is_connected():
                        self.current_index = idx
                        return w3
                except Exception:
                    continue
            time.sleep(1)  # 等待後重試
        raise ConnectionError("All RPC endpoints unavailable")

    def health_check(self) -> dict:
        """檢查所有節點的健康狀態"""
        results = {}
        for i, provider in enumerate(self.providers):
            w3 = Web3(provider)
            try:
                block = w3.eth.block_number
                results[f"node_{i}"] = {"status": "ok", "block": block}
            except Exception as e:
                results[f"node_{i}"] = {"status": "error", "error": str(e)}
        return results

# 使用範例
provider = ResilientProvider([
    "https://mainnet.infura.io/v3/KEY1",     # 主節點
    "https://eth-mainnet.alchemyapi.io/KEY2", # 備用節點
    "https://rpc.ankr.com/eth",               # 公共節點（備援）
])

w3 = provider.get_web3()
```

### 8.5.5 ABI分析與編譯 `P0`

ABI 是調用契約，版本漂移會導致調用錯誤。

ABI（Application Binary Interface）定義了合約的外部介面——包括函數名稱、參數型別、返回值型別、事件定義等。SDK 透過 ABI 來編碼 calldata（將人類可讀的函數呼叫轉換為 EVM 可理解的 bytes）和解碼返回值。

```python
# ABI 的結構範例
abi = [
    {
        "type": "function",
        "name": "transfer",
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"}
        ],
        "outputs": [
            {"name": "", "type": "bool"}
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "event",
        "name": "Transfer",
        "inputs": [
            {"name": "from", "type": "address", "indexed": True},
            {"name": "to", "type": "address", "indexed": True},
            {"name": "value", "type": "uint256", "indexed": False}
        ]
    }
]
```

**ABI 版本漂移** 是一個容易被忽略的風險。如果合約升級了（透過 Proxy），新版本可能新增或修改了函數簽名。如果 SDK 端還在使用舊版的 ABI，呼叫新增的函數會失敗，或者解碼返回值會出錯。

**最佳實踐**：
1. 將 ABI 與合約版本號一起管理
2. 從 Etherscan 或合約倉庫自動獲取最新 ABI
3. 在 SDK 端加入 ABI 版本檢查機制

```python
# 從已驗證的合約自動獲取 ABI
import requests

def get_abi_from_etherscan(contract_address: str, api_key: str) -> list:
    """從 Etherscan 獲取已驗證合約的 ABI"""
    url = f"https://api.etherscan.io/api"
    params = {
        "module": "contract",
        "action": "getabi",
        "address": contract_address,
        "apikey": api_key
    }
    resp = requests.get(url, params=params)
    data = resp.json()
    if data["status"] != "1":
        raise Exception(f"Failed to get ABI: {data['message']}")
    return json.loads(data["result"])
```

### 8.5.6 透過Python調用智能合約 `P0`

工程要點：
- nonce 競態控制
- gas 估算與上限保護
- 交易狀態追蹤（pending -> confirmed）

在生產環境中，透過 Python 呼叫智能合約需要處理很多邊界情況。以下是一個完整的生產級交易發送模組：

```python
from web3 import Web3
from web3.exceptions import TransactionNotFound
import threading
import time

class TransactionManager:
    """生產級交易管理器"""

    def __init__(self, w3: Web3, private_key: str):
        self.w3 = w3
        self.account = w3.eth.account.from_key(private_key)
        self._nonce_lock = threading.Lock()
        self._local_nonce = None

    def _get_nonce(self) -> int:
        """線程安全的 nonce 管理"""
        with self._nonce_lock:
            chain_nonce = self.w3.eth.get_transaction_count(
                self.account.address, "pending"
            )
            if self._local_nonce is None or chain_nonce > self._local_nonce:
                self._local_nonce = chain_nonce
            else:
                self._local_nonce += 1
            return self._local_nonce

    def _estimate_gas_with_buffer(self, tx: dict) -> int:
        """估算 gas 並加上 20% 安全緩衝"""
        estimated = self.w3.eth.estimate_gas(tx)
        return int(estimated * 1.2)

    def send_transaction(self, tx: dict, timeout: int = 300) -> dict:
        """發送交易並等待確認"""
        # 填充缺少的欄位
        tx["from"] = self.account.address
        tx["nonce"] = self._get_nonce()
        tx["chainId"] = self.w3.eth.chain_id

        if "gas" not in tx:
            tx["gas"] = self._estimate_gas_with_buffer(tx)

        if "maxFeePerGas" not in tx:
            base_fee = self.w3.eth.get_block("latest")["baseFeePerGas"]
            tx["maxFeePerGas"] = base_fee * 2
            tx["maxPriorityFeePerGas"] = self.w3.to_wei("2", "gwei")

        # 簽名並發送
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)

        # 等待確認
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)

        if receipt["status"] != 1:
            raise Exception(
                f"Transaction reverted: {tx_hash.hex()}, "
                f"gas used: {receipt['gasUsed']}"
            )

        return {
            "tx_hash": tx_hash.hex(),
            "block_number": receipt["blockNumber"],
            "gas_used": receipt["gasUsed"],
            "status": "confirmed"
        }

    def call_contract_function(self, contract, func_name: str, *args, **kwargs):
        """呼叫合約函數（寫入操作）"""
        func = getattr(contract.functions, func_name)
        tx = func(*args).build_transaction({
            "from": self.account.address,
            "value": kwargs.get("value", 0),
        })
        return self.send_transaction(tx)

# 使用範例
tx_mgr = TransactionManager(w3, PRIVATE_KEY)

# 呼叫合約函數
result = tx_mgr.call_contract_function(
    contract, "transfer",
    "0xRecipient...", 1000 * 10**18
)
print(f"TX confirmed in block {result['block_number']}")
```

**Nonce 管理** 是多線程/多進程環境中最容易出問題的地方。如果兩個交易使用了相同的 nonce，只有一個會被接受。上面的 `TransactionManager` 使用了線程鎖來確保 nonce 的遞增是原子的。在更高並發的場景中，可能需要使用 Redis 等外部存儲來管理全局 nonce。

## 8.6 章節回顧與工程實戰心法

本章涵蓋了從 ERC 標準到可升級架構、從安全模式到 Python SDK 整合的進階主題。以下是需要內化的核心要點：

**標準優先**。ERC 標準不是建議，而是互操作性的基石。使用 OpenZeppelin 的實作作為基底，只覆寫真正需要自訂的部分。自行從頭實作標準不僅浪費時間，還會引入相容性和安全問題。

**升級是一把雙刃劍**。可升級合約解決了「不可變但有 bug」的困境，但同時引入了新的攻擊面。升級權限必須有嚴格的治理機制（多簽 + 時間鎖 + 社群審查）。Storage layout 的兼容性問題是最常見的升級事故原因，務必使用 OpenZeppelin 的升級安全插件來檢查。

**安全是層層疊加的**。重入攻擊不是只靠 ReentrancyGuard 就能防住的——CEI 模式、Pull Payment、外部呼叫最小化，這些都需要同時運用。安全不是一個 checkbox，而是一種貫穿整個開發流程的思維方式。

**SDK 端也是攻擊面**。很多安全分析只關注合約端，但 Python SDK 端同樣存在風險：私鑰管理、nonce 競態、RPC 節點劫持、交易回執驗證等。一個完整的安全策略必須涵蓋從 SDK 到合約到鏈上的整個鏈路。

**監控和審計不是可選的**。合約部署只是開始，持續的鏈上監控（異常交易偵測、大額轉帳告警、治理操作追蹤）和定期的安全審計同樣重要。

## 白話總結

這一章就是把你從「會寫合約」帶到「能上線合約」的距離。首先，ERC 標準就像是區塊鏈世界的 USB 接口，你的 token 只有遵守 ERC-20 標準，錢包和交易所才認得它，所以不要自己亂搞。然後是可升級合約，原理就是把邏輯和資料分開放——Proxy 存資料，Implementation 跑邏輯，升級就是換 Implementation。但是千萬注意 storage layout 不能亂動，新變數只能加在最後面，不然整個狀態就亂掉了。安全方面最重要的就是防重入：先改狀態再呼叫外部合約（CEI 模式），加上 ReentrancyGuard 雙重保險。至於用 Python 呼叫合約，web3.py 幫你搞定了大部分的事情，但你需要特別注意 nonce 管理（多線程下會打架）和 gas 估算（記得加 buffer）。總結來說，能寫出能跑的合約只是第一步，真正的挑戰是安全性、可升級性和可維護性，這些才是決定你的合約能不能真正上線的關鍵。
