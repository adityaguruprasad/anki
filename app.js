import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Switch, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Placeholder components - these would be separated into their own files in a real project
const Dashboard = () => <div>Dashboard Component</div>;
const StudySession = () => <div>Study Session Component</div>;
const DeckManagement = () => <div>Deck Management Component</div>;

const App = () => {
  const [user, setUser] = useState(null);

  const handleLogin = (username, password) => {
    // This is a placeholder. In a real app, you'd call an API to authenticate
    setUser({ username });
  };

  const LoginForm = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    return (
      <div className="p-4">
        <Input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-2"
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-2"
        />
        <Button onClick={() => handleLogin(username, password)}>Login</Button>
      </div>
    );
  };

  return (
    <Router>
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Anki Web App</h1>
        {user ? (
          <>
            <nav className="mb-4">
              <ul className="flex space-x-4">
                <li><Link to="/" className="text-blue-500 hover:underline">Dashboard</Link></li>
                <li><Link to="/study" className="text-blue-500 hover:underline">Study</Link></li>
                <li><Link to="/decks" className="text-blue-500 hover:underline">Manage Decks</Link></li>
              </ul>
            </nav>
            <Switch>
              <Route exact path="/" component={Dashboard} />
              <Route path="/study" component={StudySession} />
              <Route path="/decks" component={DeckManagement} />
            </Switch>
          </>
        ) : (
          <LoginForm />
        )}
      </div>
    </Router>
  );
};

export default App;