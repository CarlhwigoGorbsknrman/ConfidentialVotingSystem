// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Import the FHE library from the fhEVM repository to handle encrypted data types and operations.
import { FHE, euint32 } from "@fhevm/solidity/lib/FHE.sol";
// Import a network configuration. This can be switched for different fhEVM-compatible networks.
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title ConfidentialDAOVoting
 * @notice A smart contract for conducting confidential voting in a DAO using Fully Homomorphic Encryption (FHE).
 * This contract allows for the creation of proposals, secure casting of encrypted votes,
 * on-chain tallying of votes without decryption, and publication of final results.
 */
contract ConfidentialDAOVoting is SepoliaConfig {
    
    // --- State Variables ---

    address public owner; // The owner of the contract, typically the deployer or a governance contract.

    // Struct to define the properties of a voting proposal.
    struct Proposal {
        uint256 id;                 // Unique identifier for the proposal.
        string description;         // Text description of what is being voted on.
        address creator;            // The address that created the proposal.
        uint256 votingDeadline;     // Timestamp after which voting is no longer allowed.
        bool resultsPublished;      // Flag to indicate if the final results have been tallied and published.

        // Encrypted counters for votes. These are of type euint32, an FHE encrypted integer.
        euint32 encryptedForVotes;  // Encrypted count of "For" votes.
        euint32 encryptedAgainstVotes; // Encrypted count of "Against" votes.

        // Plaintext results, only populated after the voting deadline has passed and votes are tallied.
        uint32 finalForVotes;       // Decrypted final count of "For" votes.
        uint32 finalAgainstVotes;   // Decrypted final count of "Against" votes.
    }

    uint256 public proposalCount; // A counter to generate unique proposal IDs.
    mapping(uint256 => Proposal) public proposals; // Mapping from proposal ID to the Proposal struct.
    
    // Mapping to prevent users from voting more than once on a single proposal.
    // (proposalId => voterAddress => hasVoted)
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // Mapping to associate an asynchronous FHE decryption request ID with our internal proposal ID.
    mapping(uint256 => uint256) private requestToProposalId;


    // --- Events ---

    event ProposalCreated(uint256 indexed proposalId, address indexed creator, string description, uint256 votingDeadline);
    event Voted(uint256 indexed proposalId, address indexed voter);
    event TallyRequested(uint256 indexed proposalId);
    event ResultsPublished(uint256 indexed proposalId, uint32 forVotes, uint32 againstVotes);


    // --- Modifiers ---

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this function.");
        _;
    }

    // --- Constructor ---

    constructor() {
        owner = msg.sender;
    }


    // --- Core Functions ---

    /**
     * @notice Creates a new proposal for voting.
     * @param _description A text description of the proposal.
     * @param _votingDuration The duration in seconds for which the voting will be open.
     */
    function createProposal(string memory _description, uint256 _votingDuration) public onlyOwner {
        proposalCount++;
        uint256 newId = proposalCount;
        uint256 deadline = block.timestamp + _votingDuration;

        // Initialize the proposal with encrypted vote counters set to zero.
        // FHE.asEuint32(0) creates an encrypted integer with the value 0.
        proposals[newId] = Proposal({
            id: newId,
            description: _description,
            creator: msg.sender,
            votingDeadline: deadline,
            resultsPublished: false,
            encryptedForVotes: FHE.asEuint32(0),
            encryptedAgainstVotes: FHE.asEuint32(0),
            finalForVotes: 0,
            finalAgainstVotes: 0
        });

        emit ProposalCreated(newId, msg.sender, _description, deadline);
    }

    /**
     * @notice Cast an encrypted vote on a proposal.
     * @param _proposalId The ID of the proposal to vote on.
     * @param _encryptedVoteFor An encrypted integer (euint32) that is 1 if voting "For", 0 otherwise.
     * @param _encryptedVoteAgainst An encrypted integer (euint32) that is 1 if voting "Against", 0 otherwise.
     * @dev The client is responsible for encrypting the vote. For example, to vote "For",
     * the client sends an encrypted 1 for `_encryptedVoteFor` and an encrypted 0 for `_encryptedVoteAgainst`.
     */
    function castVote(
        uint256 _proposalId,
        euint32 _encryptedVoteFor,
        euint32 _encryptedVoteAgainst
    ) public {
        Proposal storage proposal = proposals[_proposalId];
        
        // --- Validation Checks ---
        require(_proposalId > 0 && _proposalId <= proposalCount, "Proposal does not exist.");
        require(block.timestamp < proposal.votingDeadline, "Voting period has ended.");
        require(!hasVoted[_proposalId][msg.sender], "You have already voted on this proposal.");
        require(!proposal.resultsPublished, "Results have already been published.");

        // Mark the sender as having voted.
        hasVoted[_proposalId][msg.sender] = true;

        // --- Homomorphic Addition ---
        // Add the encrypted vote to the corresponding encrypted counter.
        // This operation is performed on the ciphertexts without revealing the underlying values.
        proposal.encryptedForVotes = FHE.add(proposal.encryptedForVotes, _encryptedVoteFor);
        proposal.encryptedAgainstVotes = FHE.add(proposal.encryptedAgainstVotes, _encryptedVoteAgainst);

        emit Voted(_proposalId, msg.sender);
    }

    /**
     * @notice Initiates the vote tallying process for a completed proposal.
     * @param _proposalId The ID of the proposal to tally.
     * @dev This function can only be called after the voting deadline has passed.
     * It sends the encrypted vote counts to the fhEVM network for decryption.
     */
    function tallyVotes(uint256 _proposalId) public {
        Proposal storage proposal = proposals[_proposalId];
        
        // --- Validation Checks ---
        require(_proposalId > 0 && _proposalId <= proposalCount, "Proposal does not exist.");
        require(block.timestamp >= proposal.votingDeadline, "Voting period has not yet ended.");
        require(!proposal.resultsPublished, "Results have already been published.");

        // Prepare the encrypted data (ciphertexts) for the decryption request.
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(proposal.encryptedForVotes);
        ciphertexts[1] = FHE.toBytes32(proposal.encryptedAgainstVotes);
        
        // Request decryption from the network. The result will be sent to the `publishResults` callback function.
        uint256 requestId = FHE.requestDecryption(ciphertexts, this.publishResults.selector);
        
        // Store the mapping from the network's request ID to our proposal ID to handle the callback correctly.
        requestToProposalId[requestId] = _proposalId;
        
        emit TallyRequested(_proposalId);
    }

    /**
     * @notice The callback function that receives the decrypted vote counts from the fhEVM network.
     * @param _requestId The unique ID for the decryption request.
     * @param _cleartexts The decrypted data as a bytes array.
     * @param _proof A proof to verify the integrity and origin of the decryption.
     * @dev This function is called by the fhEVM network, not by a user directly. It verifies the decryption
     * proof and stores the final plaintext results in the corresponding proposal.
     */
    function publishResults(
        uint256 _requestId,
        bytes memory _cleartexts,
        bytes memory _proof
    ) public {
        uint256 proposalId = requestToProposalId[_requestId];
        require(proposalId != 0, "Invalid decryption request ID.");
        
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.resultsPublished, "Results have already been published for this proposal.");

        // Verify the decryption proof to ensure the data is authentic.
        FHE.checkSignatures(_requestId, _cleartexts, _proof);
        
        // Decode the decrypted plaintext bytes into an array of integers.
        uint32[] memory results = abi.decode(_cleartexts, (uint32[]));
        
        // Store the final results and update the proposal state.
        proposal.finalForVotes = results[0];
        proposal.finalAgainstVotes = results[1];
        proposal.resultsPublished = true;
        
        emit ResultsPublished(proposalId, proposal.finalForVotes, proposal.finalAgainstVotes);
    }

    /**
     * @notice A view function to get the final results of a proposal.
     * @param _proposalId The ID of the proposal.
     * @return forVotes The total number of "For" votes.
     * @return againstVotes The total number of "Against" votes.
     * @return isPublished A boolean indicating if the results are available.
     */
    function getResults(uint256 _proposalId) public view returns (uint32 forVotes, uint32 againstVotes, bool isPublished) {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.id != 0, "Proposal does not exist.");
        return (proposal.finalForVotes, proposal.finalAgainstVotes, proposal.resultsPublished);
    }
}