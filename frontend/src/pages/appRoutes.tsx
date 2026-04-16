import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import MockTest from '../pages/mocktest'
import PageNav from '../pages/pageNav'
import HomePage from '../pages/homepage'
import TestTakePage from '../pages/testtakepage'

export default function AppRoutes() {
  const currentLocation = useLocation();
  console.log(currentLocation.pathname);

  return (
    <>
      <PageNav />
      <Routes>
        <Route path="/" element={<HomePage/>}/>
        <Route path="/testtake" element={<TestTakePage/>}/>
        <Route path="/mock" element={<MockTest/>}/>
      </Routes>
    </>
  )
}