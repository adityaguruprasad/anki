import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
const studySessionApiRequests = require('./studySessionApiRequests');
const studySessionShortcuts = require('./studySessionShortcuts');
const studySessionFeedback = require('./studySessionFeedback');
const studySessionNotice = require('./studySessionNotice');
const studySessionTarget = require('./studySessionTarget');
const studySessionDueCards = require('./studySessionDueCards');
const authHeaders = require('./authHeaders');
const authExpiration = require('./authExpiration');

const { getStudySessionApiRequests } = studySessionApiRequests;
const {
  getStudySessionShortcutAction,
  STUDY_SESSION_SHORTCUT_ACTIONS,
} = studySessionShortcuts;
const {
  getStudySessionSubmissionFeedback,
  parseStudySessionSubmissionResponse,
} = studySessionFeedback;
const { getStudySessionNotice, STUDY_SESSION_NOTICE_TYPES } = studySessionNotice;
const {
  getStudySessionRequest,
  getValidatedStudySessionDeckListRequest,
  STUDY_SESSION_REQUESTS,
} = studySessionTarget;
const { selectValidatedStudySessionDueCard } = studySessionDueCards;
const { buildAuthHeaders } = authHeaders;
const { handleAuthExpiredResponse } = authExpiration;

const StudySession = ({ env, onAuthExpired }) => {
  const location = useLocation();
  const history = useHistory();
  const apiRequests = useMemo(() => getStudySessionApiRequests(env), [env]);
  const [currentCard, setCurrentCard] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionNotice, setSessionNotice] = useState(null);
  const [submissionFeedback, setSubmissionFeedback] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const fetchRequestRef = useRef(0);
  const locationSearchRef = useRef(location.search);
  const activeDeckIdRef = useRef(null);
  locationSearchRef.current = location.search;

  const setSubmitInFlight = useCallback((inFlight) => {
    isSubmittingRef.current = inFlight;
    setIsSubmitting(inFlight);
  }, []);

  const fetchNextCard = useCallback(async (requestDeckId, requestSearch, options = {}) => {
    if (locationSearchRef.current !== requestSearch) {
      return;
    }

    const requestId = fetchRequestRef.current + 1;
    fetchRequestRef.current = requestId;
    const isCurrentRequest = () => (
      fetchRequestRef.current === requestId && locationSearchRef.current === requestSearch
    );

    try {
      setIsLoading(true);
      setSessionNotice(null);
      const response = await fetch(apiRequests.dueCardUrl(requestDeckId), {
        headers: buildAuthHeaders(localStorage),
      });

      if (!isCurrentRequest()) return;

      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }

      if (!response.ok) {
        throw new Error('Unable to fetch cards');
      }

      const cards = await response.json();

      if (!isCurrentRequest()) return;

      const selectedCard = selectValidatedStudySessionDueCard(cards);

      activeDeckIdRef.current = requestDeckId;
      if (selectedCard) {
        setCurrentCard(selectedCard);
        setShowAnswer(false);
        setSubmitError('');
        setSubmitInFlight(false);
        setIsLoading(false);
      } else {
        setCurrentCard(null);
        if (options.showNoDueNotice) {
          setSessionNotice(getStudySessionNotice(STUDY_SESSION_NOTICE_TYPES.NO_DUE_CARDS));
        }
        setSubmitInFlight(false);
        setIsLoading(false);
      }
    } catch (error) {
      if (!isCurrentRequest()) return;

      console.error('Error fetching card:', error);
      setCurrentCard(null);
      setSubmissionFeedback(null);
      setSessionNotice(getStudySessionNotice(STUDY_SESSION_NOTICE_TYPES.DUE_CARD_FETCH_ERROR));
      setSubmitInFlight(false);
      setIsLoading(false);
    }
  }, [apiRequests, onAuthExpired, setSubmitInFlight]);

  const loadStudySession = useCallback(async () => {
    const requestSearch = location.search;
    const initialRequest = getStudySessionRequest(requestSearch);
    setSubmissionFeedback(null);

    if (initialRequest.type === STUDY_SESSION_REQUESTS.LOAD_CARDS) {
      await fetchNextCard(initialRequest.deckId, requestSearch, {
        showNoDueNotice: initialRequest.source === 'explicit',
      });
      return;
    }

    const requestId = fetchRequestRef.current + 1;
    fetchRequestRef.current = requestId;
    const isCurrentRequest = () => (
      fetchRequestRef.current === requestId && locationSearchRef.current === requestSearch
    );

    try {
      activeDeckIdRef.current = null;
      setIsLoading(true);
      setSessionNotice(null);
      setCurrentCard(null);
      setShowAnswer(false);
      setSubmitError('');
      setSubmitInFlight(false);

      const response = await fetch(apiRequests.deckListUrl, {
        headers: buildAuthHeaders(localStorage),
      });

      if (!isCurrentRequest()) return;

      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }

      if (!response.ok) {
        throw new Error('Unable to fetch decks');
      }

      const decks = await response.json();

      if (!isCurrentRequest()) return;

      const selectedRequest = getValidatedStudySessionDeckListRequest(requestSearch, decks);

      if (selectedRequest.type === STUDY_SESSION_REQUESTS.LOAD_CARDS) {
        await fetchNextCard(selectedRequest.deckId, requestSearch);
        return;
      }

      activeDeckIdRef.current = null;
      setCurrentCard(null);
      setShowAnswer(false);
      setSubmitError('');
      setSubmitInFlight(false);
      setSessionNotice(getStudySessionNotice(STUDY_SESSION_NOTICE_TYPES.NO_DUE_CARDS));
      setIsLoading(false);
    } catch (error) {
      if (!isCurrentRequest()) return;

      console.error('Error fetching decks:', error);
      activeDeckIdRef.current = null;
      setCurrentCard(null);
      setShowAnswer(false);
      setSubmitError('');
      setSubmitInFlight(false);
      setSessionNotice(getStudySessionNotice(STUDY_SESSION_NOTICE_TYPES.DECK_AVAILABILITY_ERROR));
      setIsLoading(false);
    }
  }, [apiRequests, fetchNextCard, location.search, onAuthExpired, setSubmitInFlight]);

  useEffect(() => {
    loadStudySession();
  }, [loadStudySession]);

  const revealAnswer = useCallback(() => {
    setSubmissionFeedback(null);
    setShowAnswer(true);
  }, []);

  const handleAnswer = useCallback(async (quality) => {
    if (!currentCard || isSubmittingRef.current) return;

    const requestDeckId = activeDeckIdRef.current;
    const requestSearch = locationSearchRef.current;
    const isStaleSubmitRequest = () => locationSearchRef.current !== requestSearch;

    try {
      setSubmitInFlight(true);
      setSubmissionFeedback(null);
      setSubmitError('');
      const response = await fetch(apiRequests.submitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(localStorage),
        },
        body: JSON.stringify({ cardId: currentCard.id, quality }),
      });

      if (isStaleSubmitRequest()) {
        return;
      }

      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }

      if (!response.ok) {
        throw new Error('Unable to submit answer');
      }

      let responseText = '';
      try {
        responseText = await response.text();
      } catch {
        responseText = '';
      }

      if (isStaleSubmitRequest()) {
        return;
      }

      const submissionResponse = parseStudySessionSubmissionResponse(responseText);
      setSubmissionFeedback(getStudySessionSubmissionFeedback({
        quality,
        response: submissionResponse,
      }));
      await fetchNextCard(requestDeckId, requestSearch);
    } catch (error) {
      if (isStaleSubmitRequest()) {
        return;
      }

      console.error('Error submitting answer:', error);
      setSubmitError('Unable to submit your answer. Please try again.');
      setSubmitInFlight(false);
    }
  }, [apiRequests, currentCard, fetchNextCard, onAuthExpired, setSubmitInFlight]);

  useEffect(() => {
    const handleAnswerShortcut = (event) => {
      const shortcutAction = getStudySessionShortcutAction(event, {
        currentCard,
        isLoading,
        isSubmitting: isSubmittingRef.current,
        showAnswer,
      });

      if (!shortcutAction) {
        return;
      }

      event.preventDefault();

      if (shortcutAction.type === STUDY_SESSION_SHORTCUT_ACTIONS.REVEAL_ANSWER) {
        revealAnswer();
        return;
      }

      if (shortcutAction.type === STUDY_SESSION_SHORTCUT_ACTIONS.NO_OP) {
        return;
      }

      handleAnswer(shortcutAction.quality);
    };

    window.addEventListener('keydown', handleAnswerShortcut);

    return () => {
      window.removeEventListener('keydown', handleAnswerShortcut);
    };
  }, [currentCard, handleAnswer, isLoading, revealAnswer, showAnswer]);

  const handleManageDecks = () => {
    history.push('/decks');
  };

  const submissionFeedbackStatus = submissionFeedback && (
    <div
      className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
      role="status"
    >
      {submissionFeedback.message}
    </div>
  );

  if (sessionNotice) {
    return (
      <div className="max-w-md mx-auto mt-10">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-2">{sessionNotice.title}</h2>
            <p className="mb-4 text-sm text-gray-600">{sessionNotice.message}</p>
            <div className="flex gap-2">
              {sessionNotice.canRetry && (
                <Button onClick={loadStudySession}>
                  Try Again
                </Button>
              )}
              {sessionNotice.canManageDecks && (
                <Button onClick={handleManageDecks}>
                  Manage Decks
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentCard && isLoading) {
    return <div>Loading study session...</div>;
  }

  if (!currentCard) {
    return (
      <div className="max-w-md mx-auto mt-10">
        {submissionFeedbackStatus}
        <div>No more cards to study!</div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      {submissionFeedbackStatus}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold mb-2">Question:</h2>
            <p>{currentCard.front_content}</p>
          </div>
          {showAnswer && (
            <div className="mb-4">
              <h2 className="text-xl font-bold mb-2">Answer:</h2>
              <p>{currentCard.back_content}</p>
            </div>
          )}
          {submitError && (
            <div className="mb-4 text-sm text-red-600" role="alert">
              {submitError}
            </div>
          )}
          {!showAnswer ? (
            <div>
              <p className="mb-3 text-sm text-gray-600">
                Shortcuts: Space or Enter to show answer.
              </p>
              <Button onClick={revealAnswer} className="w-full" disabled={isSubmitting}>
                Show Answer
              </Button>
            </div>
          ) : (
            <div>
              <p className="mb-3 text-sm text-gray-600">
                Shortcuts: 1 Hard, 2 Good, 3 Easy.
              </p>
              <div className="flex justify-between">
                <Button
                  onClick={() => handleAnswer(1)}
                  className="bg-red-500 hover:bg-red-600"
                  disabled={isSubmitting}
                >
                  Hard
                </Button>
                <Button
                  onClick={() => handleAnswer(3)}
                  className="bg-yellow-500 hover:bg-yellow-600"
                  disabled={isSubmitting}
                >
                  Good
                </Button>
                <Button
                  onClick={() => handleAnswer(5)}
                  className="bg-green-500 hover:bg-green-600"
                  disabled={isSubmitting}
                >
                  Easy
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudySession;
