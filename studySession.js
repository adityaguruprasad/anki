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
const studySessionRequestLifecycle = require('./studySessionRequestLifecycle');
const authHeaders = require('./authHeaders');
const authExpiration = require('./authExpiration');

const { getStudySessionApiRequests } = studySessionApiRequests;
const {
  getStudySessionShortcutAction,
  STUDY_SESSION_SHORTCUT_ACTIONS,
} = studySessionShortcuts;
const {
  STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS,
  getStudySessionSubmissionFeedback,
  getStudySessionSubmissionRecovery,
  getValidatedStudySessionSubmissionResponse,
  parseStudySessionSubmissionResponse,
} = studySessionFeedback;
const { getStudySessionNotice, STUDY_SESSION_NOTICE_TYPES } = studySessionNotice;
const {
  getStudySessionRequest,
  getValidatedStudySessionDeckListRequest,
  shouldShowNoDueNoticeForInitialStudySessionRequest,
  STUDY_SESSION_REQUESTS,
} = studySessionTarget;
const { selectValidatedStudySessionDueCard } = studySessionDueCards;
const {
  isCurrentStudySessionFetchRequest,
  isCurrentStudySessionRouteRequest,
} = studySessionRequestLifecycle;
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
  const mountedRef = useRef(true);
  const locationSearchRef = useRef(location.search);
  const activeDeckIdRef = useRef(null);
  locationSearchRef.current = location.search;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      fetchRequestRef.current += 1;
      isSubmittingRef.current = false;
    };
  }, []);

  const setSubmitInFlight = useCallback((inFlight) => {
    isSubmittingRef.current = inFlight;
    setIsSubmitting(inFlight);
  }, []);

  const fetchNextCard = useCallback(async (requestDeckId, requestSearch, options = {}) => {
    if (!isCurrentStudySessionRouteRequest({ mountedRef, locationSearchRef, requestSearch })) {
      return;
    }

    const requestId = fetchRequestRef.current + 1;
    fetchRequestRef.current = requestId;
    const isCurrentRequest = () => isCurrentStudySessionFetchRequest({
      mountedRef,
      requestIdRef: fetchRequestRef,
      requestId,
      locationSearchRef,
      requestSearch,
    });

    try {
      setIsLoading(true);
      setSessionNotice(null);
      const response = await fetch(apiRequests.dueCardUrl(requestDeckId), {
        headers: buildAuthHeaders(localStorage),
      });

      if (!isCurrentRequest()) return;

      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        setSubmitInFlight(false);
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Unable to fetch cards');
      }

      const cards = await response.json();

      if (!isCurrentRequest()) return;

      const selectedCard = selectValidatedStudySessionDueCard(cards, {
        expectedDeckId: requestDeckId,
      });

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
    if (!isCurrentStudySessionRouteRequest({ mountedRef, locationSearchRef, requestSearch })) {
      return;
    }

    const initialRequest = getStudySessionRequest(requestSearch);
    setSubmissionFeedback(null);

    if (initialRequest.type === STUDY_SESSION_REQUESTS.LOAD_CARDS) {
      await fetchNextCard(initialRequest.deckId, requestSearch, {
        showNoDueNotice: shouldShowNoDueNoticeForInitialStudySessionRequest(initialRequest),
      });
      return;
    }

    const requestId = fetchRequestRef.current + 1;
    fetchRequestRef.current = requestId;
    const isCurrentRequest = () => isCurrentStudySessionFetchRequest({
      mountedRef,
      requestIdRef: fetchRequestRef,
      requestId,
      locationSearchRef,
      requestSearch,
    });

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
        setSubmitInFlight(false);
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Unable to fetch decks');
      }

      const decks = await response.json();

      if (!isCurrentRequest()) return;

      const selectedRequest = getValidatedStudySessionDeckListRequest(requestSearch, decks);

      if (selectedRequest.type === STUDY_SESSION_REQUESTS.LOAD_CARDS) {
        await fetchNextCard(selectedRequest.deckId, requestSearch, {
          showNoDueNotice: shouldShowNoDueNoticeForInitialStudySessionRequest(selectedRequest),
        });
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
    const isCurrentSubmitRequest = () => isCurrentStudySessionRouteRequest({
      mountedRef,
      locationSearchRef,
      requestSearch,
    });

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

      if (!isCurrentSubmitRequest()) {
        return;
      }

      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        setSubmitInFlight(false);
        return;
      }

      const submissionRecovery = getStudySessionSubmissionRecovery(response);
      if (submissionRecovery?.action === STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS.LOAD_NEXT_DUE_CARD) {
        setCurrentCard(null);
        setShowAnswer(false);
        setSubmissionFeedback({ message: submissionRecovery.message });
        await fetchNextCard(requestDeckId, requestSearch);
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

      if (!isCurrentSubmitRequest()) {
        return;
      }

      const parsedSubmissionResponse = parseStudySessionSubmissionResponse(responseText);
      const submissionResponse = getValidatedStudySessionSubmissionResponse(
        parsedSubmissionResponse,
        { expectedId: currentCard.id },
      );

      if (!submissionResponse) {
        throw new Error('Invalid study session submission response');
      }

      setSubmissionFeedback(getStudySessionSubmissionFeedback({
        quality,
        response: submissionResponse,
      }));
      await fetchNextCard(requestDeckId, requestSearch);
    } catch (error) {
      if (!isCurrentSubmitRequest()) {
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
    return (
      <div className="max-w-md mx-auto mt-10">
        {submissionFeedbackStatus}
        <div>Loading study session...</div>
      </div>
    );
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
