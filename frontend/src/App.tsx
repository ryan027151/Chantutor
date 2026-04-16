import { HashRouter as Router, Routes, Route} from 'react-router-dom'
import MockTest from './pages/mocktest'
import PageNav from './pages/pageNav'


function App() {

  return (
    <Router>
      <Routes>
        <Route element={<PageNav/>}>
          <Route path="/home" element={<MockTest/>}/>
          <Route path="/mock" element={<MockTest/>}/>
        </Route>
      </Routes>
    </Router>
  )
}

export default App
