import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Dashboard from './dashboard';
import StudySession from './studySession';
import DeckManagement from './deck';

const Login = ({ setIsLoggedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        const { token } = await response.json();
        localStorage.setItem('token', token);
        setIsLoggedIn(true);
      } else {
        alert('Login failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <form onSubmit={handleLogin} className="max-w-sm mx-auto mt-10">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="mb-2"
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="mb-2"
      />
      <Button type="submit" className="w-full">Login</Button>
    </form>
  );
};

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
  };

  return (
    <Router>
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Anki Web App</h1>
        {isLoggedIn && (
          <nav className="mb-4">
            <ul className="flex space-x-4">
              <li><a href="/" className="text-blue-500 hover:underline">Dashboard</a></li>
              <li><a href="/study" className="text-blue-500 hover:underline">Study</a></li>
              <li><a href="/decks" className="text-blue-500 hover:underline">Manage Decks</a></li>
              <li><Button onClick={handleLogout}>Logout</Button></li>
            </ul>
          </nav>
        )}
        <Switch>
          <Route exact path="/login">
            {isLoggedIn ? <Redirect to="/" /> : <Login setIsLoggedIn={setIsLoggedIn} />}
          </Route>
          <Route exact path="/">
            {isLoggedIn ? <Dashboard /> : <Redirect to="/login" />}
          </Route>
          <Route path="/study">
            {isLoggedIn ? <StudySession /> : <Redirect to="/login" />}
          </Route>
          <Route path="/decks">
            {isLoggedIn ? <DeckManagement /> : <Redirect to="/login" />}
          </Route>
        </Switch>
      </div>
    </Router>
  );
};

export default App;