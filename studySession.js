import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const StudySession = () => {
  const [currentCard, setCurrentCard] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [deckId, setDeckId] = useState(1); // Hardcoded for now, would be dynamic in full app

  useEffect(() => {
    fetchNextCard();
  }, []);

  const fetchNextCard = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/cards/${deckId}`);
      const cards = await response.json();
      if (cards.length > 0) {
        setCurrentCard(cards[0]); // For simplicity, just get the first card
        setShowAnswer(false);
      } else {
        setCurrentCard(null);
      }
    } catch (error) {
      console.error('Error fetching card:', error);
    }
  };

  const handleAnswer = async (quality) => {
    if (!currentCard) return;

    try {
      await fetch('http://localhost:3001/api/study-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cardId: currentCard.id, quality }),
      });
      fetchNextCard();
    } catch (error) {
      console.error('Error submitting answer:', error);
    }
  };

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