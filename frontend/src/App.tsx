import { HashRouter as Router } from 'react-router-dom'
import AppRoutes from './pages/appRoutes'

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  )
}

export default App