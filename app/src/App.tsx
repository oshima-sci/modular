import { useState } from 'react'
import KnowledgeGraphFlow from './components/KnowledgeGraphFlow'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="w-screen h-screen">
      <KnowledgeGraphFlow />
    </div>
  )
}

export default App
