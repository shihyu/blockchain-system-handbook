# 第9章 Python語言離線錢包開發

本章目標是做出安全可用的離線錢包方案：私鑰隔離、交易可驗證、查詢可追蹤。

## 9.1 區塊鏈錢包原理 `P0`

### 9.1.1 區塊鏈錢包的核心原理 `P0`

錢包本質：
- 管理私鑰與地址
- 對交易做簽名
- 提供查詢與廣播流程

不是功能：
- 鏈上資產保管（資產在鏈上）

```text
Intent -> Build Tx -> Offline Sign -> Online Broadcast -> Track Status
```

區塊鏈錢包是一個經常被誤解的概念。很多人以為錢包「儲存」了加密貨幣，就像銀行帳戶儲存了法幣一樣。但事實上，錢包只是一個**私鑰管理工具**。你的資產永遠存在區塊鏈上（由全球數千個節點共同維護），錢包只是持有能夠控制這些資產的私鑰。如果類比現實世界，錢包更像是一把鑰匙而非保險箱——鑰匙丟了，保險箱裡的東西你就再也拿不到了。

從工程角度來看，一個完整的錢包系統需要處理以下核心功能：

```text
錢包系統架構：

┌─────────────────────────────────────────────────────┐
│                    Wallet System                     │
│                                                      │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐ │
│  │ Key Manager │   │ TX Builder   │   │  Query    │ │
│  │             │   │              │   │  Service  │ │
│  │ - 生成私鑰  │   │ - 構建交易   │   │ - 餘額    │ │
│  │ - 助記詞    │   │ - 估算 gas   │   │ - 歷史    │ │
│  │ - 派生地址  │   │ - 編碼 data  │   │ - 狀態    │ │
│  │ - 加密存儲  │   │ - 設定 nonce │   │ - 事件    │ │
│  └──────┬──────┘   └──────┬───────┘   └─────┬─────┘ │
│         │                 │                  │       │
│         v                 v                  │       │
│  ┌──────────────────────────────┐            │       │
│  │      Signer (離線)           │            │       │
│  │  - ECDSA 簽名               │            │       │
│  │  - 交易序列化 (RLP)         │            │       │
│  └──────────────┬───────────────┘            │       │
│                 │                            │       │
│                 v                            v       │
│  ┌──────────────────────────────────────────────┐   │
│  │         Broadcaster (線上)                    │   │
│  │  - 發送 raw transaction                       │   │
│  │  - 等待確認                                   │   │
│  │  - 追蹤狀態                                   │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**離線錢包的核心設計原則**是「氣隙隔離」（air-gapped）。私鑰只存在於離線環境中，永遠不接觸網路。交易的構建可以在線上完成，但簽名必須在離線環境中進行。簽名後的交易（raw transaction）透過安全通道（如 QR code、USB）傳回線上環境進行廣播。這種設計確保了即使線上環境被入侵，攻擊者也無法取得私鑰。

```text
離線錢包工作流：

  Online Machine                    Offline Machine
  (有網路連接)                      (無網路連接)
  ┌──────────────┐                  ┌──────────────┐
  │ 1. 構建未簽名│                  │              │
  │    交易      │                  │              │
  │              │  USB / QR code   │              │
  │ 2. 傳輸 ────│─────────────────>│ 3. 載入交易  │
  │    未簽名 TX │                  │              │
  │              │                  │ 4. 檢視交易  │
  │              │                  │    內容      │
  │              │                  │              │
  │              │                  │ 5. 私鑰簽名  │
  │              │                  │              │
  │              │  USB / QR code   │              │
  │ 6. 接收 <───│<─────────────────│ 7. 傳回已簽  │
  │    已簽名 TX │                  │    名交易    │
  │              │                  │              │
  │ 8. 廣播交易  │                  │              │
  │              │                  │              │
  │ 9. 追蹤狀態  │                  │              │
  └──────────────┘                  └──────────────┘
```

### 9.1.2 助記詞如何產生與驗證 `P0`

建議採用：
- BIP-39 助記詞
- BIP-32/44 派生路徑

安全要點：
- 助記詞離線保存
- passphrase 與助記詞分開保管
- 驗證 checksum

助記詞（mnemonic phrase）是私鑰的人類可讀表示形式。一組 12 或 24 個英文單詞就代表了一組完整的密碼學密鑰。助記詞的產生和使用遵循 BIP-39 標準，這個標準確保了不同錢包之間的相容性——同一組助記詞在 MetaMask、Ledger、Trust Wallet 中都會生成相同的地址。

**BIP-39 助記詞生成流程**：

```text
BIP-39 助記詞生成過程：

1. 生成隨機熵 (entropy)
   128 bits (12 words) 或 256 bits (24 words)
   ┌────────────────────────────────────────────┐
   │ 10011010 11100111 01001100 ... (128 bits)   │
   └────────────────────────────────────────────┘

2. 計算校驗碼 (checksum)
   SHA256(entropy) 取前 N bits (N = entropy_bits / 32)
   128 bits entropy -> 4 bits checksum -> 132 bits total
   ┌────────────────────────────────────┬────┐
   │         entropy (128 bits)         │ CS │
   └────────────────────────────────────┴────┘

3. 分割為 11-bit 段
   132 bits / 11 = 12 segments
   每個 segment 對應 BIP-39 單詞表中的一個單詞 (2048 個)
   ┌─────┬─────┬─────┬─────┬─ ... ─┬─────┐
   │ 10011│01011│10011│10100│       │01100│
   │=1235 │=731 │=1235│=1316│       │=588 │
   │=option│=galaxy│=option│=rack│  │=enough│
   └─────┴─────┴─────┴─────┴─ ... ─┴─────┘

4. 最終結果
   "option galaxy option rack ... enough"
```

```python
from mnemonic import Mnemonic
from eth_account import Account
from eth_keys import keys
import hashlib
import hmac

# BIP-39 助記詞生成
def generate_mnemonic(strength: int = 128) -> str:
    """
    生成 BIP-39 助記詞
    strength: 128 = 12 words, 256 = 24 words
    """
    m = Mnemonic("english")
    mnemonic = m.generate(strength=strength)
    return mnemonic

# 驗證助記詞的校驗碼
def validate_mnemonic(mnemonic: str) -> bool:
    """驗證助記詞是否合法（包括 checksum）"""
    m = Mnemonic("english")
    return m.check(mnemonic)

# 從助記詞派生私鑰（BIP-44 路徑）
def derive_account(mnemonic: str, passphrase: str = "",
                   account_index: int = 0) -> dict:
    """
    從助記詞派生 Ethereum 帳戶
    BIP-44 路徑: m/44'/60'/0'/0/{index}
    """
    Account.enable_unaudited_hdwallet_features()

    # 從助記詞 + passphrase 生成 seed
    acct = Account.from_mnemonic(
        mnemonic,
        passphrase=passphrase,
        account_path=f"m/44'/60'/0'/0/{account_index}"
    )

    return {
        "address": acct.address,
        "private_key": acct.key.hex(),
        "path": f"m/44'/60'/0'/0/{account_index}"
    }

# 使用範例
mnemonic = generate_mnemonic(128)
print(f"Mnemonic: {mnemonic}")
print(f"Valid: {validate_mnemonic(mnemonic)}")

# 派生前 5 個帳戶
for i in range(5):
    acct = derive_account(mnemonic, account_index=i)
    print(f"  [{i}] {acct['address']}  path={acct['path']}")
```

**BIP-32/44 派生路徑** 允許從一組助記詞派生出無限多個地址。BIP-44 定義了標準的路徑格式：`m/purpose'/coin_type'/account'/change/address_index`。對於 Ethereum，標準路徑是 `m/44'/60'/0'/0/0`。理解派生路徑的含義很重要，因為不同的路徑會生成完全不同的地址。

```text
BIP-44 派生路徑結構：

m / 44' / 60' / 0' / 0 / 0
│    │     │     │    │   │
│    │     │     │    │   └── address_index: 第幾個地址
│    │     │     │    └────── change: 0=外部, 1=找零（UTXO 鏈用）
│    │     │     └─────────── account: 帳戶編號
│    │     └───────────────── coin_type: 60=ETH, 0=BTC, 966=MATIC
│    └─────────────────────── purpose: 44=BIP-44 標準
└──────────────────────────── master: 主密鑰
```

**安全最佳實踐**：
1. **助記詞必須離線生成**：在斷網的電腦上生成，生成後立即抄寫到紙上或金屬板上
2. **Passphrase 是第二層保護**：即使助記詞洩露，沒有 passphrase 也無法派生出正確的私鑰
3. **分散備份**：將助記詞分為多份（如使用 Shamir's Secret Sharing），分別存放在不同的物理位置
4. **永遠不要數位化助記詞**：不要拍照、不要存檔、不要透過網路傳輸

### 9.1.3 如何儲存私鑰 `P0`

推薦做法：
- keystore 加密（口令 + KDF）
- 硬體錢包或 HSM
- 交易簽名與網路隔離

禁忌：
- 私鑰明文存檔
- 私鑰進日誌
- 未授權備份

私鑰的安全儲存是錢包系統最關鍵的環節。私鑰一旦洩露，對應地址中的所有資產都可以被任何人轉走，而且這個過程是不可逆的——沒有客服、沒有凍結、沒有追回機制。

**Keystore 加密** 是 Ethereum 官方推薦的私鑰儲存方式。它使用 AES-128-CTR 加密私鑰，並使用 KDF（Key Derivation Function，如 scrypt 或 pbkdf2）從使用者的密碼派生加密金鑰。即使 keystore 檔案被盜，攻擊者仍然需要暴力破解密碼才能取得私鑰。

```python
from eth_account import Account
import json
import os
import getpass

class KeystoreManager:
    """Keystore 私鑰管理器"""

    def __init__(self, keystore_dir: str = "./keystores"):
        self.keystore_dir = keystore_dir
        os.makedirs(keystore_dir, exist_ok=True)

    def create_account(self, password: str) -> dict:
        """創建新帳戶並加密保存"""
        # 生成新的私鑰
        acct = Account.create()

        # 加密為 keystore 格式
        # scrypt 參數越大，暴力破解越難，但開鎖也越慢
        keystore = Account.encrypt(
            acct.key,
            password,
            kdf="scrypt",
            iterations=None  # 使用預設值
        )

        # 保存到檔案
        filename = f"UTC--{keystore['address']}.json"
        filepath = os.path.join(self.keystore_dir, filename)
        with open(filepath, "w") as f:
            json.dump(keystore, f, indent=2)

        return {
            "address": acct.address,
            "keystore_path": filepath
        }

    def load_private_key(self, keystore_path: str, password: str) -> bytes:
        """從 keystore 解密私鑰"""
        with open(keystore_path) as f:
            keystore = json.load(f)
        return Account.decrypt(keystore, password)

    def sign_transaction(self, keystore_path: str, password: str,
                        tx: dict) -> bytes:
        """使用 keystore 簽名交易"""
        private_key = self.load_private_key(keystore_path, password)
        signed = Account.sign_transaction(tx, private_key)

        # 立即清除記憶體中的私鑰（Python 的限制：無法保證完全清除）
        del private_key

        return signed.raw_transaction

# 使用範例
km = KeystoreManager()

# 創建帳戶（密碼不要硬編碼！）
password = getpass.getpass("Enter password: ")
result = km.create_account(password)
print(f"New account: {result['address']}")
print(f"Keystore: {result['keystore_path']}")
```

```text
Keystore 檔案結構：

{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD2e",
  "crypto": {
    "cipher": "aes-128-ctr",           // 加密演算法
    "ciphertext": "...",                // 加密後的私鑰
    "cipherparams": {
      "iv": "..."                       // 初始化向量
    },
    "kdf": "scrypt",                    // 密鑰派生函數
    "kdfparams": {
      "dklen": 32,                      // 派生金鑰長度
      "n": 262144,                      // CPU/記憶體成本參數
      "p": 1,                           // 平行化參數
      "r": 8,                           // 區塊大小參數
      "salt": "..."                     // 鹽值
    },
    "mac": "..."                        // 訊息認證碼（驗證密碼正確性）
  },
  "version": 3
}

解密流程：
password + salt ──[scrypt]──> derived_key
derived_key[16:32] + ciphertext ──[keccak256]──> mac (比對驗證)
derived_key[0:16] + iv + ciphertext ──[AES-CTR]──> private_key
```

**硬體錢包** 是目前最安全的私鑰管理方案。Ledger、Trezor 等硬體錢包將私鑰保存在安全晶片（Secure Element）中，私鑰永遠不會離開裝置。交易在硬體裝置內部完成簽名，電腦只能看到已簽名的交易，看不到私鑰。對於管理大額資產的機構，HSM（Hardware Security Module）是更專業的選擇。

**絕對禁忌**：
- 私鑰明文寫在程式碼或配置檔中
- 私鑰出現在日誌（log）中——很多新手會在 debug 時 print 私鑰
- 私鑰透過 HTTP（非 HTTPS）傳輸
- 私鑰存在雲端筆記、即時通訊軟體、或 email 中
- 未清理的記憶體中殘留私鑰（C/Rust 可以做到，Python 較困難）

## 9.2 區塊鏈錢包核心功能實現 `P0`

### 9.2.1 錢包如何支援Coin轉移 `P0`

UTXO 鏈：
- 選 UTXO
- 建 inputs/outputs
- 離線簽名
- 上線廣播

Account 鏈：
- 查 nonce/gas
- 建交易
- 離線簽名
- 上線廣播

區塊鏈有兩種主流的帳戶模型：UTXO（Unspent Transaction Output，比特幣使用）和 Account（帳戶模型，Ethereum 使用）。錢包在支援 Coin 轉移時，需要根據不同的模型採用不同的實作方式。

**UTXO 模型** 的核心概念是：你的「餘額」實際上是散布在區塊鏈上的一堆「未花費的交易輸出」。要花費資金時，你需要選擇一個或多個 UTXO 作為輸入，然後創建新的輸出（包括給接收方的金額和找零給自己的金額）。

**Account 模型** 更直覺——每個地址有一個明確的餘額，轉帳就是從一個帳戶扣款、另一個帳戶加款。Ethereum 使用的就是 Account 模型。

```python
from web3 import Web3
from eth_account import Account

class EthTransfer:
    """Ethereum Coin 轉移實作"""

    def __init__(self, rpc_url: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))

    def build_transfer_tx(self, from_addr: str, to_addr: str,
                          amount_eth: float) -> dict:
        """
        構建 ETH 轉帳交易（線上步驟）
        """
        # 1. 查詢 nonce（防止交易重放）
        nonce = self.w3.eth.get_transaction_count(from_addr, "pending")

        # 2. 估算 gas 費用
        base_fee = self.w3.eth.get_block("latest")["baseFeePerGas"]
        max_fee = int(base_fee * 2)
        priority_fee = self.w3.to_wei("2", "gwei")

        # 3. 構建交易（EIP-1559 格式）
        tx = {
            "type": 2,  # EIP-1559
            "chainId": self.w3.eth.chain_id,
            "nonce": nonce,
            "to": Web3.to_checksum_address(to_addr),
            "value": self.w3.to_wei(amount_eth, "ether"),
            "gas": 21000,  # ETH 轉帳固定 21000 gas
            "maxFeePerGas": max_fee,
            "maxPriorityFeePerGas": priority_fee,
        }

        return tx

    def sign_offline(self, tx: dict, private_key: str) -> str:
        """
        離線簽名（在斷網機器上執行）
        """
        signed = Account.sign_transaction(tx, private_key)
        return signed.raw_transaction.hex()

    def broadcast(self, raw_tx_hex: str) -> str:
        """
        廣播已簽名的交易（線上步驟）
        """
        raw_tx = bytes.fromhex(raw_tx_hex.replace("0x", ""))
        tx_hash = self.w3.eth.send_raw_transaction(raw_tx)
        return tx_hash.hex()

    def wait_confirmation(self, tx_hash: str, timeout: int = 300) -> dict:
        """
        等待交易確認並返回收據
        """
        receipt = self.w3.eth.wait_for_transaction_receipt(
            tx_hash, timeout=timeout
        )

        return {
            "tx_hash": tx_hash,
            "status": "success" if receipt["status"] == 1 else "failed",
            "block_number": receipt["blockNumber"],
            "gas_used": receipt["gasUsed"],
            "effective_gas_price": receipt["effectiveGasPrice"],
        }

# 使用範例
eth = EthTransfer("https://mainnet.infura.io/v3/YOUR_KEY")

# Step 1: 線上構建交易
tx = eth.build_transfer_tx(
    from_addr="0xYourAddress",
    to_addr="0xRecipient",
    amount_eth=0.1
)
print(f"Unsigned TX: {tx}")

# Step 2: 離線簽名（在斷網機器上執行）
raw_tx = eth.sign_offline(tx, "0xYourPrivateKey")
print(f"Signed TX: {raw_tx}")

# Step 3: 線上廣播
tx_hash = eth.broadcast(raw_tx)
print(f"TX Hash: {tx_hash}")

# Step 4: 等待確認
result = eth.wait_confirmation(tx_hash)
print(f"Result: {result}")
```

**EIP-1559 交易格式** 是目前 Ethereum 推薦的交易格式。與傳統的 gasPrice 模式不同，EIP-1559 引入了 `maxFeePerGas`（你願意支付的最高 gas 價格）和 `maxPriorityFeePerGas`（給驗證者的小費）。實際支付的費用 = min(maxFeePerGas, baseFee + maxPriorityFeePerGas)。這種機制讓 gas 費用更可預測，減少了超額支付。

### 9.2.2 錢包如何支援Coin查詢 `P0`

查詢來源：
- 節點 RPC
- 索引服務

查詢類型：
- 可用餘額
- 已確認餘額
- 交易歷史

餘額查詢看似簡單，但在生產環境中需要考慮很多細節。首先是「餘額」的定義——「可用餘額」和「已確認餘額」可能不同。一筆剛發出但尚未被確認的交易會減少你的可用餘額，但已確認餘額不會改變直到交易被打包進區塊。

```python
from web3 import Web3
from typing import List, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class BalanceInfo:
    address: str
    balance_wei: int
    balance_eth: float
    pending_balance_wei: int
    pending_balance_eth: float
    block_number: int
    timestamp: datetime

@dataclass
class TransactionRecord:
    tx_hash: str
    block_number: int
    timestamp: int
    from_addr: str
    to_addr: str
    value_wei: int
    gas_used: int
    status: str
    direction: str  # "in" or "out"

class CoinQuery:
    """Coin 查詢服務"""

    def __init__(self, rpc_url: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))

    def get_balance(self, address: str) -> BalanceInfo:
        """查詢地址的 ETH 餘額（含 pending）"""
        address = Web3.to_checksum_address(address)

        # 最新確認餘額
        confirmed = self.w3.eth.get_balance(address, "latest")

        # 包含 pending 交易的餘額
        pending = self.w3.eth.get_balance(address, "pending")

        block = self.w3.eth.get_block("latest")

        return BalanceInfo(
            address=address,
            balance_wei=confirmed,
            balance_eth=float(Web3.from_wei(confirmed, "ether")),
            pending_balance_wei=pending,
            pending_balance_eth=float(Web3.from_wei(pending, "ether")),
            block_number=block["number"],
            timestamp=datetime.fromtimestamp(block["timestamp"])
        )

    def get_recent_transactions(self, address: str,
                                 start_block: int,
                                 end_block: Optional[int] = None,
                                 ) -> List[TransactionRecord]:
        """
        查詢地址的近期交易
        注意：標準 RPC 不直接支援按地址查歷史交易
        生產環境應使用 Etherscan API 或 The Graph
        """
        if end_block is None:
            end_block = self.w3.eth.block_number

        records = []
        address = Web3.to_checksum_address(address)

        for block_num in range(start_block, end_block + 1):
            block = self.w3.eth.get_block(block_num, full_transactions=True)
            for tx in block["transactions"]:
                if tx["from"] == address or tx["to"] == address:
                    receipt = self.w3.eth.get_transaction_receipt(tx["hash"])
                    records.append(TransactionRecord(
                        tx_hash=tx["hash"].hex(),
                        block_number=block_num,
                        timestamp=block["timestamp"],
                        from_addr=tx["from"],
                        to_addr=tx["to"] or "",
                        value_wei=tx["value"],
                        gas_used=receipt["gasUsed"],
                        status="success" if receipt["status"] == 1 else "failed",
                        direction="out" if tx["from"] == address else "in"
                    ))

        return records

# 使用範例
query = CoinQuery("https://mainnet.infura.io/v3/YOUR_KEY")

# 查詢餘額
balance = query.get_balance("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
print(f"Address: {balance.address}")
print(f"Balance: {balance.balance_eth} ETH")
print(f"Pending: {balance.pending_balance_eth} ETH")
print(f"Block: {balance.block_number}")
```

**生產環境建議**：直接使用 RPC 的 `eth_getBalance` 來逐塊掃描交易歷史是非常低效的。生產環境應該使用專門的索引服務：
- **Etherscan API**：提供完整的交易歷史查詢，免費配額足夠小型專案使用
- **The Graph**：去中心化的鏈下索引協議，可以自訂查詢的資料結構
- **Alchemy / Infura Enhanced API**：提供額外的查詢能力（如 `alchemy_getAssetTransfers`）

### 9.2.3 ERC-20標準實現與部署 `P0`

核心：
- 實作標準函數與事件
- 部署後驗證合約
- 配置 token metadata

部署注意：
- decimals 一次定義
- mint 權限治理（多簽/時鎖）

在錢包開發的語境中，理解 ERC-20 的部署和配置流程非常重要，因為錢包需要支援任意的 ERC-20 token。

```python
from web3 import Web3
import json
import solcx

class TokenDeployer:
    """ERC-20 Token 部署工具"""

    # 最小 ERC-20 合約原始碼
    ERC20_SOURCE = """
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.20;

    import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
    import "@openzeppelin/contracts/access/Ownable.sol";

    contract MyToken is ERC20, Ownable {
        uint8 private _decimals;

        constructor(
            string memory name_,
            string memory symbol_,
            uint8 decimals_,
            uint256 initialSupply
        ) ERC20(name_, symbol_) Ownable(msg.sender) {
            _decimals = decimals_;
            _mint(msg.sender, initialSupply * 10 ** decimals_);
        }

        function decimals() public view override returns (uint8) {
            return _decimals;
        }

        function mint(address to, uint256 amount) external onlyOwner {
            _mint(to, amount);
        }
    }
    """

    def __init__(self, w3: Web3, private_key: str):
        self.w3 = w3
        self.account = w3.eth.account.from_key(private_key)

    def deploy(self, name: str, symbol: str, decimals: int,
               initial_supply: int, abi: list, bytecode: str) -> dict:
        """部署 ERC-20 token 合約"""
        contract = self.w3.eth.contract(abi=abi, bytecode=bytecode)

        # 構建部署交易
        tx = contract.constructor(
            name, symbol, decimals, initial_supply
        ).build_transaction({
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address),
            "gas": 2000000,
            "maxFeePerGas": self.w3.eth.get_block("latest")["baseFeePerGas"] * 2,
            "maxPriorityFeePerGas": self.w3.to_wei("2", "gwei"),
        })

        # 簽名並發送
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)

        # 等待部署完成
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

        return {
            "tx_hash": tx_hash.hex(),
            "contract_address": receipt["contractAddress"],
            "block_number": receipt["blockNumber"],
            "gas_used": receipt["gasUsed"],
        }
```

**部署檢查清單**：
1. `decimals` 一旦設定就不可更改，USDT 用 6、大多數 token 用 18
2. `initialSupply` 計算時要考慮 decimals：如果 decimals=18，initialSupply=1000 代表 1000 * 10^18 最小單位
3. 部署後在 Etherscan 上驗證合約原始碼，讓使用者可以閱讀和驗證合約邏輯
4. Mint 權限不要給單一 EOA，使用多簽錢包或 DAO 治理

### 9.2.4 錢包如何支援Token轉移 `P0`

流程：
1. 載入 ABI
2. `transfer(to, amount)` 打包 data
3. 建交易並簽名
4. 發送交易並追 receipt

Token 轉移與 ETH 轉移的核心差異在於：Token 轉移是對 token 合約的函數呼叫，而非直接的 value transfer。交易的 `to` 欄位是 token 合約地址，`value` 為 0，`data` 欄位包含了 `transfer(address,uint256)` 的 ABI 編碼。

```python
from web3 import Web3
from eth_account import Account

class TokenTransfer:
    """ERC-20 Token 轉移"""

    # ERC-20 最小 ABI（只需要 transfer 和 balanceOf）
    ERC20_ABI = [
        {
            "inputs": [
                {"name": "to", "type": "address"},
                {"name": "amount", "type": "uint256"}
            ],
            "name": "transfer",
            "outputs": [{"name": "", "type": "bool"}],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [{"name": "account", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "symbol",
            "outputs": [{"name": "", "type": "string"}],
            "stateMutability": "view",
            "type": "function"
        }
    ]

    def __init__(self, w3: Web3, token_address: str):
        self.w3 = w3
        self.contract = w3.eth.contract(
            address=Web3.to_checksum_address(token_address),
            abi=self.ERC20_ABI
        )

    def get_token_info(self) -> dict:
        """查詢 token 基本資訊"""
        return {
            "address": self.contract.address,
            "symbol": self.contract.functions.symbol().call(),
            "decimals": self.contract.functions.decimals().call(),
        }

    def build_transfer_tx(self, from_addr: str, to_addr: str,
                           amount_human: float) -> dict:
        """
        構建 token 轉帳交易
        amount_human: 人類可讀金額（如 100.5 USDT）
        """
        decimals = self.contract.functions.decimals().call()
        amount_raw = int(amount_human * 10**decimals)

        # 檢查餘額
        balance = self.contract.functions.balanceOf(
            Web3.to_checksum_address(from_addr)
        ).call()

        if balance < amount_raw:
            raise ValueError(
                f"Insufficient balance: "
                f"have {balance / 10**decimals}, "
                f"need {amount_human}"
            )

        # 構建交易
        tx = self.contract.functions.transfer(
            Web3.to_checksum_address(to_addr),
            amount_raw
        ).build_transaction({
            "from": Web3.to_checksum_address(from_addr),
            "nonce": self.w3.eth.get_transaction_count(from_addr, "pending"),
            "gas": 100000,  # ERC-20 transfer 通常需要 50k-70k gas
            "maxFeePerGas": self.w3.eth.get_block("latest")["baseFeePerGas"] * 2,
            "maxPriorityFeePerGas": self.w3.to_wei("2", "gwei"),
            "chainId": self.w3.eth.chain_id,
        })

        return tx

    def sign_and_send(self, tx: dict, private_key: str) -> dict:
        """簽名並發送交易"""
        signed = Account.sign_transaction(tx, private_key)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

        return {
            "tx_hash": tx_hash.hex(),
            "status": "success" if receipt["status"] == 1 else "failed",
            "gas_used": receipt["gasUsed"],
        }

# 使用範例
w3 = Web3(Web3.HTTPProvider("https://mainnet.infura.io/v3/YOUR_KEY"))

# USDT 合約
usdt = TokenTransfer(w3, "0xdAC17F958D2ee523a2206206994597C13D831ec7")

info = usdt.get_token_info()
print(f"Token: {info['symbol']}, Decimals: {info['decimals']}")

# 構建交易
tx = usdt.build_transfer_tx(
    from_addr="0xYourAddress",
    to_addr="0xRecipient",
    amount_human=100.0  # 轉 100 USDT
)

# 簽名並發送
result = usdt.sign_and_send(tx, "0xYourPrivateKey")
print(f"Result: {result}")
```

**常見陷阱**：
1. **Gas 估算**：不同的 token 合約 transfer 函數消耗的 gas 不同（例如有些 token 有轉帳稅、有些有黑名單檢查），建議使用 `eth_estimateGas` 動態估算而非硬編碼
2. **Approval 流程**：如果是透過第三方合約（如 DEX）轉帳，需要先 approve 再 transferFrom
3. **Fee-on-Transfer Token**：有些 token 在轉帳時會扣手續費，實際到帳金額會少於發送金額

### 9.2.5 錢包如何支援Token查詢 `P0`

必要查詢：
- `balanceOf`
- `allowance`
- Token 清單與價格映射（可選）

工程要點：
- 多鏈多 token 用統一主鍵管理
- 對 decimals/symbol 做快取

Token 查詢是錢包使用者體驗的重要組成部分。使用者期望看到自己持有的所有 token 的餘額、價格、以及總資產價值。

```python
from web3 import Web3
from dataclasses import dataclass
from typing import List, Dict, Optional
import json

@dataclass
class TokenBalance:
    contract_address: str
    symbol: str
    decimals: int
    balance_raw: int
    balance_human: float

class TokenQueryService:
    """Token 查詢服務"""

    ERC20_BALANCE_ABI = [
        {
            "inputs": [{"name": "account", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "symbol",
            "outputs": [{"name": "", "type": "string"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {"name": "owner", "type": "address"},
                {"name": "spender", "type": "address"}
            ],
            "name": "allowance",
            "outputs": [{"name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        }
    ]

    def __init__(self, w3: Web3):
        self.w3 = w3
        self._token_cache: Dict[str, dict] = {}  # 快取 token metadata

    def _get_token_metadata(self, token_address: str) -> dict:
        """獲取 token 的 metadata（帶快取）"""
        addr = Web3.to_checksum_address(token_address)
        if addr not in self._token_cache:
            contract = self.w3.eth.contract(address=addr, abi=self.ERC20_BALANCE_ABI)
            try:
                self._token_cache[addr] = {
                    "symbol": contract.functions.symbol().call(),
                    "decimals": contract.functions.decimals().call(),
                }
            except Exception:
                self._token_cache[addr] = {"symbol": "???", "decimals": 18}
        return self._token_cache[addr]

    def get_token_balance(self, user_address: str,
                          token_address: str) -> TokenBalance:
        """查詢單一 token 餘額"""
        addr = Web3.to_checksum_address(token_address)
        user = Web3.to_checksum_address(user_address)
        contract = self.w3.eth.contract(address=addr, abi=self.ERC20_BALANCE_ABI)

        meta = self._get_token_metadata(token_address)
        balance = contract.functions.balanceOf(user).call()

        return TokenBalance(
            contract_address=addr,
            symbol=meta["symbol"],
            decimals=meta["decimals"],
            balance_raw=balance,
            balance_human=balance / 10**meta["decimals"]
        )

    def get_all_balances(self, user_address: str,
                         token_list: List[str]) -> List[TokenBalance]:
        """批量查詢多個 token 的餘額"""
        results = []
        for token_addr in token_list:
            try:
                bal = self.get_token_balance(user_address, token_addr)
                if bal.balance_raw > 0:
                    results.append(bal)
            except Exception as e:
                print(f"Error querying {token_addr}: {e}")
                continue
        return results

    def get_allowance(self, owner: str, spender: str,
                      token_address: str) -> float:
        """查詢授權額度"""
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(token_address),
            abi=self.ERC20_BALANCE_ABI
        )
        meta = self._get_token_metadata(token_address)
        raw = contract.functions.allowance(
            Web3.to_checksum_address(owner),
            Web3.to_checksum_address(spender)
        ).call()
        return raw / 10**meta["decimals"]

# 使用範例
w3 = Web3(Web3.HTTPProvider("https://mainnet.infura.io/v3/YOUR_KEY"))
service = TokenQueryService(w3)

# 常見 token 地址
TOKENS = {
    "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "DAI": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    "WETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
}

# 查詢所有 token 餘額
balances = service.get_all_balances(
    "0xYourAddress",
    list(TOKENS.values())
)

for bal in balances:
    print(f"  {bal.symbol}: {bal.balance_human}")
```

**多鏈支援** 是現代錢包的標準需求。使用者可能同時使用 Ethereum、Polygon、Arbitrum、BSC 等多條鏈。工程上建議用 `(chain_id, token_address)` 作為 token 的唯一主鍵，因為同一個 token 在不同鏈上的合約地址通常不同。

### 9.2.6 事件訂閱 `P0`

用途：
- 實時更新交易狀態
- 觸發通知與風控
- 事後審計

訂閱策略：
- websocket 實時訂閱
- 定時補塊避免漏事件
- 重組時回滾本地狀態

事件訂閱是錢包系統中最容易出問題的環節之一。鏈上事件可能因為網路延遲、節點故障、區塊重組等原因被遺漏或重複，必須有完善的補償機制。

```python
import asyncio
from web3 import Web3
from web3.logs import DISCARD
import json
import time
from typing import Callable, List

class EventSubscriber:
    """事件訂閱服務"""

    def __init__(self, ws_url: str, http_url: str):
        self.ws_w3 = Web3(Web3.WebsocketProvider(ws_url))
        self.http_w3 = Web3(Web3.HTTPProvider(http_url))
        self.last_processed_block = 0
        self._handlers = {}

    def register_handler(self, event_name: str,
                         handler: Callable):
        """註冊事件處理函數"""
        self._handlers[event_name] = handler

    def subscribe_transfer_events(self, token_address: str,
                                   watched_addresses: List[str]):
        """
        訂閱 ERC-20 Transfer 事件
        使用 polling 方式（更可靠）
        """
        token = Web3.to_checksum_address(token_address)
        addresses = [Web3.to_checksum_address(a) for a in watched_addresses]

        # Transfer 事件的 topic
        transfer_topic = Web3.keccak(text="Transfer(address,address,uint256)")

        while True:
            try:
                current_block = self.http_w3.eth.block_number

                # 避免處理還不穩定的區塊（可能重組）
                safe_block = current_block - 3  # 3 blocks 確認

                if safe_block <= self.last_processed_block:
                    time.sleep(2)
                    continue

                # 查詢事件日誌
                logs = self.http_w3.eth.get_logs({
                    "fromBlock": self.last_processed_block + 1,
                    "toBlock": safe_block,
                    "address": token,
                    "topics": [transfer_topic.hex()],
                })

                for log in logs:
                    from_addr = "0x" + log["topics"][1].hex()[-40:]
                    to_addr = "0x" + log["topics"][2].hex()[-40:]

                    # 只處理關注的地址
                    from_checksum = Web3.to_checksum_address(from_addr)
                    to_checksum = Web3.to_checksum_address(to_addr)

                    if from_checksum in addresses or to_checksum in addresses:
                        amount = int(log["data"].hex(), 16)
                        self._process_transfer(
                            log["transactionHash"].hex(),
                            log["blockNumber"],
                            from_checksum,
                            to_checksum,
                            amount
                        )

                self.last_processed_block = safe_block
                print(f"Processed up to block {safe_block}")

            except Exception as e:
                print(f"Error in event loop: {e}")
                time.sleep(5)  # 出錯後等待重試

    def _process_transfer(self, tx_hash, block, from_addr, to_addr, amount):
        """處理 Transfer 事件"""
        handler = self._handlers.get("transfer")
        if handler:
            handler({
                "tx_hash": tx_hash,
                "block": block,
                "from": from_addr,
                "to": to_addr,
                "amount": amount,
            })

    def backfill(self, token_address: str, from_block: int,
                 to_block: int, watched_addresses: List[str]):
        """
        補塊掃描：檢查遺漏的事件
        應該定期執行，確保沒有漏單
        """
        print(f"Backfilling blocks {from_block} to {to_block}...")
        self.last_processed_block = from_block - 1
        # 臨時設定為需要補掃的範圍
        # 複用 subscribe 的邏輯但只掃一次

# 使用範例
def on_transfer(event):
    print(f"Transfer detected!")
    print(f"  TX: {event['tx_hash']}")
    print(f"  From: {event['from']}")
    print(f"  To: {event['to']}")
    print(f"  Amount: {event['amount']}")

subscriber = EventSubscriber(
    ws_url="wss://mainnet.infura.io/ws/v3/YOUR_KEY",
    http_url="https://mainnet.infura.io/v3/YOUR_KEY"
)

subscriber.register_handler("transfer", on_transfer)

# 監控 USDT 轉帳
subscriber.subscribe_transfer_events(
    token_address="0xdAC17F958D2ee523a2206206994597C13D831ec7",
    watched_addresses=["0xYourAddress1", "0xYourAddress2"]
)
```

```text
事件訂閱的可靠性策略：

┌───────────────────────────────────────────────────┐
│               Event Processing Pipeline           │
│                                                    │
│  1. Real-time Polling (主通道)                     │
│     ┌─────┐  每 2 秒  ┌─────────────┐            │
│     │Timer│ ─────────> │ get_logs()  │            │
│     └─────┘            └──────┬──────┘            │
│                               │                    │
│  2. Confirmation Delay (安全延遲)                  │
│     等待 3-12 個區塊確認後才處理                    │
│     避免因區塊重組而處理到被回滾的事件               │
│                               │                    │
│  3. Backfill Scanner (補塊掃描)                    │
│     ┌──────────┐  定期  ┌──────────────┐          │
│     │ Cron Job │ ─────> │ 掃描已處理的  │          │
│     └──────────┘        │ 區塊範圍     │          │
│                         └──────┬───────┘          │
│                                │                   │
│  4. Deduplication (去重)                           │
│     使用 (tx_hash, log_index) 作為唯一鍵           │
│     避免重複處理同一個事件                          │
│                                │                   │
│                                v                   │
│  5. Persistent Storage (持久化)                    │
│     記錄 last_processed_block                      │
│     服務重啟後可以從斷點繼續                        │
└───────────────────────────────────────────────────┘
```

**區塊重組（Reorg）** 是事件訂閱中最棘手的問題。當兩個驗證者幾乎同時提出有效區塊時，網路會暫時分叉。最終只有一條分叉會被接受，另一條會被丟棄。如果你已經處理了被丟棄分叉上的事件，就需要回滾本地狀態。解決方案是等待足夠的確認數（Ethereum 通常 12 個區塊就很安全了）再處理事件。

## Python 工程實作骨架

```python
from web3 import Web3

w3 = Web3(Web3.HTTPProvider(RPC_URL))
acct = w3.eth.account.from_key(PRIVATE_KEY)

tx = {
    "to": to_addr,
    "value": amount_wei,
    "nonce": w3.eth.get_transaction_count(acct.address),
    "gas": 21000,
    "maxFeePerGas": w3.to_wei("30", "gwei"),
    "maxPriorityFeePerGas": w3.to_wei("2", "gwei"),
    "chainId": chain_id,
}

signed = acct.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
```

以上是最精簡的交易發送骨架。在此基礎上，一個完整的生產級錢包系統還需要加上以下元件：

```python
"""
完整的離線錢包系統骨架
"""
from web3 import Web3
from eth_account import Account
import json
import os
from typing import Optional
from dataclasses import dataclass

@dataclass
class WalletConfig:
    rpc_url: str
    chain_id: int
    keystore_dir: str
    gas_buffer: float = 1.2  # gas 估算的安全係數

class OfflineWallet:
    """
    離線錢包完整實作骨架

    使用流程：
    1. 離線生成錢包（generate_wallet）
    2. 線上構建交易（build_transaction）
    3. 離線簽名（sign_transaction）
    4. 線上廣播（broadcast_transaction）
    """

    def __init__(self, config: WalletConfig):
        self.config = config
        self.w3 = Web3(Web3.HTTPProvider(config.rpc_url))
        os.makedirs(config.keystore_dir, exist_ok=True)

    # ========== 離線操作 ==========

    def generate_wallet(self, password: str) -> dict:
        """生成新錢包（離線操作）"""
        acct = Account.create()
        keystore = Account.encrypt(acct.key, password)

        filepath = os.path.join(
            self.config.keystore_dir,
            f"UTC--{acct.address}.json"
        )
        with open(filepath, "w") as f:
            json.dump(keystore, f)

        return {"address": acct.address, "keystore": filepath}

    def sign_transaction(self, unsigned_tx: dict,
                         keystore_path: str, password: str) -> str:
        """
        簽名交易（離線操作）
        輸入：未簽名的交易 JSON
        輸出：已簽名的 raw transaction (hex)
        """
        with open(keystore_path) as f:
            keystore = json.load(f)
        private_key = Account.decrypt(keystore, password)
        signed = Account.sign_transaction(unsigned_tx, private_key)
        del private_key  # 清理私鑰
        return signed.raw_transaction.hex()

    # ========== 線上操作 ==========

    def build_eth_transfer(self, from_addr: str, to_addr: str,
                            amount_wei: int) -> dict:
        """構建 ETH 轉帳交易（線上操作）"""
        base_fee = self.w3.eth.get_block("latest")["baseFeePerGas"]

        return {
            "type": 2,
            "chainId": self.config.chain_id,
            "nonce": self.w3.eth.get_transaction_count(from_addr, "pending"),
            "to": Web3.to_checksum_address(to_addr),
            "value": amount_wei,
            "gas": 21000,
            "maxFeePerGas": int(base_fee * 2),
            "maxPriorityFeePerGas": self.w3.to_wei("2", "gwei"),
        }

    def build_token_transfer(self, from_addr: str, token_addr: str,
                              to_addr: str, amount_raw: int,
                              abi: list) -> dict:
        """構建 Token 轉帳交易（線上操作）"""
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(token_addr),
            abi=abi
        )

        tx = contract.functions.transfer(
            Web3.to_checksum_address(to_addr),
            amount_raw
        ).build_transaction({
            "from": Web3.to_checksum_address(from_addr),
            "nonce": self.w3.eth.get_transaction_count(from_addr, "pending"),
            "chainId": self.config.chain_id,
        })

        # 估算 gas 並加上安全係數
        estimated_gas = self.w3.eth.estimate_gas(tx)
        tx["gas"] = int(estimated_gas * self.config.gas_buffer)

        base_fee = self.w3.eth.get_block("latest")["baseFeePerGas"]
        tx["maxFeePerGas"] = int(base_fee * 2)
        tx["maxPriorityFeePerGas"] = self.w3.to_wei("2", "gwei")

        return tx

    def broadcast_transaction(self, raw_tx_hex: str) -> dict:
        """廣播交易（線上操作）"""
        raw_tx = bytes.fromhex(raw_tx_hex.replace("0x", ""))
        tx_hash = self.w3.eth.send_raw_transaction(raw_tx)

        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

        return {
            "tx_hash": tx_hash.hex(),
            "status": "success" if receipt["status"] == 1 else "failed",
            "block": receipt["blockNumber"],
            "gas_used": receipt["gasUsed"],
        }

    def get_balance(self, address: str) -> dict:
        """查詢餘額（線上操作）"""
        addr = Web3.to_checksum_address(address)
        balance = self.w3.eth.get_balance(addr)
        return {
            "address": addr,
            "balance_wei": balance,
            "balance_eth": float(Web3.from_wei(balance, "ether")),
        }
```

## 常見坑與修正

- nonce 衝突：引入 nonce manager
- gas 估算偏低：加安全係數 + 模擬
- 盲簽風險：簽名前展示可讀交易摘要
- 事件漏單：補塊掃描 + 去重存儲

讓我們深入探討每一個常見問題的根因和解決方案。

**Nonce 衝突** 是最頻繁遇到的問題。Nonce 是一個遞增的計數器，每筆交易都必須有唯一的 nonce。如果兩筆交易使用了相同的 nonce，只有一筆會被接受。在多線程或多進程環境中，如果兩個線程同時查詢 nonce 並各自發送交易，就會出現 nonce 衝突。

```python
import threading
import redis

class NonceManager:
    """線程安全的 Nonce 管理器"""

    def __init__(self, w3: Web3, address: str,
                 redis_client: redis.Redis = None):
        self.w3 = w3
        self.address = Web3.to_checksum_address(address)
        self._lock = threading.Lock()
        self._redis = redis_client
        self._local_nonce = None

    def get_next_nonce(self) -> int:
        """獲取下一個可用的 nonce"""
        if self._redis:
            return self._get_nonce_redis()
        return self._get_nonce_local()

    def _get_nonce_local(self) -> int:
        """本地鎖方案（單進程）"""
        with self._lock:
            chain_nonce = self.w3.eth.get_transaction_count(
                self.address, "pending"
            )
            if self._local_nonce is None or chain_nonce > self._local_nonce:
                self._local_nonce = chain_nonce
            else:
                self._local_nonce += 1
            return self._local_nonce

    def _get_nonce_redis(self) -> int:
        """Redis 方案（多進程/多機器）"""
        key = f"nonce:{self.address}"

        # 使用 Redis INCR 保證原子性
        chain_nonce = self.w3.eth.get_transaction_count(
            self.address, "pending"
        )

        # 確保 Redis 中的 nonce 不低於鏈上 nonce
        while True:
            current = self._redis.get(key)
            if current is None or int(current) < chain_nonce:
                self._redis.set(key, chain_nonce)
            break

        return self._redis.incr(key) - 1

    def reset(self):
        """重置 nonce（當交易卡住時使用）"""
        chain_nonce = self.w3.eth.get_transaction_count(
            self.address, "latest"
        )
        with self._lock:
            self._local_nonce = chain_nonce
        if self._redis:
            self._redis.set(f"nonce:{self.address}", chain_nonce)
```

**Gas 估算偏低** 會導致交易 revert（Out of Gas），但 gas 已經被消耗了。解決方案是在 `eth_estimateGas` 的結果上加 20-50% 的安全係數，同時設定一個合理的上限避免支付天價 gas。

```python
def safe_estimate_gas(w3, tx, buffer=1.2, max_gas=500000):
    """安全的 gas 估算"""
    try:
        estimated = w3.eth.estimate_gas(tx)
        gas = min(int(estimated * buffer), max_gas)
        return gas
    except Exception as e:
        # 如果估算失敗（交易會 revert），提前報錯
        raise ValueError(f"Transaction will revert: {e}")
```

**盲簽風險** 是指使用者在不了解交易內容的情況下簽名。攻擊者可能構造一個看似正常的交易，但實際上包含惡意的 data 欄位。解決方案是在簽名前解析並展示交易的完整內容。

```python
def decode_transaction(w3, tx, abi=None):
    """解碼交易內容為人類可讀格式"""
    result = {
        "to": tx.get("to", "Contract Creation"),
        "value": f"{Web3.from_wei(tx.get('value', 0), 'ether')} ETH",
        "gas": tx.get("gas", "unknown"),
        "nonce": tx.get("nonce"),
        "chain_id": tx.get("chainId"),
    }

    data = tx.get("data", "0x")
    if data and data != "0x" and abi:
        contract = w3.eth.contract(abi=abi)
        try:
            func, params = contract.decode_function_input(data)
            result["function"] = func.fn_name
            result["params"] = dict(params)
        except Exception:
            result["raw_data"] = data[:66] + "..."

    return result
```

**事件漏單** 在網路不穩定或服務重啟時最容易發生。解決方案是持久化記錄已處理的最新區塊號，服務重啟後從該區塊繼續掃描。同時定期進行補塊掃描，用 `(tx_hash, log_index)` 組合作為唯一鍵去重，避免重複處理。

## 9.3 章節回顧與安全工程原則

離線錢包不是功能集合，而是安全流程：
- 密鑰隔離
- 簽名可信
- 交易可追
- 事故可回應

本章的核心訊息是：**錢包的安全性取決於最薄弱的環節**。即使私鑰管理做得再好，如果交易構建有漏洞（例如沒有驗證 `to` 地址），或者事件訂閱有遺漏（導致使用者看不到某筆轉帳），整個系統的可信度都會受損。

**密鑰隔離** 是第一原則。私鑰永遠不應該出現在有網路連接的環境中。即使是在開發和測試階段，也應該養成使用 keystore 加密而非明文私鑰的習慣。

**簽名可信** 意味著使用者必須能夠在簽名前看到完整且可理解的交易內容。「盲簽」是大量資產被盜的根源。

**交易可追** 要求錢包系統必須完整記錄所有交易的生命週期：從構建、簽名、廣播、到確認。任何異常（如交易長時間 pending、gas 費異常高、轉帳到未知地址）都應該觸發告警。

**事故可回應** 是最後的防線。當安全事件發生時（如私鑰洩露），系統必須能夠快速做出反應：暫停所有待處理的交易、通知相關人員、啟動資產轉移預案。在設計錢包系統時，就應該事先規劃好事故響應流程（incident response plan）。

## 白話總結

離線錢包說白了就是把「保管鑰匙」和「開門」這兩件事情分開做。你的私鑰（鑰匙）放在一台完全斷網的電腦上，永遠不碰網路；要轉帳的時候，先在有網路的電腦上把交易內容準備好，用 USB 或 QR code 傳到離線電腦上簽名，簽完再傳回線上電腦廣播出去。助記詞就是私鑰的「人話版」，12 或 24 個英文單詞就能恢復你的所有帳戶，所以助記詞的安全性等於你全部資產的安全性——抄在紙上、鎖在保險箱裡，千萬別存手機或雲端。工程上最容易踩的坑有三個：nonce 衝突（多線程同時發交易會打架，要用鎖來管）、gas 估算偏低（預估值要加 20% buffer，不然交易會 revert 但錢照扣）、事件漏單（節點可能斷線，要有補塊掃描機制確保沒有遺漏）。Token 轉帳跟 ETH 轉帳不同，它本質上是對 token 合約發一筆函數呼叫，所以你需要知道合約的 ABI 和地址。最重要的一句話：錢包的安全性取決於最弱的環節，不管私鑰保管多安全，只要簽名環節或交易追蹤有漏洞，整個系統就不可信。
