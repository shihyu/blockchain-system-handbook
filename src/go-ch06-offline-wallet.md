# 第6章 Go 語言離線錢包開發

本章目標是做出「簽名在離線端、查詢在在線端」的實務錢包架構。

## 6.1 區塊鏈錢包原理

### 6.1.1 區塊鏈錢包的核心原理 `P0`

錢包不是資產保險箱，而是：
- 金鑰管理器
- 簽名器
- 地址與交易組裝工具

核心分層：

```text
Key Management -> Tx Builder -> Signer -> Broadcaster -> Index/Query
```

設計原則：
- 私鑰永不出簽名邊界
- 查詢與簽名分離
- 所有交易可重現與可審計

很多初學者誤以為錢包「儲存了加密貨幣」。事實上，資產存在區塊鏈上——準確地說，是存在於 UTXO 集合或帳戶狀態中。錢包的真正作用是管理私鑰，並用私鑰對交易進行簽名。如果你失去了私鑰，你並沒有「丟失」了幣——幣還在區塊鏈上，你只是永遠無法再移動它們了。

離線錢包（也稱為冷錢包）的核心設計思想是「簽名環境與網路完全隔離」。這意味著私鑰所在的機器永遠不連接網際網路，攻擊者即使入侵了在線系統，也無法觸及私鑰。交易的組裝可以在在線端完成（因為需要查詢餘額、nonce、gas price 等資訊），但最終的簽名必須在離線端執行。

```text
離線錢包架構：

┌────────────────────────────┐     ┌────────────────────────────┐
│        在線端 (Hot)         │     │       離線端 (Cold)         │
│                            │     │                            │
│  ┌──────────────────────┐  │     │  ┌──────────────────────┐  │
│  │ 查詢餘額 / UTXO      │  │     │  │ 私鑰管理             │  │
│  │ 查詢 nonce / gas     │  │     │  │ (加密儲存)           │  │
│  │ 組裝交易 (unsigned)  │  │     │  └──────────┬───────────┘  │
│  └──────────┬───────────┘  │     │             │              │
│             │              │     │             v              │
│             │  未簽名交易   │     │  ┌──────────────────────┐  │
│             │ ──────────>  │ USB │  │ 驗證交易內容          │  │
│             │              │ / QR│  │ 簽名                  │  │
│             │  已簽名交易   │     │  └──────────┬───────────┘  │
│             │ <──────────  │     │             │              │
│             v              │     │             v              │
│  ┌──────────────────────┐  │     │  ┌──────────────────────┐  │
│  │ 廣播交易             │  │     │  │ 產生已簽名交易        │  │
│  │ 監聽確認             │  │     │  │ (不含私鑰)           │  │
│  └──────────────────────┘  │     │  └──────────────────────┘  │
└────────────────────────────┘     └────────────────────────────┘
          有網路連線                        無網路連線
```

在線端和離線端之間的資料傳輸方式有幾種選擇：USB 隨身碟、QR code 掃描、或者藍牙（如 Ledger Nano X）。最安全的方式是 QR code，因為它是單向的、可視的——你能用肉眼確認傳輸的內容不包含私鑰。

真實案例：2022 年 Ronin Bridge 被盜 6.25 億美元，根本原因是 9 個驗證者中有 5 個的私鑰被駭客取得——因為這些私鑰都在聯網的伺服器上。如果使用離線簽名架構，即使伺服器被入侵，攻擊者也無法動用資金。

### 6.1.2 助記詞如何生成與驗證 `P0`

建議標準：
- BIP-39（助記詞）
- BIP-32（HD 主私鑰）
- BIP-44（路徑規範）

流程：
1. 生成熵
2. 轉助記詞
3. 助記詞 + passphrase 推導 seed
4. seed 推導主私鑰與子私鑰

助記詞（Mnemonic）是私鑰的人類友好表示形式。BIP-39 定義了從隨機熵到 12/24 個英文單詞的轉換規則。這些單詞來自一個固定的 2048 個詞的字典，每個詞編碼 11 bits 的資訊。12 個詞的助記詞對應 128 bits 的熵（加上 4 bits checksum），安全性與 128 bit AES 等效。

```text
助記詞生成流程（BIP-39）：

1. 生成隨機熵（128/160/192/224/256 bits）
   例如 128 bits: 0c1e24e5917779d297e14d45f14e1a1a

2. 計算 checksum（SHA256 前 N bits，N = 熵長度 / 32）
   128 bits 熵 -> 4 bits checksum

3. 將熵 + checksum 分成 11-bit 段
   132 bits / 11 = 12 組

4. 每組映射到 BIP-39 字典中的一個單詞
   army van defense carry jealous true
   garbage claim echo media make crunch

5. 助記詞 + 可選 passphrase 通過 PBKDF2 推導 512-bit seed
   PBKDF2(mnemonic, "mnemonic" + passphrase, 2048, 64, SHA512)
```

HD（Hierarchical Deterministic）錢包是 BIP-32 定義的金鑰衍生架構。從一個 master seed 可以推導出無限數量的子私鑰，而且整個衍生過程是確定性的——相同的 seed 永遠產生相同的金鑰樹。這意味著你只需要備份一組助記詞，就能恢復所有帳戶。

BIP-44 進一步定義了衍生路徑的標準格式：`m / purpose' / coin_type' / account' / change / address_index`。例如 Bitcoin 的第一個地址路徑是 `m/44'/0'/0'/0/0`，Ethereum 是 `m/44'/60'/0'/0/0`。這個標準確保了不同錢包軟體之間的相容性——在 MetaMask 生成的助記詞可以在 Trust Wallet 中恢復。

```go
// 使用 go-bip39 和 go-bip32 生成 HD 錢包
import (
	"github.com/tyler-smith/go-bip39"
	"github.com/tyler-smith/go-bip32"
)

func GenerateHDWallet() (*HDWallet, error) {
	// 1. 生成 128 bits 熵 -> 12 個助記詞
	entropy, err := bip39.NewEntropy(128)
	if err != nil {
		return nil, err
	}

	// 2. 熵轉助記詞
	mnemonic, err := bip39.NewMnemonic(entropy)
	if err != nil {
		return nil, err
	}
	// mnemonic 類似: "army van defense carry jealous true ..."

	// 3. 助記詞 + passphrase 推導 seed
	seed := bip39.NewSeed(mnemonic, "optional-passphrase")

	// 4. seed 推導 master key
	masterKey, err := bip32.NewMasterKey(seed)
	if err != nil {
		return nil, err
	}

	// 5. 按 BIP-44 路徑衍生子金鑰
	// m/44'/60'/0'/0/0 (Ethereum 第一個地址)
	purpose, _ := masterKey.NewChildKey(bip32.FirstHardenedChild + 44)
	coinType, _ := purpose.NewChildKey(bip32.FirstHardenedChild + 60)
	account, _ := coinType.NewChildKey(bip32.FirstHardenedChild + 0)
	change, _ := account.NewChildKey(0)
	addressKey, _ := change.NewChildKey(0)

	return &HDWallet{
		Mnemonic:  mnemonic,
		MasterKey: masterKey,
		FirstKey:  addressKey,
	}, nil
}
```

```text
HD 錢包衍生樹：

                     Master Key (m)
                          |
              ┌───────────┼───────────┐
              |           |           |
         m/44'/0'    m/44'/60'   m/44'/501'
         (Bitcoin)   (Ethereum)  (Solana)
              |           |
         ┌────┴────┐      |
         |         |      |
     m/.../0'  m/.../1'  m/.../0'
     (Account 0) (Account 1)  (Account 0)
         |
    ┌────┴────┐
    |         |
   0/0       0/1       1/0       1/1
  (外部0)   (外部1)   (找零0)   (找零1)

  外部地址 (change=0): 用於收款
  找零地址 (change=1): 用於交易找零
```

常見坑：
- 未檢查 checksum（某些第三方庫不驗證助記詞的 checksum，接受了無效的詞組）
- passphrase 遺失造成資產永久不可恢復（passphrase 是 seed 推導的一部分，忘記它等於忘記了私鑰）
- 在聯網設備上生成助記詞（應該在離線設備上生成，然後安全轉移）
- 衍生路徑不同的錢包軟體之間無法互相恢復（雖然 BIP-44 是標準，但有些錢包使用非標準路徑）

### 6.1.3 如何存儲私鑰 `P0`

推薦做法：
- 私鑰 at-rest 加密（如 AES-GCM）
- KDF（Argon2/scrypt）保護口令
- 記憶體中使用後清理
- 備份採多地分片或硬體介質

禁止做法：
- 私鑰明文寫 DB/日誌
- 私鑰透過 HTTP 傳輸
- 把助記詞截圖存聊天工具

私鑰存儲是錢包安全的最後一道防線。Ethereum 生態廣泛使用的 Keystore 格式（Web3 Secret Storage）提供了一個成熟的參考實作：用戶的口令通過 KDF（如 scrypt 或 Argon2）轉換成加密金鑰，然後用 AES-128-CTR 或 AES-256-GCM 加密私鑰。解密時需要同樣的口令和 KDF 參數。

```go
// 私鑰加密存儲的簡化實作
import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"golang.org/x/crypto/scrypt"
)

type EncryptedKey struct {
	CipherText []byte `json:"cipher_text"`
	Salt       []byte `json:"salt"`
	Nonce      []byte `json:"nonce"`
	N          int    `json:"n"`     // scrypt CPU/memory cost
	R          int    `json:"r"`     // scrypt block size
	P          int    `json:"p"`     // scrypt parallelism
}

// 加密私鑰
func EncryptPrivateKey(privKey []byte, passphrase string) (*EncryptedKey, error) {
	// 1. 生成隨機 salt
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}

	// 2. KDF：口令 + salt -> 加密金鑰
	// N=2^18, R=8, P=1 提供足夠的安全性（解密需要約 1 秒）
	key, err := scrypt.Key([]byte(passphrase), salt, 1<<18, 8, 1, 32)
	if err != nil {
		return nil, err
	}

	// 3. AES-256-GCM 加密
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}

	cipherText := gcm.Seal(nil, nonce, privKey, nil)

	// 4. 清理記憶體中的明文金鑰
	for i := range key {
		key[i] = 0
	}

	return &EncryptedKey{
		CipherText: cipherText,
		Salt:       salt,
		Nonce:      nonce,
		N:          1 << 18,
		R:          8,
		P:          1,
	}, nil
}

// 解密私鑰
func DecryptPrivateKey(encrypted *EncryptedKey, passphrase string) ([]byte, error) {
	key, err := scrypt.Key([]byte(passphrase), encrypted.Salt, encrypted.N, encrypted.R, encrypted.P, 32)
	if err != nil {
		return nil, err
	}
	defer func() {
		for i := range key {
			key[i] = 0
		}
	}()

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	return gcm.Open(nil, encrypted.Nonce, encrypted.CipherText, nil)
}
```

記憶體中的私鑰清理是容易被忽略的安全措施。Go 的 GC 不保證何時回收記憶體，未被覆蓋的私鑰可能長時間殘留在記憶體中。最佳做法是在使用完私鑰後立即用零覆蓋對應的 byte slice。雖然 Go 不像 C 那樣能完全控制記憶體，但主動清零比什麼都不做要安全得多。

```text
私鑰存儲安全等級對比：

Level 1 (最差): 明文存 DB / 環境變數 / 設定檔
Level 2: 加密存儲（AES-GCM + 口令）
Level 3: HSM / KMS（AWS KMS / Azure Key Vault）
Level 4: 離線冷儲存（紙錢包 / 硬體錢包 / 鋼板備份）
Level 5 (最佳): 多簽 + 離線 + 地理分散

生產系統至少要達到 Level 3。
```

備份策略也是私鑰管理的一部分。Shamir's Secret Sharing（SSS）允許將一個秘密分成 N 份，只要收集到 M 份就能恢復原始秘密（M <= N）。例如，將助記詞分成 5 份，任意 3 份即可恢復。這些分片分別存放在不同的地理位置或交給不同的信任方，確保單一分片洩漏不會導致資產被盜。

## 6.2 區塊鏈錢包核心功能實現

### 6.2.1 flag 使用與開發框架搭建 `P1`

CLI 建議命令：
- `wallet init`
- `wallet addr list`
- `wallet coin transfer`
- `wallet token transfer`
- `wallet tx query`

目錄建議：
- `cmd/`
- `internal/key`
- `internal/tx`
- `internal/rpc`
- `internal/store`

一個結構良好的 CLI 錢包不僅方便用戶使用，也方便自動化腳本整合。Go 的 `flag` 包適合簡單場景，但對於子命令式的 CLI（`wallet init`、`wallet transfer` 等），推薦使用 `cobra` 或 `urfave/cli`。

```text
錢包 CLI 架構：

wallet/
├── cmd/
│   ├── root.go          # cobra 根命令
│   ├── init.go          # wallet init
│   ├── address.go       # wallet addr list/new
│   ├── transfer.go      # wallet coin/token transfer
│   └── query.go         # wallet tx query
├── internal/
│   ├── key/
│   │   ├── keystore.go  # 加密存儲
│   │   ├── hd.go        # HD 衍生
│   │   └── signer.go    # 簽名接口
│   ├── tx/
│   │   ├── builder.go   # 交易組裝
│   │   ├── coin.go      # 原生幣轉帳
│   │   └── token.go     # ERC-20 轉帳
│   ├── rpc/
│   │   ├── client.go    # RPC 客戶端
│   │   └── retry.go     # 重試邏輯
│   └── store/
│       ├── db.go        # 本地資料庫
│       └── cache.go     # metadata 快取
├── go.mod
└── main.go
```

```go
// cobra 命令註冊範例
func NewRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:   "wallet",
		Short: "Blockchain wallet CLI",
	}

	root.AddCommand(
		newInitCmd(),
		newAddrCmd(),
		newTransferCmd(),
		newQueryCmd(),
	)
	return root
}

func newTransferCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "transfer",
		Short: "Transfer coins or tokens",
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "coin",
			Short: "Transfer native coin (ETH/BTC)",
			RunE:  runCoinTransfer,
		},
		&cobra.Command{
			Use:   "token",
			Short: "Transfer ERC-20 token",
			RunE:  runTokenTransfer,
		},
	)
	return cmd
}
```

### 6.2.2 錢包如何支持 Coin 轉移 `P0`

UTXO 鏈流程：
1. 查可用 UTXO
2. 選擇輸入與找零
3. 建交易
4. 離線簽名
5. 在線廣播

Account 鏈流程：
1. 查 nonce 與 gas
2. 建交易（to/value/data）
3. 離線簽名
4. 在線廣播

理解 UTXO 鏈（如 Bitcoin）和 Account 鏈（如 Ethereum）的轉帳流程差異，是錢包開發的基礎。兩者的核心差異在於狀態模型：UTXO 鏈需要選擇具體的「鈔票」來花費，Account 鏈只需要知道帳戶當前的 nonce。

```text
UTXO 鏈轉帳流程：                Account 鏈轉帳流程：

┌─────────────────┐             ┌─────────────────┐
│ 1. 查 UTXO 集   │             │ 1. 查 nonce     │
│    (在線端)      │             │    (在線端)      │
└────────┬────────┘             └────────┬────────┘
         │                               │
┌────────v────────┐             ┌────────v────────┐
│ 2. Coin Select  │             │ 2. 估算 gas     │
│    選擇輸入      │             │    (在線端)      │
│    計算找零      │             └────────┬────────┘
└────────┬────────┘                      │
         │                      ┌────────v────────┐
┌────────v────────┐             │ 3. 建交易       │
│ 3. 建未簽名交易  │             │    {to, value,  │
│    {inputs,      │             │     nonce, gas}  │
│     outputs}     │             └────────┬────────┘
└────────┬────────┘                      │
         │                               │
    ┌────v──────────────────────────v────┐
    │        4. 離線簽名                  │
    │     (Cold Wallet / HSM)             │
    └────┬──────────────────────────┬────┘
         │                               │
┌────────v────────┐             ┌────────v────────┐
│ 5. 廣播         │             │ 5. 廣播         │
│    (在線端)      │             │    (在線端)      │
└─────────────────┘             └─────────────────┘
```

```go
// Ethereum 原生幣轉帳（離線簽名模式）
func BuildUnsignedCoinTx(ctx context.Context, client *ethclient.Client,
	from, to common.Address, amount *big.Int) (*types.Transaction, error) {

	// 在線端：查詢必要資訊
	nonce, err := client.PendingNonceAt(ctx, from)
	if err != nil {
		return nil, fmt.Errorf("get nonce: %w", err)
	}

	chainID, err := client.ChainID(ctx)
	if err != nil {
		return nil, fmt.Errorf("get chain id: %w", err)
	}

	tipCap, err := client.SuggestGasTipCap(ctx)
	if err != nil {
		return nil, fmt.Errorf("suggest tip: %w", err)
	}

	header, err := client.HeaderByNumber(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("get header: %w", err)
	}

	feeCap := new(big.Int).Add(
		tipCap,
		new(big.Int).Mul(header.BaseFee, big.NewInt(2)),
	)

	// 建立未簽名交易
	tx := types.NewTx(&types.DynamicFeeTx{
		ChainID:   chainID,
		Nonce:     nonce,
		GasTipCap: tipCap,
		GasFeeCap: feeCap,
		Gas:       21000, // ETH 轉帳固定 21000 gas
		To:        &to,
		Value:     amount,
	})

	return tx, nil
}

// 離線端：簽名
func SignTxOffline(tx *types.Transaction, chainID *big.Int, privateKey *ecdsa.PrivateKey) (*types.Transaction, error) {
	signer := types.LatestSignerForChainID(chainID)
	signedTx, err := types.SignTx(tx, signer, privateKey)
	if err != nil {
		return nil, fmt.Errorf("sign tx: %w", err)
	}
	return signedTx, nil
}

// 在線端：廣播
func BroadcastSignedTx(ctx context.Context, client *ethclient.Client, signedTx *types.Transaction) error {
	return client.SendTransaction(ctx, signedTx)
}
```

### 6.2.3 錢包如何支持 Coin 查詢 `P0`

兩種方式：
- 直連節點 RPC
- 走索引服務 API

查詢策略：
- 即時餘額（pending + confirmed）
- 可花費餘額（按確認數門檻）

餘額查詢看似簡單，但在生產環境中有很多需要考慮的細節。「即時餘額」和「可花費餘額」的區別在於確認數：一筆交易被打包到區塊中（1 confirmation）不代表它是安全的，因為該區塊可能被 reorg 回滾。對於大額交易，通常需要等待 12-64 個確認才認為資金是「安全的」。

```go
// 餘額查詢（支持不同確認數）
type BalanceInfo struct {
	Pending   *big.Int // 包含 mempool 中的交易
	Latest    *big.Int // 最新區塊的餘額
	Safe      *big.Int // 安全確認數後的餘額（如 12 confirmations）
	Finalized *big.Int // 最終確認的餘額（如 64 confirmations）
}

func GetBalanceInfo(ctx context.Context, client *ethclient.Client, addr common.Address) (*BalanceInfo, error) {
	pending, err := client.PendingBalanceAt(ctx, addr)
	if err != nil {
		return nil, err
	}

	latest, err := client.BalanceAt(ctx, addr, nil) // nil = latest block
	if err != nil {
		return nil, err
	}

	// 安全餘額：最新區塊高度 - 12
	currentBlock, _ := client.BlockNumber(ctx)
	safeBlock := new(big.Int).SetUint64(currentBlock - 12)
	safe, err := client.BalanceAt(ctx, addr, safeBlock)
	if err != nil {
		return nil, err
	}

	return &BalanceInfo{
		Pending: pending,
		Latest:  latest,
		Safe:    safe,
	}, nil
}
```

對於 UTXO 鏈，餘額查詢更複雜，因為不存在「帳戶餘額」的概念。需要掃描所有屬於該地址的 UTXO 並求和。Bitcoin Core 提供了 `getbalance` RPC，但如果你使用的是第三方 API（如 Blockstream、Mempool.space），需要分別查詢 confirmed 和 unconfirmed UTXO。

### 6.2.4 ERC-20 標準與實現 `P0`

必懂函數：
- `balanceOf`
- `transfer`
- `approve`
- `transferFrom`
- `allowance`

必懂事件：
- `Transfer`
- `Approval`

ERC-20 是 Ethereum 上最重要的代幣標準，定義了同質化代幣（Fungible Token）的統一接口。幾乎所有 DeFi 協議都依賴這個標準。理解 ERC-20 的每個函數和事件，是錢包開發的必備知識。

`approve` + `transferFrom` 的二步授權模式是 ERC-20 最核心也最容易出問題的設計。它的存在是為了讓合約能代替用戶操作代幣。例如，在 Uniswap 上交易代幣時，你需要先 `approve` Uniswap Router 合約一定額度的代幣，然後 Router 通過 `transferFrom` 把代幣從你的帳戶轉出。

```text
ERC-20 approve + transferFrom 流程：

Step 1: 用戶 approve
┌──────┐   approve(spender, amount)   ┌─────────────┐
│ User │ ────────────────────────────> │ Token 合約  │
└──────┘                               │ allowance   │
                                       │ [user][DEX] │
                                       │ = amount    │
                                       └─────────────┘

Step 2: DEX 合約代為轉帳
┌──────────┐  transferFrom(user, pool, amount)  ┌─────────────┐
│ DEX 合約 │ ──────────────────────────────────> │ Token 合約  │
└──────────┘                                     │ balance更新  │
                                                 │ allowance減少│
                                                 └─────────────┘
```

```go
// ERC-20 token 互動的完整範例
func GetTokenBalance(ctx context.Context, client *ethclient.Client,
	tokenAddr, userAddr common.Address) (*big.Int, error) {

	// 載入 ERC-20 ABI
	erc20ABI, _ := abi.JSON(strings.NewReader(erc20ABIJson))

	// 打包 balanceOf 呼叫
	data, _ := erc20ABI.Pack("balanceOf", userAddr)

	// eth_call（不上鏈，免費）
	result, err := client.CallContract(ctx, ethereum.CallMsg{
		To:   &tokenAddr,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	// 解析結果
	outputs, err := erc20ABI.Unpack("balanceOf", result)
	if err != nil {
		return nil, err
	}

	return outputs[0].(*big.Int), nil
}

// 查詢 decimals（緩存這個值！）
func GetTokenDecimals(ctx context.Context, client *ethclient.Client,
	tokenAddr common.Address) (uint8, error) {

	erc20ABI, _ := abi.JSON(strings.NewReader(erc20ABIJson))
	data, _ := erc20ABI.Pack("decimals")

	result, err := client.CallContract(ctx, ethereum.CallMsg{
		To: &tokenAddr, Data: data,
	}, nil)
	if err != nil {
		return 0, err
	}

	outputs, _ := erc20ABI.Unpack("decimals", result)
	return uint8(outputs[0].(*big.Int).Uint64()), nil
}
```

工程坑點：
- 小數位 `decimals` 處理錯誤（USDC 是 6 位，WBTC 是 8 位，大部分 token 是 18 位）
- `approve` 競態（建議先歸零再設新值，即先 `approve(spender, 0)` 再 `approve(spender, newAmount)`）
- 有些 token 不完全符合 ERC-20 標準（如 USDT 的 `transfer` 不回傳 bool）
- 轉帳前沒有檢查合約是否存在（對不存在的地址呼叫 `transfer` 不會報錯，只是靜默失敗）

### 6.2.5 錢包如何支持 token 轉移 `P0`

流程：
1. 載入 token ABI
2. `Pack("transfer", to, amount)`
3. 建合約交易
4. 簽名並送出
5. 根據 receipt 與 event 確認結果

token 轉帳與原生幣轉帳的關鍵差異在於：token 轉帳是對合約的函數呼叫，而不是 ETH value transfer。交易的 `to` 欄位是 token 合約地址（不是收款人地址），`value` 欄位是 0（不需要發送 ETH），收款人地址和金額被編碼在 `data` 欄位中。

```go
// ERC-20 token 轉帳
func BuildTokenTransferTx(ctx context.Context, client *ethclient.Client,
	tokenAddr, from, to common.Address, amount *big.Int) (*types.Transaction, error) {

	erc20ABI, _ := abi.JSON(strings.NewReader(erc20ABIJson))

	// 打包 transfer(to, amount) 的 calldata
	data, err := erc20ABI.Pack("transfer", to, amount)
	if err != nil {
		return nil, fmt.Errorf("pack transfer: %w", err)
	}

	nonce, _ := client.PendingNonceAt(ctx, from)
	chainID, _ := client.ChainID(ctx)
	tipCap, _ := client.SuggestGasTipCap(ctx)
	header, _ := client.HeaderByNumber(ctx, nil)
	feeCap := new(big.Int).Add(tipCap, new(big.Int).Mul(header.BaseFee, big.NewInt(2)))

	// 估算 gas（token transfer 通常約 50,000-65,000 gas）
	gasLimit, err := client.EstimateGas(ctx, ethereum.CallMsg{
		From: from,
		To:   &tokenAddr,
		Data: data,
	})
	if err != nil {
		return nil, fmt.Errorf("estimate gas: %w", err)
	}
	gasLimit = gasLimit * 12 / 10 // 加 20% 安全邊際

	tx := types.NewTx(&types.DynamicFeeTx{
		ChainID:   chainID,
		Nonce:     nonce,
		GasTipCap: tipCap,
		GasFeeCap: feeCap,
		Gas:       gasLimit,
		To:        &tokenAddr, // 注意：to 是合約地址，不是收款人
		Value:     big.NewInt(0), // 不發送 ETH
		Data:      data,
	})

	return tx, nil
}

// 確認 token 轉帳結果
func ConfirmTokenTransfer(ctx context.Context, client *ethclient.Client,
	receipt *types.Receipt, erc20ABI abi.ABI, expectedTo common.Address, expectedAmount *big.Int) error {

	if receipt.Status != types.ReceiptStatusSuccessful {
		return fmt.Errorf("transaction reverted")
	}

	// 解析 Transfer event
	for _, vLog := range receipt.Logs {
		event, err := erc20ABI.EventByID(vLog.Topics[0])
		if err != nil || event.Name != "Transfer" {
			continue
		}
		// Topics[1] = from, Topics[2] = to
		to := common.BytesToAddress(vLog.Topics[2].Bytes())
		// Data = amount
		outputs, _ := event.Inputs.NonIndexed().Unpack(vLog.Data)
		amount := outputs[0].(*big.Int)

		if to == expectedTo && amount.Cmp(expectedAmount) == 0 {
			return nil // 確認成功
		}
	}
	return fmt.Errorf("expected Transfer event not found")
}
```

### 6.2.6 錢包如何支持 token 查詢 `P0`

查詢項目：
- token 餘額
- allowance
- 持倉清單

工程建議：
- 緩存 metadata（symbol/decimals）
- 多鏈資產用 `chainId + contract + address` 當主鍵

token 查詢在使用者體驗上需要做到「開啟錢包即看到所有資產」。這意味著錢包需要維護一個 token 列表，並批量查詢餘額。對於支持多條鏈的錢包，資產索引的主鍵必須包含 chain id，否則不同鏈上同地址的 token 合約會衝突。

```go
// Token metadata 緩存
type TokenMeta struct {
	ChainID  int64
	Address  common.Address
	Symbol   string
	Decimals uint8
	Name     string
}

type TokenCache struct {
	mu    sync.RWMutex
	cache map[string]*TokenMeta // key: "chainId:contractAddr"
}

func (c *TokenCache) GetOrFetch(ctx context.Context, client *ethclient.Client,
	chainID int64, tokenAddr common.Address) (*TokenMeta, error) {

	key := fmt.Sprintf("%d:%s", chainID, tokenAddr.Hex())

	c.mu.RLock()
	if meta, ok := c.cache[key]; ok {
		c.mu.RUnlock()
		return meta, nil
	}
	c.mu.RUnlock()

	// Cache miss: 從鏈上查詢
	symbol, _ := queryTokenSymbol(ctx, client, tokenAddr)
	decimals, _ := GetTokenDecimals(ctx, client, tokenAddr)
	name, _ := queryTokenName(ctx, client, tokenAddr)

	meta := &TokenMeta{
		ChainID:  chainID,
		Address:  tokenAddr,
		Symbol:   symbol,
		Decimals: decimals,
		Name:     name,
	}

	c.mu.Lock()
	c.cache[key] = meta
	c.mu.Unlock()

	return meta, nil
}

// 批量查詢 token 餘額（使用 multicall 減少 RPC 次數）
func GetMultiTokenBalances(ctx context.Context, client *ethclient.Client,
	userAddr common.Address, tokens []common.Address) (map[common.Address]*big.Int, error) {

	balances := make(map[common.Address]*big.Int)

	// 簡化版：逐一查詢（生產環境用 multicall 合約批量查詢）
	for _, token := range tokens {
		bal, err := GetTokenBalance(ctx, client, token, userAddr)
		if err != nil {
			balances[token] = big.NewInt(0) // 查詢失敗不中斷
			continue
		}
		balances[token] = bal
	}
	return balances, nil
}
```

最佳實踐：
- token metadata（symbol, decimals, name）幾乎不會變，查一次就緩存
- 使用 multicall 合約在一個 RPC 呼叫中查詢多個 token 餘額，減少延遲
- 維護一個「已知 token 列表」（如 CoinGecko token list），自動偵測用戶持有的 token

### 6.2.7 交易明細查詢 `P0`

最小交易明細模型：
- `txHash`
- `from`, `to`
- `value` / `tokenAmount`
- `status`
- `blockNumber`
- `timestamp`
- `fee`

狀態機：

```text
created -> signed -> pending -> confirmed -> finalized
                              -> failed/dropped
```

交易狀態追蹤是錢包 UX 的關鍵。用戶需要知道他的交易在哪個階段：是還在等待簽名、已經廣播但還沒被打包、已經被打包但還沒有足夠確認數、還是已經完全確認？每個狀態轉換都應該有對應的通知機制。

```go
// 交易明細模型
type TxDetail struct {
	TxHash      string    `json:"tx_hash"`
	From        string    `json:"from"`
	To          string    `json:"to"`
	Value       string    `json:"value"`        // 原生幣金額（wei）
	TokenAmount string    `json:"token_amount"` // token 金額（最小單位）
	TokenAddr   string    `json:"token_addr"`   // token 合約地址（如果是 token 交易）
	Status      TxStatus  `json:"status"`
	BlockNumber uint64    `json:"block_number"`
	Timestamp   time.Time `json:"timestamp"`
	GasUsed     uint64    `json:"gas_used"`
	GasPrice    string    `json:"gas_price"`
	Fee         string    `json:"fee"` // gasUsed * effectiveGasPrice
}

type TxStatus int

const (
	TxStatusCreated   TxStatus = iota // 交易已建立
	TxStatusSigned                    // 已簽名
	TxStatusPending                   // 已廣播，等待打包
	TxStatusConfirmed                 // 已打包，等待足夠確認
	TxStatusFinalized                 // 完全確認
	TxStatusFailed                    // 執行失敗（revert）
	TxStatusDropped                   // 被替換或逾時丟棄
)

// 追蹤交易狀態
func TrackTransaction(ctx context.Context, client *ethclient.Client,
	txHash common.Hash, confirmations uint64) (<-chan TxStatus, error) {

	statusCh := make(chan TxStatus, 10)

	go func() {
		defer close(statusCh)
		statusCh <- TxStatusPending

		// 等待被打包
		receipt, err := bind.WaitMined(ctx, client, &types.Transaction{})
		if err != nil {
			statusCh <- TxStatusDropped
			return
		}

		if receipt.Status == 0 {
			statusCh <- TxStatusFailed
			return
		}

		statusCh <- TxStatusConfirmed

		// 等待足夠確認數
		for {
			currentBlock, _ := client.BlockNumber(ctx)
			if currentBlock-receipt.BlockNumber.Uint64() >= confirmations {
				statusCh <- TxStatusFinalized
				return
			}
			time.Sleep(12 * time.Second) // 大約一個區塊的時間
		}
	}()

	return statusCh, nil
}
```

常見坑：
- 只看 tx 成功，不看 event 是否符合預期（tx status = 1 只代表沒有 revert，不代表業務邏輯正確——例如 token transfer 的 amount 可能因為精度問題與預期不同）
- 發生重組時沒有回滾本地狀態（如果一個已確認的交易被 reorg 移除，本地資料庫必須同步回滾）
- pending 狀態的交易長時間不被打包（可能因為 gas 價格太低），需要提供「加速」（用更高 gas 重發同 nonce 交易）和「取消」（用同 nonce 發送 0 value 給自己）功能
- 沒有處理 nonce gap——如果 nonce 5 的交易被取消了，nonce 6 和 7 的交易也會一直卡住

## 章節回顧與工程要點

離線錢包是區塊鏈工程中安全要求最高的模組。本章涵蓋了從金鑰管理到交易追蹤的完整鏈路，以下是每個環節的核心工程原則：

**私鑰隔離**：私鑰永遠不出簽名邊界。離線端和在線端之間通過未簽名/已簽名交易進行資料交換。私鑰存儲必須加密（至少 AES-256-GCM + scrypt KDF），記憶體中使用後立即清零。助記詞是私鑰的最終備份，其安全等級不應低於私鑰本身。

**交易可驗證**：每筆交易在簽名前必須在離線端展示完整內容（to、amount、gas、data）供用戶確認。簽名後的交易可以被任何人獨立驗證，不依賴簽名端的在線狀態。對於 token 交易，不僅要檢查 tx receipt 的 status，還要解析 Transfer event 確認收款人和金額正確。

**狀態可追蹤**：交易從建立到最終確認經歷多個狀態轉換，每個狀態都應該被持久化並可查詢。重組（reorg）是真實存在的威脅，本地狀態必須有回滾能力。對於大額交易，確認數門檻應該更高。

**錯誤可恢復**：網路故障、節點故障、交易被卡住都是正常情況。錢包必須支持交易加速（replace-by-fee）和取消功能。RPC 呼叫需要重試機制和超時控制。本地資料庫需要備份策略。

做到這四點，才算可上線的錢包系統。

## 白話總結

離線錢包的核心概念其實很簡單：私鑰放在一台完全不連網的機器上，需要簽名的時候把未簽名的交易透過 USB 或 QR code 傳過去，簽好名再傳回來廣播。這樣即使在線端被駭了，攻擊者也拿不到私鑰。助記詞就是私鑰的「人話版本」——12 或 24 個英文單詞，記住它們就能恢復所有帳戶。私鑰存儲一定要加密，密碼要用 scrypt 這類 KDF 處理，讓暴力破解變得極其昂貴。做 token 轉帳的時候要注意，你實際上是在呼叫合約函數，收款人地址藏在 calldata 裡面，不是交易的 to 欄位。最後一點經常被忽略但非常重要：交易確認不是看 receipt status 就夠了，你還得去解析 event log，確認收款人和金額跟你預期的一樣。
