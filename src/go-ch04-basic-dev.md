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

常見坑：
- Solidity 版本與 OpenZeppelin 套件版本不匹配
- 本地鏈 chain id 與簽名 chain id 不一致

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

### 4.1.4 什麼是內建對象 `P1`

常見內建上下文：
- `msg.sender`, `msg.value`, `msg.data`
- `tx.origin`（通常不建議用於授權）
- `block.timestamp`, `block.number`

### 4.1.5 智能合約的函數 `P0`

函數可見性：
- `public`, `external`, `internal`, `private`

函數狀態修飾：
- `view`: 不改狀態
- `pure`: 不讀不改狀態
- `payable`: 可收 ETH

工程建議：
- 對外函數先做參數驗證
- 使用 custom error 降 gas

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

### 4.1.7 巧用複合類型 `P0`

重點：
- `struct` 建模
- `mapping(address => User)` 儲存帳戶資料
- `array` 做可遍歷索引

常見模式：
- mapping 存資料 + array 存 key
- 避免在鏈上做大型遍歷

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

### 4.1.9 經典智能合約案例 `P1`

建議三個練習案例：
- 紅包合約：多收款人分配
- 銀行合約：存取款 + 日誌
- 拍賣合約：出價與結算

### 4.1.10 智能合約開發技巧 `P0`

高頻最佳實務：
- Checks-Effects-Interactions
- Pull over Push（提款模式）
- 權限最小化
- 重要參數上鏈事件紀錄
- 導入 fuzz/invariant 測試

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

### 4.2.3 調用合約時如何簽名 `P0`

簽名關鍵：
- 交易欄位完整（nonce, gas, to, data, chain id）
- 選對 signer（EIP-155 / 1559）
- 私鑰僅在簽名端使用

常見坑：
- `invalid sender` 多半是 chain id 或 signer 類型錯
- nonce 重複導致交易取代或失敗

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

常見坑：
- websocket 斷線沒重連
- 只訂閱新事件，漏補歷史區塊

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

## 本章總結

你已具備：
- Solidity 開發基礎
- Go 調用合約完整鏈路
- 交易簽名與 event 訂閱能力
