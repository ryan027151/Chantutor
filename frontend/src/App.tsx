import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/loginpage'
import HomePage from './pages/homepage'
import MockTest from './pages/mocktest'
import SignUpPage from './pages/signUpPage'
import AdminPage from './pages/adminpage'
import { UserContext } from './components/userContext'
import { supabase } from './supabase-client'
import { useEffect, useState } from 'react'
import { User } from './components/types'


function App() {
  const [user, setUser] = useState<User | null>(null);
  
  async function getUser() {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Auth error:", authError);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")         
      .select("first_name, last_name, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("Profile error:", profileError);
      return;
    }

    // Step 3: Set the full user object
    setUser({
      id: user.id,
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
        <Routes>
          <Route path="/" element={<LoginPage></LoginPage>}></Route>
          <Route path="/signUp" element={<SignUpPage></SignUpPage>}></Route>
          <Route path="/home" element={<HomePage></HomePage>}></Route>
          <Route path="/mock/:testID" element={<MockTest></MockTest>}></Route>
          <Route path="/admin" element={<AdminPage></AdminPage>}></Route>
        </Routes>
      </UserContext.Provider>
    </Router>
  )
}

export default App