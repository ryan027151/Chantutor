import { HashRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { ReactNode, useContext, useEffect } from 'react'
import LoginPage from './pages/loginpage'
import HomePage from './pages/homepage'
import MockTest from './pages/mocktest'
import SignUpPage from './pages/signUpPage'
import AdminPage from './pages/adminpage'
import ResultsPage from './pages/resultsPage'
import ParentPage from './pages/parentPage'
import PerformancePage from './pages/performancePage'
import ResetPasswordPage from './pages/resetPasswordPage'
import { UserContext } from './components/userContext'
import { supabase } from './supabase-client'
import { useState } from 'react'
import { User } from './components/types'

// Listens for Supabase PASSWORD_RECOVERY event and redirects to the reset page.
// Must live inside <Router> to use useNavigate.
function AuthChangeHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password');
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  return null;
}

function ProtectedRoute({ children, adminOnly = false, studentOnly = false }: {
  children: ReactNode; adminOnly?: boolean; studentOnly?: boolean;
}) {
  const user = useContext(UserContext);
  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (user === null) return <Navigate to="/" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/home" replace />;
  if (studentOnly && user.role === 'admin') return <Navigate to="/admin" replace />;
  if (studentOnly && user.role === 'parent') return <Navigate to="/parent" replace />;
  return <>{children}</>;
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  async function getUser() {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      setUser(null);
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, last_name, role')
      .eq('id', authUser.id)
      .single();
    if (profileError || !profile) {
      setUser(null);
      return;
    }
    setUser({
      id: authUser.id,
      first_name: profile.first_name,
      last_name: profile.last_name,
      role: profile.role,
    });
  }

  useEffect(() => {
    getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        getUser();
      } else {
        setUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <UserContext.Provider value={user}>
        <AuthChangeHandler />
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LoginPage />} />
          <Route path="/signUp" element={<SignUpPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected routes — require authentication */}
          <Route path="/home" element={<ProtectedRoute studentOnly><HomePage /></ProtectedRoute>} />
          <Route path="/performance" element={<ProtectedRoute studentOnly><PerformancePage /></ProtectedRoute>} />
          <Route path="/performance/:studentId" element={<ProtectedRoute><PerformancePage /></ProtectedRoute>} />
          <Route path="/mock/:testID" element={<ProtectedRoute studentOnly><MockTest /></ProtectedRoute>} />
          <Route path="/results/:testID" element={<ProtectedRoute studentOnly><ResultsPage /></ProtectedRoute>} />

          {/* Admin-only route */}
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />

          {/* Parent-only route */}
          <Route path="/parent" element={<ProtectedRoute><ParentPage /></ProtectedRoute>} />
        </Routes>
      </UserContext.Provider>
    </Router>
  );
}

export default App;
