import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/loginpage'
import HomePage from './pages/homepage'
import MockTest from './pages/mocktest'
import StudentHomepage from './StudentPageExample/Studenthompage'
import SignUpPage from './pages/signUpPage'


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage></LoginPage>}></Route>
        <Route path="/signUp" element={<SignUpPage></SignUpPage>}></Route>
        <Route path="/home" element={<HomePage></HomePage>}></Route>
        <Route path="/mock" element={<MockTest></MockTest>}></Route>
      </Routes>
    </Router>
  )
}

export default App