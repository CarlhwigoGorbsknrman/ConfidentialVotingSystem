

# DecentralizedConfidentialVoting

A decentralized confidential voting system for DAOs built on fhEVM, ensuring voter privacy and preventing coercion through Fully Homomorphic Encryption (FHE). Members' voting choices remain private from submission to tallying, protecting against vote-buying and herd voting.

## Project Background

Traditional DAO voting systems, while transparent, suffer from critical privacy and integrity issues:

• **Lack of Privacy**: On-chain votes are public, exposing individual voting decisions.
• **Risk of Coercion & Vote-Buying**: When votes are public, malicious actors can pressure or bribe members to vote a certain way.
• **Herd Mentality (Bandwagon Effect)**: Publicly visible vote counts can unduly influence undecided voters.
• **Strategic Voting**: Members may hesitate to vote sincerely if their strategy or allegiance is revealed.

DecentralizedConfidentialVoting addresses these challenges by leveraging fhEVM to create a trustless and private voting environment where:

• All votes are encrypted client-side before being submitted to the smart contract.
• Votes remain encrypted on-chain, even during the counting process.
• The final tally is computed homomorphically, revealing only the aggregate result without exposing individual votes.
• The entire process is verifiable, transparent, and coercion-resistant.

## Features

### Core Functionality

• **Proposal Creation & Voting Setup**: Authorized members can create new proposals and define voting parameters (e.g., voting period).
• **Encrypted Vote Submission**: Members cast their votes, which are encrypted on their device before being sent to the blockchain.
• **On-chain FHE Vote Counting**: The smart contract automatically tallies the encrypted votes using FHE operations without ever decrypting them.
• **Automatic Result Publication**: Once the voting period ends, the final aggregated result is decrypted and made public for everyone to see.

### Privacy & Confidentiality

• **Client-side Encryption**: Votes are encrypted before leaving the user’s device, ensuring privacy from the start.
• **On-Chain Anonymity**: Individual voting choices are never revealed on the blockchain.
• **Immutable & Verifiable Records**: Proposals and encrypted votes are stored immutably, but the content of the vote remains secret.
• **Confidential Tallying**: Vote counting is performed on encrypted data, making it impossible for anyone (including node operators) to see individual votes.

## Architecture

### Smart Contracts

`ConfidentialVoting.sol` (deployed on an fhEVM-compatible network)

• Manages proposal lifecycle (creation, active, closed).
• Accepts and stores encrypted votes from DAO members.
• Performs on-chain FHE-powered tallying of encrypted votes.
• Publishes the final decrypted result transparently.

### Frontend Application

• **React/Vue**: A modern, interactive, and responsive UI for interacting with the DAO.
• **Ethers.js / Viem**: For blockchain interaction and smart contract calls.
• **fhEVM Library (e.g., Zama's tfhe.js)**: Manages client-side encryption of votes.
• **Intuitive UI/UX**: A clear dashboard for viewing proposals, casting votes, and seeing results.

## Technology Stack

### Blockchain

• **fhEVM (Fully Homomorphic Encryption EVM)**: The core technology enabling on-chain confidential computation.
• **Solidity ^0.8.24**: For smart contract development.
• **Hardhat / Foundry**: Development, testing, and deployment framework.
• **fhEVM-compatible Network**: (e.g., Fhenix, Zama Devnet) for deployment.

### Frontend

• **React / Vue**: Modern frontend framework.
• **Ethers.js / Viem**: For Ethereum blockchain interaction.
• **WAGMI / Web3-Modal**: For seamless wallet connections.
• **Tailwind CSS**: For styling and responsive layout.
• **Vercel / Netlify**: For frontend deployment.

## Installation

### Prerequisites

• Node.js 18+
• npm / yarn / pnpm package manager
• An Ethereum wallet compatible with the target fhEVM network (e.g., MetaMask)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-repo/DecentralizedConfidentialVoting.git
cd DecentralizedConfidentialVoting

# Install backend dependencies
npm install

# Compile smart contracts
npx hardhat compile

# Deploy to an fhEVM network (configure hardhat.config.js first)
npx hardhat run scripts/deploy.ts --network fhenix

# Navigate to the frontend directory
cd frontend

# Install frontend dependencies
npm install

# Start the development server
npm run dev
```

## Usage

• **Connect Wallet**: Connect your wallet to the dApp.
• **View Proposals**: Browse the list of active and past proposals.
• **Cast Encrypted Vote**: Select an active proposal, make your choice (e.g., 'For', 'Against'), and submit your encrypted vote. Your transaction will be recorded on-chain, but your choice remains secret.
• **View Results**: Once a proposal's voting period ends and the tally is complete, view the final public results.

## Security Features

• **End-to-End Encryption**: Votes are encrypted on the user's device and only decrypted as a final tally on-chain.
• **Coercion Resistance**: Because votes are secret, it is difficult to prove to a third party how you voted, reducing the effectiveness of vote-buying and intimidation.
• **Verifiable Tallying**: The cryptographic properties of FHE allow anyone to verify that the final count is correct without needing to see the individual votes.
• **Immutable Governance**: All proposals and voting activities are recorded on the blockchain and cannot be altered or deleted.

## Future Enhancements

• **Gas Optimization for FHE Operations**: Research and implement more efficient FHE operations to reduce transaction costs.
• **Advanced Privacy-Preserving Governance**: Integrate mechanisms like confidential quadratic voting or ranked-choice voting.
• **Integration with DAO Frameworks**: Create plugins for popular DAO platforms like Aragon or Snapshot.
• **Improved UI for Governance Insights**: Develop more advanced dashboards for visualizing proposal outcomes and participation.
