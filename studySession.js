import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getStudySessionApiRequests } from './studySessionApiRequests';
import { getStudySessionRequest, STUDY_SESSION_REQUESTS } from './studySessionTarget';

const noDueCardsNotice = {
  title: 'No due cards right now',
  message: 'There are no cards due for review. Browse or manage your decks to add cards or choose what to study next.',
  canRetry: false,
};

const StudySession = ({ env }) => {
  const location = useLocation();
  const history = useHistory();
  const apiRequests = useMemo(() => getStudySessionApiRequests(env), [env]);
  const [currentCard, setCurrentCard] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState('');
  const [sessionNotice, setSessionNotice] = useState(null);
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
      setError('');
      setSessionNotice(null);
      const response = await fetch(apiRequests.dueCardUrl(requestDeckId), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!isCurrentRequest()) return;

      if (!response.ok) {
        throw new Error('Unable to fetch cards');
      }

      const cards = await response.json();

      if (!isCurrentRequest()) return;

      activeDeckIdRef.current = requestDeckId;
      if (Array.isArray(cards) && cards.length > 0) {
        setCurrentCard(cards[0]);
        setShowAnswer(false);
        setSubmitError('');
        setSubmitInFlight(false);
        setIsLoading(false);
      } else {
        setCurrentCard(null);
        if (options.showNoDueNotice) {
          setSessionNotice(noDueCardsNotice);
        }
        setSubmitInFlight(false);
        setIsLoading(false);
      }
    } catch (error) {
      if (!isCurrentRequest()) return;

      console.error('Error fetching card:', error);
      setCurrentCard(null);
      setError('Unable to load cards for this deck.');
      setSubmitInFlight(false);
      setIsLoading(false);
    }
  }, [apiRequests, setSubmitInFlight]);

  const loadStudySession = useCallback(async () => {
    const requestSearch = location.search;
    const initialRequest = getStudySessionRequest(requestSearch);

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
      setError('');
      setSessionNotice(null);
      setCurrentCard(null);
      setShowAnswer(false);
      setSubmitError('');
      setSubmitInFlight(false);

      const response = await fetch(apiRequests.deckListUrl, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!isCurrentRequest()) return;

      if (!response.ok) {
        throw new Error('Unable to fetch decks');
      }

      const decks = await response.json();

      if (!isCurrentRequest()) return;

      const selectedRequest = getStudySessionRequest(requestSearch, decks);

      if (selectedRequest.type === STUDY_SESSION_REQUESTS.LOAD_CARDS) {
        await fetchNextCard(selectedRequest.deckId, requestSearch);
        return;
      }

      activeDeckIdRef.current = null;
      setCurrentCard(null);
      setShowAnswer(false);
      setSubmitError('');
      setSubmitInFlight(false);
      setSessionNotice(noDueCardsNotice);
      setIsLoading(false);
    } catch (error) {
      if (!isCurrentRequest()) return;

      console.error('Error fetching decks:', error);
      activeDeckIdRef.current = null;
      setCurrentCard(null);
      setShowAnswer(false);
      setSubmitError('');
      setSubmitInFlight(false);
      setSessionNotice({
        title: 'Unable to check deck availability',
        message: 'Try again or manage your decks to review and add cards.',
        canRetry: true,
      });
      setIsLoading(false);
    }
  }, [apiRequests, fetchNextCard, location.search, setSubmitInFlight]);

  useEffect(() => {
    loadStudySession();
  }, [loadStudySession]);

  const handleAnswer = async (quality) => {
    if (!currentCard || isSubmittingRef.current) return;

    const requestDeckId = activeDeckIdRef.current;
    const requestSearch = locationSearchRef.current;

    try {
      setSubmitInFlight(true);
      setSubmitError('');
      const response = await fetch(apiRequests.submitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ cardId: currentCard.id, quality }),
      });

      if (!response.ok) {
        throw new Error('Unable to submit answer');
      }

      if (locationSearchRef.current !== requestSearch) {
        return;
      }

      await fetchNextCard(requestDeckId, requestSearch);
    } catch (error) {
      console.error('Error submitting answer:', error);
      setSubmitError('Unable to submit your answer. Please try again.');
      setSubmitInFlight(false);
    }
  };

  const handleManageDecks = () => {
    history.push('/decks');
  };

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
              <Button onClick={handleManageDecks}>
                Manage Decks
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (!currentCard && isLoading) {
    return <div>Loading study session...</div>;
  }

  if (!currentCard) {
    return <div>No more cards to study!</div>;
  }

  return (
    <div className="max-w-md mx-auto mt-10">
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
            <Button onClick={() => setShowAnswer(true)} className="w-full" disabled={isSubmitting}>
              Show Answer
            </Button>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudySession;
