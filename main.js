import React, { useRef, useState } from 'react';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Dashboard from './dashboard';
import StudySession from './studySession';
import DeckManagement from './deck';
import { AUTH_MODES, createAuthSubmission, getNextAuthMode } from './authFormState';

const apiEnv = Object.freeze({
  REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
});

const Login = ({ setIsLoggedIn, env }) => {
  const [mode, setMode] = useState(AUTH_MODES.LOGIN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const isRegistering = mode === AUTH_MODES.REGISTER;
  const title = isRegistering ? 'Create account' : 'Login';
  const submitLabel = isSubmitting
    ? (isRegistering ? 'Creating account...' : 'Logging in...')
    : title;
  const toggleLabel = isRegistering ? 'Use existing account' : 'Create an account';

  const handleModeToggle = () => {
    setMode((currentMode) => getNextAuthMode(currentMode));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const submission = createAuthSubmission({
      mode,
      email,
      password,
      isSubmitting: isSubmittingRef.current,
      env,
    });

    if (submission.blocked) {
      return;
    }

    if (!submission.ok) {
      setError(submission.error);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(submission.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission.body),
      });
      if (response.ok) {
        const { token } = await response.json();
        localStorage.setItem('token', token);
        setIsLoggedIn(true);
      } else {
        setError(
          isRegistering
            ? 'Could not create account. Please check your email and password.'
            : 'Login failed. Please check your credentials.'
        );
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError('Authentication request failed. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-10">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <Input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError('');
        }}
        placeholder="Email"
        className="mb-2"
        disabled={isSubmitting}
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError('');
        }}
        placeholder="Password"
        className="mb-2"
        disabled={isSubmitting}
      />
      {error && (
        <p role="alert" className="text-red-600 text-sm mb-2">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {submitLabel}
      </Button>
      <button
        type="button"
        onClick={handleModeToggle}
        className="w-full mt-3 text-sm text-blue-600 hover:underline"
        disabled={isSubmitting}
      >
        {toggleLabel}
      </button>
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
            {isLoggedIn ? <Redirect to="/" /> : <Login setIsLoggedIn={setIsLoggedIn} env={apiEnv} />}
          </Route>
          <Route exact path="/">
            {isLoggedIn ? <Dashboard /> : <Redirect to="/login" />}
          </Route>
          <Route path="/study">
            {isLoggedIn ? <StudySession env={apiEnv} /> : <Redirect to="/login" />}
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
