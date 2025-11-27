import { useState } from 'react'
import KnowledgeGraph from './components/KnowledgeGraph'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="w-screen h-screen">
      <KnowledgeGraph />
    </div>
  )
}

export default App
