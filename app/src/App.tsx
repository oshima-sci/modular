import { useState } from 'react'
import KnowledgeGraph from './components/KnowledgeGraph'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <KnowledgeGraph />
    </div>
  )
}

export default App
