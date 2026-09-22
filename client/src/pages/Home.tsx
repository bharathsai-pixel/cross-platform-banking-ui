import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Home as HomeIcon,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  X,
  Zap,
} from "lucide-react";

type Activity = {
  name: string;
  note: string;
  date: string;
  amount: string;
  direction: "in" | "out";
  icon: "send" | "building" | "card" | "wallet";
  category: string;
};

const activities: Activity[] = [
  { name: "Razorpay", note: "Online payment · UPI", date: "Today, 10:42 AM", amount: "− ₹1,240.00", direction: "out", icon: "send", category: "Payments" },
  { name: "Salary credit", note: "HDFC Bank · **** 4081", date: "Today, 08:15 AM", amount: "+ ₹68,500.00", direction: "in", icon: "building", category: "Income" },
  { name: "Swiggy", note: "Food & dining · Card", date: "Yesterday, 09:18 PM", amount: "− ₹684.00", direction: "out", icon: "card", category: "Food" },
  { name: "Rahul Mehta", note: "Received via NexusPay", date: "Yesterday, 04:03 PM", amount: "+ ₹2,500.00", direction: "in", icon: "wallet", category: "Transfer" },
  { name: "Netflix", note: "Subscriptions · Card", date: "18 Sep, 11:30 AM", amount: "− ₹649.00", direction: "out", icon: "card", category: "Subscriptions" },
];

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Accounts", icon: Wallet },
  { label: "Payments", icon: Send },
  { label: "Activity", icon: FileText },
];

const chartPaths = {
  area: "M0 167 C35 155 45 127 79 143 C112 159 126 108 160 118 C194 128 205 133 238 115 C270 97 286 109 317 88 C348 67 364 79 397 59 C430 40 447 60 476 38 C508 14 526 34 561 26 C592 20 613 28 648 9 L648 192 L0 192 Z",
  line: "M0 167 C35 155 45 127 79 143 C112 159 126 108 160 118 C194 128 205 133 238 115 C270 97 286 109 317 88 C348 67 364 79 397 59 C430 40 447 60 476 38 C508 14 526 34 561 26 C592 20 613 28 648 9",
};

function ActivityIcon({ type }: { type: Activity["icon"] }) {
  const Icon = type === "building" ? Building2 : type === "card" ? CreditCard : type === "wallet" ? Wallet : Send;
  return <Icon size={17} strokeWidth={2.2} />;
}

function Home() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferSent, setTransferSent] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  const filteredActivities = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return activities;
    return activities.filter((item) => `${item.name} ${item.note} ${item.category}`.toLowerCase().includes(query));
  }, [search]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function copyAccount() {
    navigator.clipboard?.writeText("1234 5678 9012");
    notify("Account number copied");
  }

  function sendTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTransferSent(true);
    window.setTimeout(() => {
      setShowTransfer(false);
      setTransferSent(false);
      notify("Transfer scheduled successfully");
    }, 1300);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><span>N</span></div>
          <div>
            <div className="brand-name">Nexus<span>Pay</span></div>
            <div className="brand-caption">Banking & FinTech Platform</div>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={20} /></button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">BS</div>
          <div className="workspace-text"><strong>Personal account</strong><span>Primary workspace</span></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <div className="nav-section-label">Workspace</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`side-nav-item ${activeTab === label ? "active" : ""}`} onClick={() => { setActiveTab(label); setMobileNav(false); }}>
              <Icon size={18} /> <span>{label}</span>
              {label === "Activity" && <span className="nav-count">12</span>}
            </button>
          ))}
        </nav>

        <div className="nav-section-label">Tools</div>
        <nav className="side-nav">
          <button className="side-nav-item" onClick={() => notify("Cards are coming soon")}><CreditCard size={18} /><span>Cards</span><span className="new-pill">New</span></button>
          <button className="side-nav-item" onClick={() => notify("Reports are coming soon")}><FileText size={18} /><span>Reports</span></button>
          <button className="side-nav-item" onClick={() => notify("Settings are coming soon")}><Settings size={18} /><span>Settings</span></button>
        </nav>

        <div className="sidebar-bottom">
          <div className="security-note"><div className="security-icon"><ShieldCheck size={17} /></div><div><strong>You're protected</strong><span>256-bit encrypted</span></div></div>
          <button className="profile-button"><div className="avatar">BR</div><div className="profile-copy"><strong>Bharath Sai</strong><span>Personal</span></div><MoreHorizontal size={17} className="muted-icon" /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="breadcrumb"><span className="breadcrumb-muted">Workspace</span><ChevronRight size={14} /><strong>{activeTab}</strong></div>
          <div className="topbar-actions">
            <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity" /><kbd>⌘ K</kbd></label>
            <div className="notification-wrap">
              <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setShowNotifications((value) => !value)}><Bell size={19} /><span className="notification-dot" /></button>
              {showNotifications && <div className="notification-popover"><div className="popover-title"><strong>Notifications</strong><span>2 new</span></div><p><span className="alert-dot coral" /> Your monthly statement is ready.</p><p><span className="alert-dot blue" /> New device signed in securely.</p></div>}
            </div>
            <div className="top-avatar">BR</div>
          </div>
        </header>

        <div className="content-wrap">
          <section className="page-intro">
            <div><div className="eyebrow"><span className="live-dot" /> All systems operational</div><h1>Good morning, Bharath <span className="wave">✦</span></h1><p>Here’s your financial snapshot for <strong>Monday, 22 September 2025</strong>.</p></div>
            <button className="primary-button" onClick={() => setShowTransfer(true)}><Plus size={17} /> New transfer</button>
          </section>

          {activeTab !== "Overview" && <div className="section-note"><Sparkles size={17} /><span><strong>{activeTab} view</strong> is ready to explore. This demo keeps the core experience in one calm workspace.</span></div>}

          <section className="stats-grid" aria-label="Account summary">
            <div className="stat-card stat-card-featured"><div className="stat-top"><span>Total balance</span><button className="plain-icon" onClick={() => setHideBalance((value) => !value)} aria-label={hideBalance ? "Show balance" : "Hide balance"}>{hideBalance ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><div className="stat-value">{hideBalance ? "••••••" : "₹ 1,84,250.40"}</div><div className="stat-foot"><span className="trend-up"><ArrowUpRight size={14} /> 12.8%</span><span>vs last month</span></div></div>
            <div className="stat-card"><div className="stat-top"><span>Money in</span><div className="stat-icon stat-icon-green"><ArrowDownLeft size={17} /></div></div><div className="stat-value compact">₹ 72,500.00</div><div className="stat-foot"><span className="trend-up">+ 8.4%</span><span>this month</span></div></div>
            <div className="stat-card"><div className="stat-top"><span>Money out</span><div className="stat-icon stat-icon-coral"><ArrowUpRight size={17} /></div></div><div className="stat-value compact">₹ 28,240.60</div><div className="stat-foot"><span className="trend-down">− 3.1%</span><span>this month</span></div></div>
            <div className="stat-card stat-card-score"><div className="stat-top"><span>Financial score</span><div className="score-badge">Good</div></div><div className="score-row"><div className="score-number">782</div><div className="score-bar"><span /></div></div><div className="stat-foot"><span>Top 18% of users</span><ChevronRight size={14} className="muted-icon" /></div></div>
          </section>

          <section className="main-grid">
            <div className="panel chart-panel">
              <div className="panel-header"><div><h2>Cash flow</h2><p>Track how your money moves over time</p></div><button className="select-button">This month <ChevronDown size={15} /></button></div>
              <div className="chart-legend"><span><i className="legend-swatch income" /> Money in <strong>₹72.5k</strong></span><span><i className="legend-swatch expense" /> Money out <strong>₹28.2k</strong></span></div>
              <div className="chart-wrap"><div className="chart-y-labels"><span>₹80k</span><span>₹60k</span><span>₹40k</span><span>₹20k</span><span>₹0</span></div><svg viewBox="0 0 648 192" preserveAspectRatio="none" className="cash-chart" role="img" aria-label="Cash flow trend rises through the month"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2d73db" stopOpacity=".24" /><stop offset="100%" stopColor="#2d73db" stopOpacity="0" /></linearGradient></defs><g className="chart-grid"><line x1="0" x2="648" y1="0" y2="0" /><line x1="0" x2="648" y1="48" y2="48" /><line x1="0" x2="648" y1="96" y2="96" /><line x1="0" x2="648" y1="144" y2="144" /><line x1="0" x2="648" y1="191" y2="191" /></g><path d={chartPaths.area} fill="url(#chart-fill)" /><path d={chartPaths.line} fill="none" stroke="#2d73db" strokeWidth="3" strokeLinecap="round" /><circle cx="397" cy="59" r="5" fill="#fff" stroke="#2d73db" strokeWidth="3" /><circle cx="648" cy="9" r="5" fill="#fff" stroke="#2d73db" strokeWidth="3" /></svg><div className="chart-x-labels"><span>01 Sep</span><span>07 Sep</span><span>14 Sep</span><span>21 Sep</span><span>30 Sep</span></div></div>
            </div>

            <div className="panel account-panel"><div className="account-card"><div className="account-card-top"><span className="chip-logo">◈</span><span className="account-chip">Primary account</span></div><div className="account-balance">₹ 1,84,250<span>.40</span></div><div className="account-number">•••• &nbsp; •••• &nbsp; 9012 <button className="plain-icon light" onClick={copyAccount} aria-label="Copy account number"><Copy size={14} /></button></div><div className="account-card-bottom"><span>BHARATH SAI REDDY</span><span>VISA <i /></span></div></div><div className="account-meta"><div><span>Account type</span><strong>Savings account</strong></div><div><span>Available to spend</span><strong>₹ 1,54,820.40</strong></div></div><button className="outline-button full-width" onClick={() => notify("Account details opened")}>View account details <ChevronRight size={16} /></button></div>
          </section>

          <section className="lower-grid">
            <div className="panel activity-panel"><div className="panel-header activity-header"><div><h2>Recent activity</h2><p>Your latest account movements</p></div><button className="text-button" onClick={() => { setActiveTab("Activity"); setSearch(""); }}>See all <ChevronRight size={15} /></button></div><div className="activity-list">{filteredActivities.length ? filteredActivities.map((activity) => <div className="activity-row" key={`${activity.name}-${activity.date}`}><div className={`activity-icon ${activity.direction === "in" ? "in" : "out"}`}><ActivityIcon type={activity.icon} /></div><div className="activity-main"><strong>{activity.name}</strong><span>{activity.note}</span></div><div className="activity-date">{activity.date}</div><div className={`activity-amount ${activity.direction}`}>{activity.amount}</div><button className="row-more" aria-label={`More actions for ${activity.name}`} onClick={() => notify(`${activity.name} selected`)}><MoreHorizontal size={18} /></button></div>) : <div className="empty-state"><Search size={20} /><strong>No matching activity</strong><span>Try a different search term.</span></div>}</div></div>
            <div className="panel quick-panel"><div className="panel-header"><div><h2>Quick actions</h2><p>Make everyday banking easier</p></div><Zap size={19} className="accent-icon" /></div><div className="quick-actions"><button className="quick-action" onClick={() => setShowTransfer(true)}><span className="quick-icon blue-bg"><Send size={18} /></span><span><strong>Send money</strong><small>To a bank or contact</small></span><ChevronRight size={16} /></button><button className="quick-action" onClick={() => notify("Add money flow opened")}><span className="quick-icon green-bg"><Plus size={19} /></span><span><strong>Add money</strong><small>From another account</small></span><ChevronRight size={16} /></button><button className="quick-action" onClick={() => notify("Bill payments are coming soon")}><span className="quick-icon coral-bg"><FileText size={18} /></span><span><strong>Pay a bill</strong><small>Utilities and subscriptions</small></span><ChevronRight size={16} /></button></div></div>
          </section>

          <section className="secure-banner"><div className="secure-banner-icon"><ShieldCheck size={22} /></div><div><strong>Banking that stays one step ahead.</strong><span>Your data is protected with end-to-end encryption and real-time activity monitoring.</span></div><button onClick={() => notify("Security center opened")}>Security center <ChevronRight size={16} /></button></section>
          <footer className="app-footer"><span>NexusPay · Cross-platform transaction application</span><span><Smartphone size={14} /> Designed for web & mobile</span></footer>
        </div>
      </main>

      {showTransfer && <div className="modal-backdrop" onClick={() => setShowTransfer(false)}><div className="transfer-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><div className="eyebrow">Secure transfer</div><h2>Send money</h2><p>Move funds to a bank account or trusted contact.</p></div><button className="icon-button" onClick={() => setShowTransfer(false)} aria-label="Close transfer dialog"><X size={20} /></button></div>{transferSent ? <div className="success-state"><div className="success-check"><ShieldCheck size={25} /></div><h3>Transfer ready to go</h3><p>We’re securely scheduling your transfer.</p></div> : <form onSubmit={sendTransfer}><label>Recipient<input required placeholder="Name or UPI ID" /></label><label>Amount<div className="amount-input"><span>₹</span><input required type="number" min="1" placeholder="0.00" /></div></label><label>Note <span className="optional">Optional</span><input placeholder="What’s this for?" /></label><div className="modal-footnote"><ShieldCheck size={15} /> Protected by NexusPay secure authorization</div><button className="primary-button wide" type="submit"><Send size={17} /> Review transfer</button></form>}</div></div>}
      {toast && <div className="toast"><ShieldCheck size={17} /><span>{toast}</span></div>}
    </div>
  );
}

export default Home;
