import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Route, Switch, Redirect, Link, useHistory } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Dashboard from './dashboard';
import StudySession from './studySession';
import DeckManagement from './deck';
const authBoundaryState = require('./authBoundaryState');
const authFormState = require('./authFormState');
const authReturnDestination = require('./authReturnDestination');

const {
  AUTH_LOGOUT_REASONS,
  getAuthNoticeAfterLogout,
  getAuthNoticeAfterModeToggle,
  getAuthNoticeAfterSubmissionStart,
  getAuthNoticeMessage,
} = authBoundaryState;

const {
  AUTH_MODES,
  AUTH_TOKEN_STORAGE_KEY,
  cleanupStoredAuthTokenIfNeeded,
  createInitialAuthSession,
  createAuthSubmission,
  getNextAuthMode,
  parseAuthResponse,
} = authFormState;

const {
  LOGIN_ROUTE_PATHNAME,
  createAuthReturnLoginRedirect,
  getAuthReturnDestinationFromState,
} = authReturnDestination;

const apiEnv = Object.freeze({
  REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
});

const Login = ({ setIsLoggedIn, env, authNotice, onAuthNoticeChange }) => {
  const [mode, setMode] = useState(AUTH_MODES.LOGIN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const isRegistering = mode === AUTH_MODES.REGISTER;
  const noticeMessage = getAuthNoticeMessage(authNotice);
  const title = isRegistering ? 'Create account' : 'Login';
  const submitLabel = isSubmitting
    ? (isRegistering ? 'Creating account...' : 'Logging in...')
    : title;
  const toggleLabel = isRegistering ? 'Use existing account' : 'Create an account';

  const handleModeToggle = () => {
    setMode((currentMode) => getNextAuthMode(currentMode));
    setError('');
    onAuthNoticeChange(getAuthNoticeAfterModeToggle());
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
    onAuthNoticeChange(getAuthNoticeAfterSubmissionStart());

    let response;
    try {
      response = await fetch(submission.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission.body),
      });
    } catch (error) {
      console.error('Auth error:', error);
      setError('Authentication request failed. Please try again.');
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    try {
      let body;
      let bodyParseError;
      try {
        body = await response.json();
      } catch (error) {
        bodyParseError = error;
      }

      const authResponse = parseAuthResponse({
        mode,
        ok: response.ok,
        body,
        bodyParseError,
      });

      if (authResponse.ok) {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authResponse.token);
        setIsLoggedIn(true);
      } else {
        setError(authResponse.error);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-10">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      {noticeMessage && (
        <p role="status" aria-live="polite" className="text-blue-700 text-sm mb-2">
          {noticeMessage}
        </p>
      )}
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

const ProtectedRoute = ({ isLoggedIn, children, ...routeProps }) => (
  <Route
    {...routeProps}
    render={({ location }) => (
      isLoggedIn
        ? children
        : <Redirect to={createAuthReturnLoginRedirect(location)} />
    )}
  />
);

const AuthenticatedApp = () => {
  const history = useHistory();
  const [initialAuthSession] = useState(() => createInitialAuthSession(localStorage));
  const [isLoggedIn, setIsLoggedIn] = useState(initialAuthSession.isLoggedIn);
  const [authNotice, setAuthNotice] = useState(null);

  useLayoutEffect(() => {
    cleanupStoredAuthTokenIfNeeded(localStorage, initialAuthSession);
  }, [initialAuthSession]);

  const clearAuthStorageAndLogout = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // Keep logout state authoritative even if browser storage is unavailable.
    }
    setIsLoggedIn(false);
  }, []);

  const handleLogout = useCallback(() => {
    clearAuthStorageAndLogout();
    setAuthNotice(getAuthNoticeAfterLogout(AUTH_LOGOUT_REASONS.MANUAL));
    history.replace(LOGIN_ROUTE_PATHNAME);
  }, [clearAuthStorageAndLogout, history]);

  const handleAuthExpired = useCallback(() => {
    clearAuthStorageAndLogout();
    setAuthNotice(getAuthNoticeAfterLogout(AUTH_LOGOUT_REASONS.AUTH_EXPIRED));
  }, [clearAuthStorageAndLogout]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Anki Web App</h1>
      {isLoggedIn && (
        <nav className="mb-4">
          <ul className="flex space-x-4">
            <li><Link to="/" className="text-blue-500 hover:underline">Dashboard</Link></li>
            <li><Link to="/study" className="text-blue-500 hover:underline">Study</Link></li>
            <li><Link to="/decks" className="text-blue-500 hover:underline">Manage Decks</Link></li>
            <li><Button onClick={handleLogout}>Logout</Button></li>
          </ul>
        </nav>
      )}
      <Switch>
        <Route
          exact
          path="/login"
          render={({ location }) => (
            isLoggedIn ? (
              <Redirect to={getAuthReturnDestinationFromState(location.state)} />
            ) : (
              <Login
                setIsLoggedIn={setIsLoggedIn}
                env={apiEnv}
                authNotice={authNotice}
                onAuthNoticeChange={setAuthNotice}
              />
            )
          )}
        />
        <ProtectedRoute exact path="/" isLoggedIn={isLoggedIn}>
          <Dashboard env={apiEnv} onAuthExpired={handleAuthExpired} />
        </ProtectedRoute>
        <ProtectedRoute path="/study" isLoggedIn={isLoggedIn}>
          <StudySession env={apiEnv} onAuthExpired={handleAuthExpired} />
        </ProtectedRoute>
        <ProtectedRoute path="/decks" isLoggedIn={isLoggedIn}>
          <DeckManagement env={apiEnv} onAuthExpired={handleAuthExpired} />
        </ProtectedRoute>
      </Switch>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <AuthenticatedApp />
    </Router>
  );
};

export default App;
