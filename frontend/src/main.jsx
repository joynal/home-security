import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import LoginPage from './LoginPage.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { useAuth } from './contexts/useAuth.jsx'

export default function Root() {
  const { token } = useAuth()
  return token ? <App /> : <LoginPage />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
