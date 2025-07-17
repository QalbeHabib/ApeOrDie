# ApeOrDie Program

## Overview

ApeOrDie is a Solana-based program designed to facilitate token launches and manage bonding curves. This project leverages the Anchor framework for Solana smart contract development.

## Features

- **Token Launch**: Initialize and launch new tokens with specified metadata and supply.
- **Bonding Curve Management**: Manage token bonding curves with configurable parameters.
- **Authority Management**: Nominate and accept new authorities for program governance.

## Prerequisites

- [Node.js](https://nodejs.org/) (version 14 or later)
- [Yarn](https://yarnpkg.com/)
- [Rust](https://www.rust-lang.org/tools/install) (with nightly toolchain)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)

## Setup

1. **Clone the Repository**

   ```bash
   git clone [https://github.com/yourusername/ApeOrDie.git](https://github.com/QalbeHabib/ApeOrDie)
   cd ApeOrDie/program
   ```

2. **Install Dependencies**

   ```bash
   yarn install
   ```

3. **Configure Environment**

   - Copy `.env.example` to `.env` and fill in the necessary environment variables.

4. **Build the Program**

   ```bash
   yarn build
   ```

5. **Deploy the Program**

   - For Devnet:

     ```bash
     yarn deploy:ApeOrDie_dev
     ```

   - For Mainnet:

     ```bash
     yarn deploy:ApeOrDie_main
     ```

## Usage

To initialize the `ApeOrDie` programs, use the `initApeOrDie.ts` script:

- For Devnet:

  ```bash
  yarn init:ApeOrDie_dev
  ```

- For Mainnet:

  ```bash
  yarn init:ApeOrDie_main
  ```

### Verify Your Initialization

It is _recommended_ to check your initialization after using the `checkConfig.ts` script:

- For Devnet:

  ```bash
  yarn check_config:dev
  ```

- For Mainnet:

  ```bash
  yarn check_config:main
  ```

### Launch a Token

To launch a token, use the `launchToken.ts` script:

```bash
yarn launch:dev
```

- **Change Vault Executor**:

  ```bash
  yarn changeVaultExec:dev
  ```

### Run Tests

To run the test suite, execute:

```bash
yarn test:dev
```

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any improvements or bug fixes.
