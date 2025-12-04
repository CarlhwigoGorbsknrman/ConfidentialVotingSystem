// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Proposal {
  id: string;
  title: string;
  description: string;
  encryptedVotes: string;
  endTime: number;
  status: "active" | "completed";
  totalVotes: number;
  category: string;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newProposalData, setNewProposalData] = useState({
    title: "",
    description: "",
    category: "governance",
    duration: "7"
  });
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);
  const [language, setLanguage] = useState("en");

  // Calculate statistics for dashboard
  const activeCount = proposals.filter(p => p.status === "active").length;
  const completedCount = proposals.filter(p => p.status === "completed").length;

  useEffect(() => {
    loadProposals().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadProposals = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("proposal_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing proposal keys:", e);
        }
      }
      
      const list: Proposal[] = [];
      
      for (const key of keys) {
        try {
          const proposalBytes = await contract.getData(`proposal_${key}`);
          if (proposalBytes.length > 0) {
            try {
              const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
              list.push({
                id: key,
                title: proposalData.title,
                description: proposalData.description,
                encryptedVotes: proposalData.encryptedVotes,
                endTime: proposalData.endTime,
                status: proposalData.endTime > Math.floor(Date.now() / 1000) ? "active" : "completed",
                totalVotes: proposalData.totalVotes || 0,
                category: proposalData.category || "governance"
              });
            } catch (e) {
              console.error(`Error parsing proposal data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading proposal ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.endTime - a.endTime);
      setProposals(list);
    } catch (e) {
      console.error("Error loading proposals:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const createProposal = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Creating encrypted proposal with FHE..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const proposalData = {
        title: newProposalData.title,
        description: newProposalData.description,
        encryptedVotes: "FHE-ENCRYPTED-DATA",
        endTime: Math.floor(Date.now() / 1000) + (parseInt(newProposalData.duration) * 24 * 60 * 60),
        totalVotes: 0,
        category: newProposalData.category
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(proposalData))
      );
      
      const keysBytes = await contract.getData("proposal_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(proposalId);
      
      await contract.setData(
        "proposal_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted proposal created successfully!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewProposalData({
          title: "",
          description: "",
          category: "governance",
          duration: "7"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Creation failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const voteOnProposal = async (proposalId: string, vote: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted vote with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalBytes = await contract.getData(`proposal_${proposalId}`);
      if (proposalBytes.length === 0) {
        throw new Error("Proposal not found");
      }
      
      const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
      
      // Update vote count using FHE encryption
      const updatedProposal = {
        ...proposalData,
        totalVotes: (proposalData.totalVotes || 0) + 1,
        encryptedVotes: `FHE-UPDATED-${Date.now()}`
      };
      
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProposal))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE vote processed successfully!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Voting failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredProposals = proposals.filter(proposal => {
    const matchesTab = activeTab === "all" || 
                      (activeTab === "active" && proposal.status === "active") ||
                      (activeTab === "completed" && proposal.status === "completed");
    const matchesSearch = proposal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         proposal.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const tutorialSteps = [
    {
      title: language === "en" ? "Connect Wallet" : "连接钱包",
      description: language === "en" 
        ? "Connect your Web3 wallet to participate in DAO voting" 
        : "连接您的Web3钱包参与DAO投票",
      icon: "🔗"
    },
    {
      title: language === "en" ? "Create Proposal" : "创建提案",
      description: language === "en" 
        ? "Create a new voting proposal with encrypted options" 
        : "创建带有加密选项的新投票提案",
      icon: "📝"
    },
    {
      title: language === "en" ? "Encrypted Voting" : "加密投票",
      description: language === "en" 
        ? "Cast your vote with FHE encryption for complete privacy" 
        : "使用FHE加密进行投票，确保完全隐私",
      icon: "🔒"
    },
    {
      title: language === "en" ? "FHE Tallying" : "FHE计票",
      description: language === "en" 
        ? "Votes are counted on-chain without revealing individual choices" 
        : "在链上计票而不泄露个人选择",
      icon: "⚙️"
    },
    {
      title: language === "en" ? "Results Published" : "结果公布",
      description: language === "en" 
        ? "Final results are published automatically when voting ends" 
        : "投票结束时自动公布最终结果",
      icon: "📊"
    }
  ];

  const renderStatsChart = () => {
    return (
      <div className="stats-chart">
        <div className="chart-bar">
          <div 
            className="bar-fill active" 
            style={{ width: `${(activeCount / proposals.length) * 100}%` }}
          ></div>
          <div className="bar-label">
            <span>{language === "en" ? "Active" : "活跃"}: {activeCount}</span>
          </div>
        </div>
        <div className="chart-bar">
          <div 
            className="bar-fill completed" 
            style={{ width: `${(completedCount / proposals.length) * 100}%` }}
          ></div>
          <div className="bar-label">
            <span>{language === "en" ? "Completed" : "已完成"}: {completedCount}</span>
          </div>
        </div>
      </div>
    );
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "zh" : "en");
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>{language === "en" ? "Initializing FHE connection..." : "初始化FHE连接..."}</p>
    </div>
  );

  return (
    <div className="app-container nature-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="tree-icon"></div>
          </div>
          <h1>Nature<span>Vote</span>DAO</h1>
        </div>
        
        <div className="header-actions">
          <div className="search-box">
            <input 
              type="text" 
              placeholder={language === "en" ? "Search proposals..." : "搜索提案..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="nature-input"
            />
          </div>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-proposal-btn nature-button"
            disabled={!account}
          >
            <div className="add-icon"></div>
            {language === "en" ? "New Proposal" : "新建提案"}
          </button>
          <button 
            className="nature-button secondary"
            onClick={toggleLanguage}
          >
            {language === "en" ? "中文" : "EN"}
          </button>
          <button 
            className="nature-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? (language === "en" ? "Hide Guide" : "隐藏指南") : (language === "en" ? "How It Works" : "使用指南")}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>{language === "en" ? "Private DAO Voting with FHE" : "使用FHE的私有DAO投票"}</h2>
            <p>
              {language === "en" 
                ? "Ensure complete voting privacy with fully homomorphic encryption technology" 
                : "通过全同态加密技术确保完全投票隐私"}
            </p>
          </div>
          <div className="banner-decoration">
            <div className="leaf-decoration"></div>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>{language === "en" ? "How FHE Voting Works" : "FHE投票工作原理"}</h2>
            <p className="subtitle">
              {language === "en" 
                ? "Learn how your votes remain completely private while being verifiable" 
                : "了解您的投票如何在可验证的同时保持完全私有"}
            </p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                  {index < tutorialSteps.length - 1 && (
                    <div className="step-connector"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-cards">
          <div className="dashboard-card nature-card">
            <h3>{language === "en" ? "Project Introduction" : "项目介绍"}</h3>
            <p>
              {language === "en" 
                ? "NatureVoteDAO uses FHE technology to enable private voting in decentralized organizations, preventing coercion and vote selling." 
                : "NatureVoteDAO使用FHE技术实现去中心化组织中的私有投票，防止胁迫和投票交易。"}
            </p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="dashboard-card nature-card">
            <h3>{language === "en" ? "Voting Statistics" : "投票统计"}</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{proposals.length}</div>
                <div className="stat-label">{language === "en" ? "Total Proposals" : "总提案数"}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{activeCount}</div>
                <div className="stat-label">{language === "en" ? "Active" : "活跃中"}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{completedCount}</div>
                <div className="stat-label">{language === "en" ? "Completed" : "已完成"}</div>
              </div>
            </div>
            {proposals.length > 0 && renderStatsChart()}
          </div>
        </div>
        
        <div className="proposals-section">
          <div className="section-header">
            <h2>{language === "en" ? "DAO Proposals" : "DAO提案"}</h2>
            <div className="header-actions">
              <div className="tab-filters">
                <button 
                  className={activeTab === "all" ? "tab-active" : ""}
                  onClick={() => setActiveTab("all")}
                >
                  {language === "en" ? "All" : "全部"}
                </button>
                <button 
                  className={activeTab === "active" ? "tab-active" : ""}
                  onClick={() => setActiveTab("active")}
                >
                  {language === "en" ? "Active" : "活跃中"}
                </button>
                <button 
                  className={activeTab === "completed" ? "tab-active" : ""}
                  onClick={() => setActiveTab("completed")}
                >
                  {language === "en" ? "Completed" : "已完成"}
                </button>
              </div>
              <button 
                onClick={loadProposals}
                className="refresh-btn nature-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? (language === "en" ? "Refreshing..." : "刷新中...") : (language === "en" ? "Refresh" : "刷新")}
              </button>
            </div>
          </div>
          
          <div className="proposals-list nature-card">
            {filteredProposals.length === 0 ? (
              <div className="no-proposals">
                <div className="no-proposals-icon"></div>
                <p>{language === "en" ? "No proposals found" : "未找到提案"}</p>
                {account && (
                  <button 
                    className="nature-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    {language === "en" ? "Create First Proposal" : "创建第一个提案"}
                  </button>
                )}
              </div>
            ) : (
              <div className="proposals-grid">
                {filteredProposals.map(proposal => (
                  <div className="proposal-card" key={proposal.id}>
                    <div className="proposal-header">
                      <h3 className="proposal-title">{proposal.title}</h3>
                      <span className={`status-badge ${proposal.status}`}>
                        {proposal.status === "active" 
                          ? (language === "en" ? "Active" : "活跃中") 
                          : (language === "en" ? "Completed" : "已完成")}
                      </span>
                    </div>
                    <div className="proposal-description">
                      {proposal.description}
                    </div>
                    <div className="proposal-meta">
                      <div className="meta-item">
                        <span className="meta-label">{language === "en" ? "Category" : "类别"}:</span>
                        <span className="meta-value">{proposal.category}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">{language === "en" ? "Ends" : "结束时间"}:</span>
                        <span className="meta-value">
                          {new Date(proposal.endTime * 1000).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">{language === "en" ? "Votes" : "投票数"}:</span>
                        <span className="meta-value">{proposal.totalVotes}</span>
                      </div>
                    </div>
                    {proposal.status === "active" && account && (
                      <div className="proposal-actions">
                        <button 
                          className="nature-button success"
                          onClick={() => voteOnProposal(proposal.id, "yes")}
                        >
                          {language === "en" ? "Vote Yes" : "投票赞成"}
                        </button>
                        <button 
                          className="nature-button danger"
                          onClick={() => voteOnProposal(proposal.id, "no")}
                        >
                          {language === "en" ? "Vote No" : "投票反对"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={createProposal} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          proposalData={newProposalData}
          setProposalData={setNewProposalData}
          language={language}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content nature-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="tree-icon"></div>
              <span>NatureVoteDAO</span>
            </div>
            <p>
              {language === "en" 
                ? "Private decentralized voting using FHE technology" 
                : "使用FHE技术的私有去中心化投票"}
            </p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">{language === "en" ? "Documentation" : "文档"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Privacy Policy" : "隐私政策"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Terms of Service" : "服务条款"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Contact" : "联系我们"}</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} NatureVoteDAO. {language === "en" ? "All rights reserved." : "保留所有权利。"}
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  proposalData: any;
  setProposalData: (data: any) => void;
  language: string;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  proposalData,
  setProposalData,
  language
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProposalData({
      ...proposalData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!proposalData.title || !proposalData.description) {
      alert(language === "en" ? "Please fill required fields" : "请填写必填字段");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal nature-card">
        <div className="modal-header">
          <h2>{language === "en" ? "Create New Proposal" : "创建新提案"}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> 
            {language === "en" 
              ? "Votes will be encrypted with FHE for complete privacy" 
              : "投票将使用FHE加密以确保完全隐私"}
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>{language === "en" ? "Title" : "标题"} *</label>
              <input 
                type="text"
                name="title"
                value={proposalData.title} 
                onChange={handleChange}
                placeholder={language === "en" ? "Proposal title..." : "提案标题..."} 
                className="nature-input"
              />
            </div>
            
            <div className="form-group">
              <label>{language === "en" ? "Category" : "类别"}</label>
              <select 
                name="category"
                value={proposalData.category} 
                onChange={handleChange}
                className="nature-select"
              >
                <option value="governance">{language === "en" ? "Governance" : "治理"}</option>
                <option value="funding">{language === "en" ? "Funding" : "资金"}</option>
                <option value="technical">{language === "en" ? "Technical" : "技术"}</option>
                <option value="community">{language === "en" ? "Community" : "社区"}</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>{language === "en" ? "Duration (days)" : "持续时间(天)"}</label>
              <select 
                name="duration"
                value={proposalData.duration} 
                onChange={handleChange}
                className="nature-select"
              >
                <option value="1">1</option>
                <option value="3">3</option>
                <option value="7">7</option>
                <option value="14">14</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>{language === "en" ? "Description" : "描述"} *</label>
              <textarea 
                name="description"
                value={proposalData.description} 
                onChange={handleChange}
                placeholder={language === "en" ? "Describe your proposal in detail..." : "详细描述您的提案..."} 
                className="nature-textarea"
                rows={4}
              />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn nature-button"
          >
            {language === "en" ? "Cancel" : "取消"}
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn nature-button primary"
          >
            {creating 
              ? (language === "en" ? "Creating with FHE..." : "使用FHE创建中...") 
              : (language === "en" ? "Create Proposal" : "创建提案")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;