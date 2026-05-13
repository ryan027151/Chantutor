import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/loginpage'
import HomePage from './pages/homepage'
import MockTest from './pages/mocktest'
import StudentHomepage from './StudentPageExample/Studenthompage'


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/home" element={<LoginPage></LoginPage>}></Route>
        <Route path="/" element={<HomePage></HomePage>}></Route>
        <Route path="/mock" element={<MockTest></MockTest>}></Route>
      </Routes>
    </Router>
  )
}

export default App