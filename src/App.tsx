/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Send, 
  Search, 
  History, 
  Settings, 
  Lock, 
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  MessageSquare,
  Terminal,
  ExternalLink,
  LogIn,
  LogOut,
  User,
  Mail,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeThreat, getChatResponse, type AnalysisResult } from './services/ai';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import { supabase } from './lib/supabase';
import { Toaster, toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  analysis?: AnalysisResult;
  timestamp: Date;
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'settings'>('chat');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        if (session) fetchHistory(session.user.id);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        if (session) fetchHistory(session.user.id);
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const fetchHistory = async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('analysis_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching history:', error);
    } else {
      setHistory(data || []);
    }
  };

  const saveToHistory = async (content: string, result: AnalysisResult) => {
    if (!supabase || !session) return;
    
    const { error } = await supabase
      .from('analysis_history')
      .insert({
        user_id: session.user.id,
        content,
        score: result.score,
        level: result.level,
        type: result.type,
        findings: result.findings,
        recommendations: result.recommendations,
        explanation: result.explanation
      });

    if (error) {
      console.error('Error saving to history:', error);
    } else {
      fetchHistory(session.user.id);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!supabase) {
      const msg = 'Supabase client is not initialized. Please ensure your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are correctly set in the Secrets panel.';
      setAuthError(msg);
      console.error(msg);
      return;
    }

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          console.error('Supabase Login Error:', error);
          throw error;
        }
        toast.success('Successfully logged in!');
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          console.error('Supabase Signup Error:', error);
          throw error;
        }
        toast.success('Account created! Please check your email for a confirmation link before logging in.');
      }
    } catch (error: any) {
      let message = error.message || 'An unknown error occurred during authentication.';
      
      // Map Supabase errors to more user-friendly messages
      if (message.includes('Invalid login credentials')) {
        message = 'Incorrect email or password. Please check your credentials or sign up if you haven\'t already.';
      } else if (message.includes('can only request this after')) {
        const seconds = message.match(/\d+/)?.[0] || '60';
        message = `Security rate limit: Please wait ${seconds} seconds before trying to sign up again.`;
      } else if (message.includes('Email not confirmed')) {
        message = 'Please check your inbox and confirm your email address before logging in.';
      }
      
      setAuthError(message);
      if (message.toLowerCase().includes('api key')) {
        console.error('DETECTED INVALID SUPABASE API KEY. Check your VITE_SUPABASE_ANON_KEY.');
      }
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setView('landing');
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isAnalyzing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsAnalyzing(true);

    try {
      const isAnalysisRequest = input.toLowerCase().includes('check') || 
                                input.toLowerCase().includes('analyze') || 
                                input.includes('http') ||
                                input.length > 50;

      let assistantMessage: Message;

      if (isAnalysisRequest) {
        const result = await analyzeThreat(input);
        assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.explanation,
          analysis: result,
          timestamp: new Date(),
        };
        // Save to Supabase if logged in
        if (session) {
          saveToHistory(input, result);
        }
      } else {
        const response = await getChatResponse(input, []);
        assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response,
          timestamp: new Date(),
        };
      }

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I encountered an error while processing your request. Please check your connection and try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 1. LANDING PAGE VIEW
  if (!session && view === 'landing') {
    return (
      <div className="min-h-screen bg-[#05070a] text-slate-200 cyber-grid overflow-x-hidden">
        <Toaster position="top-center" theme="dark" />
        {/* Navigation */}
        <nav className="h-20 border-b border-white/5 flex items-center justify-between px-8 md:px-20 bg-[#05070a]/50 backdrop-blur-xl fixed top-0 w-full z-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center border border-sky-500/30">
              <Shield className="w-6 h-6 text-sky-400" />
            </div>
            <span className="text-xl font-bold tracking-tighter">AEGIS <span className="text-sky-400">AI</span></span>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => { setAuthMode('login'); setView('auth'); }}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Sign In
            </button>
            <button 
              onClick={() => { setAuthMode('signup'); setView('auth'); }}
              className="bg-sky-500 hover:bg-sky-400 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-sky-500/20"
            >
              Get Started
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="pt-40 pb-20 px-8 md:px-20 max-w-7xl mx-auto flex flex-col items-center text-center space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-mono uppercase tracking-widest"
          >
            <Lock className="w-3 h-3" />
            <span>Next-Gen Cybersecurity Intelligence</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl leading-[1.1]"
          >
            Shield Your Digital Life with <span className="text-sky-400">Multi-Layer AI</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-slate-400 text-lg md:text-xl max-w-2xl"
          >
            Aegis AI uses advanced semantic and behavioral analysis to detect phishing, scams, and malicious threats before they strike.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 pt-4"
          >
            <button 
              onClick={() => { setAuthMode('signup'); setView('auth'); }}
              className="bg-sky-500 hover:bg-sky-400 text-white px-10 py-4 rounded-2xl text-lg font-bold transition-all shadow-xl shadow-sky-500/20 flex items-center justify-center gap-3 group"
            >
              Start Free Analysis
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>

          {/* Floating UI Preview */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="w-full max-w-5xl mt-20 relative"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-sky-500 to-indigo-500 rounded-3xl blur opacity-20" />
            <div className="relative glass rounded-3xl overflow-hidden shadow-2xl border border-white/10">
              <div className="h-12 bg-white/5 border-b border-white/5 flex items-center px-6 gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/50" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                </div>
                <div className="mx-auto bg-white/5 px-4 py-1 rounded-lg text-[10px] font-mono text-slate-500">
                  https://aegis-ai.security/portal
                </div>
              </div>
              <div className="p-8 grid grid-cols-3 gap-6 opacity-50 grayscale hover:grayscale-0 transition-all duration-700">
                <div className="col-span-1 space-y-4">
                  <div className="h-8 w-32 bg-white/10 rounded-lg flex items-center px-3">
                    <div className="w-2 h-2 rounded-full bg-sky-400 mr-2" />
                    <span className="text-[10px] font-bold text-sky-400 uppercase tracking-tighter">Active Scan</span>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-full bg-white/5 rounded-lg flex items-center px-2">
                      <span className="text-[8px] text-slate-500">Analyzing semantic intent...</span>
                    </div>
                    <div className="h-4 w-2/3 bg-white/5 rounded-lg flex items-center px-2">
                      <span className="text-[8px] text-slate-500">Checking domain reputation...</span>
                    </div>
                    <div className="h-4 w-3/4 bg-white/5 rounded-lg flex items-center px-2">
                      <span className="text-[8px] text-slate-500">Behavioral risk: LOW</span>
                    </div>
                  </div>
                </div>
                <div className="col-span-2 glass rounded-2xl h-64 p-6 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">THREAT_DETECTION_LOG</span>
                      <span className="text-[10px] font-mono text-emerald-400">SECURE</span>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <p className="text-[10px] text-slate-300 leading-relaxed">
                        "Urgent: Your account will be suspended in 2 hours. Click here to verify your identity."
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <div className="px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded text-[8px] text-rose-400">Urgency Detected</div>
                      <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[8px] text-amber-400">Suspicious Link</div>
                    </div>
                  </div>
                  <div className="h-12 w-full bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center px-4 justify-between">
                    <span className="text-[10px] font-bold text-sky-400">AI ANALYSIS COMPLETE</span>
                    <ShieldCheck className="w-4 h-4 text-sky-400" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Features Grid */}
        <section className="py-32 px-8 md:px-20 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<ShieldAlert className="text-rose-400" />}
            title="Semantic Analysis"
            desc="Gemini-powered engine understands intent, detecting subtle social engineering cues that traditional filters miss."
          />
          <FeatureCard 
            icon={<Search className="text-sky-400" />}
            title="URL Intelligence"
            desc="Real-time scanning of domain reputation, structure, and redirection patterns to identify phishing vectors."
          />
          <FeatureCard 
            icon={<AlertTriangle className="text-amber-400" />}
            title="Behavioral Risk"
            desc="Analyzes psychological triggers like urgency, fear, and authority used in modern cyber attacks."
          />
        </section>

        {/* Footer */}
        <footer className="py-20 border-t border-white/5 px-8 md:px-20">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-sky-400" />
              <span className="text-lg font-bold">AEGIS AI</span>
            </div>
            <p className="text-slate-500 text-sm">© 2026 Aegis Intelligence Systems. All rights reserved.</p>
            <div className="flex gap-6 text-sm text-slate-400">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // 2. AUTH VIEW
  if (!session && view === 'auth') {
    return (
      <div className="min-h-screen bg-[#05070a] flex items-center justify-center p-6 cyber-grid relative overflow-hidden">
        <Toaster position="top-center" theme="dark" />
        
        <button 
          onClick={() => setView('landing')}
          className="absolute top-8 left-8 text-slate-500 hover:text-sky-400 transition-colors flex items-center gap-2 text-sm z-10"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Portal
        </button>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass rounded-3xl p-8 space-y-8 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-sky-500/50" />
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20 mx-auto mb-6">
              <Shield className="w-8 h-8 text-sky-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">AEGIS <span className="text-sky-400">AI</span></h1>
            <p className="text-slate-400 text-sm">Secure Intelligence Portal</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-sky-500/50 outline-none transition-all"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Access Key</label>
                <button 
                  type="button"
                  onClick={() => toast.info('Password reset is currently disabled for this demo.')}
                  className="text-[10px] text-slate-500 hover:text-sky-400 transition-colors"
                >
                  Forgot Key?
                </button>
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-sky-500/50 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-xs text-rose-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>{authMode === 'login' ? 'Initialize Session' : 'Create Account'}</span>
            </button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
                setAuthError('');
              }}
              className="text-xs text-slate-500 hover:text-sky-400 transition-colors"
            >
              {authMode === 'login' ? "Don't have an account? Request Access" : "Already have an account? Sign In"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 3. APP VIEW (When logged in)
  return (
    <div className="flex h-screen bg-[#05070a] text-slate-200 overflow-hidden cyber-grid">
      <Toaster position="top-center" theme="dark" />
      {/* Sidebar */}
      <aside className="w-20 md:w-64 border-r border-white/10 flex flex-col items-center md:items-stretch bg-[#0d1117] z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center border border-sky-500/30">
            <Shield className="w-6 h-6 text-sky-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight hidden md:block">
            AEGIS <span className="text-sky-400">AI</span>
          </h1>
        </div>

        <nav className="flex-1 px-3 space-y-2">
          <SidebarItem 
            icon={<MessageSquare className="w-5 h-5" />} 
            label="Assistant" 
            active={activeTab === 'chat'} 
            onClick={() => setActiveTab('chat')}
          />
          <SidebarItem 
            icon={<History className="w-5 h-5" />} 
            label="History" 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')}
          />
          <SidebarItem 
            icon={<Settings className="w-5 h-5" />} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
          />
        </nav>

        <div className="p-4 border-t border-white/5 space-y-2">
          <div className="glass rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sky-500/20 flex items-center justify-center text-xs font-bold text-sky-400">
              {session?.user?.email?.[0].toUpperCase() || 'U'}
            </div>
            <div className="hidden md:block overflow-hidden">
              <p className="text-xs font-medium truncate">{session?.user?.email || 'User'}</p>
              <p className="text-[10px] text-slate-500">Active Session</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-rose-400 transition-colors text-xs"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:block">Terminate Session</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#05070a]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">System Online</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
            <div className="h-4 w-[1px] bg-white/10" />
            <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
              <Lock className="w-3 h-3" />
              <span>ENCRYPTED SESSION</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'chat' && (
            <>
              {/* Chat Area */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
              >
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-8">
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-20 h-20 rounded-3xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20 shadow-[0_0_50px_-12px_rgba(14,165,233,0.3)]"
                    >
                      <Shield className="w-10 h-10 text-sky-400" />
                    </motion.div>
                    <div className="space-y-2">
                      <h2 className="text-3xl font-bold tracking-tight">Aegis Intelligence Engine</h2>
                      <p className="text-slate-400">
                        Submit any suspicious URL, email content, or message for multi-layer threat analysis. 
                        I'll provide a risk score and detailed security report.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                      <QuickAction 
                        icon={<ShieldAlert className="text-rose-400" />} 
                        title="Analyze URL" 
                        desc="Check for phishing domains" 
                        onClick={() => setInput("Analyze this URL: http://secure-login-bank.com/verify-account")}
                      />
                      <QuickAction 
                        icon={<AlertTriangle className="text-amber-400" />} 
                        title="Scan Email" 
                        desc="Detect social engineering" 
                        onClick={() => setInput("Scan this email: 'Your account will be suspended in 2 hours. Click here to verify now.'")}
                      />
                    </div>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex gap-4 max-w-4xl",
                        msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-1",
                        msg.role === 'user' ? "bg-slate-700" : "bg-sky-500/20 border border-sky-500/30"
                      )}>
                        {msg.role === 'user' ? <div className="text-[10px] font-bold">U</div> : <Shield className="w-4 h-4 text-sky-400" />}
                      </div>
                      <div className={cn(
                        "space-y-4",
                        msg.role === 'user' ? "items-end" : "items-start"
                      )}>
                        <div className={cn(
                          "p-4 rounded-2xl text-sm leading-relaxed",
                          msg.role === 'user' 
                            ? "bg-sky-600 text-white rounded-tr-none" 
                            : "glass rounded-tl-none"
                        )}>
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>

                        {msg.analysis && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass rounded-2xl overflow-hidden border-white/10 w-full max-w-xl"
                          >
                            <div className={cn(
                              "p-4 flex items-center justify-between border-b border-white/5",
                              msg.analysis.level === 'HIGH' ? "bg-rose-500/10" : 
                              msg.analysis.level === 'MEDIUM' ? "bg-amber-500/10" : "bg-emerald-500/10"
                            )}>
                              <div className="flex items-center gap-3">
                                {msg.analysis.level === 'HIGH' ? <ShieldAlert className="w-5 h-5 text-rose-500" /> : 
                                 msg.analysis.level === 'MEDIUM' ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : 
                                 <ShieldCheck className="w-5 h-5 text-emerald-500" />}
                                <div>
                                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Threat Level</p>
                                  <p className={cn(
                                    "font-bold",
                                    msg.analysis.level === 'HIGH' ? "text-rose-500" : 
                                    msg.analysis.level === 'MEDIUM' ? "text-amber-500" : "text-emerald-500"
                                  )}>{msg.analysis.level}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Risk Score</p>
                                <p className="text-xl font-bold font-mono">{msg.analysis.score}%</p>
                              </div>
                            </div>
                            
                            <div className="p-4 space-y-4">
                              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                                <Terminal className="w-3 h-3" />
                                <span>ANALYSIS_LOG_v1.0.4</span>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <h4 className="text-xs font-bold uppercase text-slate-500">Findings</h4>
                                  <ul className="space-y-1">
                                    {msg.analysis.findings.map((f, i) => (
                                      <li key={i} className="text-xs flex items-start gap-2">
                                        <ChevronRight className="w-3 h-3 mt-0.5 text-sky-500" />
                                        <span>{f}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="space-y-2">
                                  <h4 className="text-xs font-bold uppercase text-slate-500">Recommendations</h4>
                                  <ul className="space-y-1">
                                    {msg.analysis.recommendations.map((r, i) => (
                                      <li key={i} className="text-xs flex items-start gap-2">
                                        <div className="w-1 h-1 rounded-full bg-sky-500 mt-1.5" />
                                        <span>{r}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {isAnalyzing && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex gap-4"
                    >
                      <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-sky-400 animate-pulse" />
                      </div>
                      <div className="glass p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:-0.3s]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:-0.15s]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce" />
                        </div>
                        <span className="text-xs font-mono text-sky-400 uppercase tracking-widest">Running Multi-Layer Scan...</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Input Area */}
              <div className="p-6 bg-[#05070a]/80 backdrop-blur-md border-t border-white/10">
                <form 
                  onSubmit={handleSend}
                  className="max-w-4xl mx-auto relative"
                >
                  <div className="absolute inset-0 bg-sky-500/5 blur-xl rounded-full pointer-events-none" />
                  <div className="relative glass rounded-2xl p-2 flex items-center gap-2">
                    <div className="pl-3">
                      <Search className="w-5 h-5 text-slate-500" />
                    </div>
                    <input 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Paste URL or message for analysis..."
                      className="flex-1 bg-transparent border-none outline-none py-3 text-sm placeholder:text-slate-600"
                    />
                    <button 
                      type="submit"
                      disabled={!input.trim() || isAnalyzing}
                      className={cn(
                        "p-3 rounded-xl transition-all flex items-center gap-2",
                        input.trim() && !isAnalyzing 
                          ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20 hover:bg-sky-400" 
                          : "bg-slate-800 text-slate-500 cursor-not-allowed"
                      )}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider hidden md:block">Analyze</span>
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[10px] text-center mt-3 text-slate-600 font-mono uppercase tracking-widest">
                    Powered by Aegis Multi-Layer Intelligence Engine
                  </p>
                </form>
              </div>
            </>
          )}

          {activeTab === 'history' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Analysis History</h2>
                    <p className="text-slate-400">Review your past threat assessments and security reports.</p>
                  </div>
                  <button 
                    onClick={() => session && fetchHistory(session.user.id)}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                      <History className="w-8 h-8 text-slate-500" />
                    </div>
                    <p className="text-slate-400 max-w-md mx-auto">
                      No analysis history found. Start a new scan in the Assistant tab to see results here.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {history.map((item) => (
                      <motion.div 
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass rounded-2xl overflow-hidden border-white/10 hover:border-sky-500/30 transition-all group"
                      >
                        <div className={cn(
                          "p-4 flex items-center justify-between border-b border-white/5",
                          item.level === 'HIGH' ? "bg-rose-500/10" : 
                          item.level === 'MEDIUM' ? "bg-amber-500/10" : "bg-emerald-500/10"
                        )}>
                          <div className="flex items-center gap-3">
                            {item.level === 'HIGH' ? <ShieldAlert className="w-5 h-5 text-rose-500" /> : 
                             item.level === 'MEDIUM' ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : 
                             <ShieldCheck className="w-5 h-5 text-emerald-500" />}
                            <div>
                              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                                {new Date(item.created_at).toLocaleDateString()} • {new Date(item.created_at).toLocaleTimeString()}
                              </p>
                              <p className={cn(
                                "font-bold",
                                item.level === 'HIGH' ? "text-rose-500" : 
                                item.level === 'MEDIUM' ? "text-amber-500" : "text-emerald-500"
                              )}>{item.level} RISK - {item.type}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Score</p>
                            <p className="text-xl font-bold font-mono">{item.score}%</p>
                          </div>
                        </div>
                        <div className="p-4">
                          <p className="text-sm font-medium text-slate-300 line-clamp-2 mb-2">"{item.content}"</p>
                          <p className="text-xs text-slate-500 leading-relaxed">{item.explanation}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="flex-1 p-12 max-w-4xl mx-auto w-full space-y-12">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
                <p className="text-slate-400">Configure your Aegis AI experience and security preferences.</p>
              </div>

              <div className="space-y-6">
                <div className="glass p-6 rounded-2xl border-white/5 space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <User className="w-5 h-5 text-sky-400" />
                    Account Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Email</p>
                      <p className="text-sm">{session?.user?.email}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Status</p>
                      <p className="text-sm flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Verified Professional
                      </p>
                    </div>
                  </div>
                </div>

                <div className="glass p-6 rounded-2xl border-white/5 space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Shield className="w-5 h-5 text-sky-400" />
                    Security Preferences
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Auto-Scan URLs</p>
                        <p className="text-xs text-slate-500">Automatically analyze URLs detected in chat</p>
                      </div>
                      <div className="w-12 h-6 rounded-full bg-sky-500/20 border border-sky-500/30 relative">
                        <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-sky-400" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between opacity-50">
                      <div>
                        <p className="text-sm font-medium">Email Alerts</p>
                        <p className="text-xs text-slate-500">Receive notifications for high-risk threats</p>
                      </div>
                      <div className="w-12 h-6 rounded-full bg-white/5 border border-white/10 relative">
                        <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-slate-600" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="glass p-8 rounded-3xl space-y-4 border-white/5 hover:border-sky-500/30 transition-all"
    >
      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
    </motion.div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
        active 
          ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" 
          : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
      )}
    >
      <div className={cn(
        "transition-transform group-hover:scale-110",
        active ? "text-sky-400" : "text-slate-500"
      )}>
        {icon}
      </div>
      <span className="text-sm font-medium hidden md:block">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)] hidden md:block" />}
    </button>
  );
}

function QuickAction({ icon, title, desc, onClick }: { icon: React.ReactNode, title: string, desc: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="glass p-4 rounded-2xl text-left hover:bg-white/10 transition-all border-white/5 group"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-white/5 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <p className="text-xs text-slate-500">{desc}</p>
    </button>
  );
}
