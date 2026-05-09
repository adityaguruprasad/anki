import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const parseDeckId = (search) => {
  const deckIdParam = new URLSearchParams(search).get('deckId');

  if (!deckIdParam || !/^\d+$/.test(deckIdParam)) {
    return null;
  }

  const parsedDeckId = Number(deckIdParam);
  return Number.isSafeInteger(parsedDeckId) && parsedDeckId > 0 ? parsedDeckId : null;
};

const StudySession = () => {
  const location = useLocation();
  const [currentCard, setCurrentCard] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const deckId = useMemo(() => parseDeckId(location.search), [location.search]);

  const fetchNextCard = useCallback(async () => {
    if (!deckId) {
      setCurrentCard(null);
      return;
    }

    try {
      setError('');
      const response = await fetch(`http://localhost:3001/api/cards/${deckId}?limit=1`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Unable to fetch cards');
      }

      const cards = await response.json();

      if (Array.isArray(cards) && cards.length > 0) {
        setCurrentCard(cards[0]);
        setShowAnswer(false);
        setSubmitError('');
      } else {
        setCurrentCard(null);
      }
    } catch (error) {
      console.error('Error fetching card:', error);
      setCurrentCard(null);
      setError('Unable to load cards for this deck.');
    }
  }, [deckId]);

  useEffect(() => {
    if (!deckId) {
      setCurrentCard(null);
      setSubmitError('');
      setError('Select a valid deck to start studying.');
      return;
    }

    fetchNextCard();
  }, [deckId, fetchNextCard]);

  const handleAnswer = async (quality) => {
    if (!currentCard) return;

    try {
      setSubmitError('');
      const response = await fetch('http://localhost:3001/api/study-session', {
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

      fetchNextCard();
    } catch (error) {
      console.error('Error submitting answer:', error);
      setSubmitError('Unable to submit your answer. Please try again.');
    }
  };

  if (error) {
    return <div>{error}</div>;
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
            <Button onClick={() => setShowAnswer(true)} className="w-full">
              Show Answer
            </Button>
          ) : (
            <div className="flex justify-between">
              <Button onClick={() => handleAnswer(1)} className="bg-red-500 hover:bg-red-600">
                Hard
              </Button>
              <Button onClick={() => handleAnswer(3)} className="bg-yellow-500 hover:bg-yellow-600">
                Good
              </Button>
              <Button onClick={() => handleAnswer(5)} className="bg-green-500 hover:bg-green-600">
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
