import React, { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DeckManagement = () => {
  const history = useHistory();
  const [decks, setDecks] = useState([]);
  const [newDeckName, setNewDeckName] = useState('');
  const [cardForms, setCardForms] = useState({});

  useEffect(() => {
    fetchDecks();
  }, []);

  const fetchDecks = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/decks', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setDecks(data);
    } catch (error) {
      console.error('Error fetching decks:', error);
    }
  };

  const createDeck = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/decks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name: newDeckName })
      });
      if (response.ok) {
        setNewDeckName('');
        fetchDecks();
      }
    } catch (error) {
      console.error('Error creating deck:', error);
    }
  };

  const updateCardForm = (deckId, field, value) => {
    setCardForms((currentForms) => ({
      ...currentForms,
      [deckId]: {
        frontContent: '',
        backContent: '',
        ...(currentForms[deckId] || {}),
        [field]: value,
        error: '',
        success: '',
      },
    }));
  };

  const setCardFormStatus = (deckId, status) => {
    setCardForms((currentForms) => ({
      ...currentForms,
      [deckId]: {
        frontContent: '',
        backContent: '',
        error: '',
        success: '',
        ...(currentForms[deckId] || {}),
        ...status,
      },
    }));
  };

  const addCard = async (event, deckId) => {
    event.preventDefault();

    const currentForm = cardForms[deckId] || {};
    const frontContent = currentForm.frontContent || '';
    const backContent = currentForm.backContent || '';

    if (!frontContent.trim() || !backContent.trim()) {
      setCardFormStatus(deckId, {
        error: 'Front and back content are required.',
        success: '',
      });
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          deckId,
          frontContent,
          backContent,
        })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCardFormStatus(deckId, {
          error: data.error || 'Unable to add card.',
          success: '',
        });
        return;
      }

      setCardForms((currentForms) => ({
        ...currentForms,
        [deckId]: {
          frontContent: '',
          backContent: '',
          error: '',
          success: 'Card added.',
        },
      }));
      fetchDecks();
    } catch (error) {
      console.error('Error creating card:', error);
      setCardFormStatus(deckId, {
        error: 'Network error. Please try again.',
        success: '',
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <h2 className="text-2xl font-bold mb-4">Manage Decks</h2>
      <div className="mb-4 flex">
        <Input
          type="text"
          value={newDeckName}
          onChange={(e) => setNewDeckName(e.target.value)}
          placeholder="New deck name"
          className="mr-2"
        />
        <Button onClick={createDeck}>Create Deck</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {decks.map(deck => {
          const totalCards = deck.totalCards ?? 0;
          const dueCards = deck.dueCards ?? 0;
          const cardForm = cardForms[deck.id] || {};

          return (
            <Card key={deck.id}>
              <CardContent className="p-4">
                <h3 className="text-lg font-semibold">{deck.name}</h3>
                <p className="text-sm text-gray-500">Cards: {totalCards}</p>
                <p className="text-sm text-gray-500">Due: {dueCards}</p>
                <Button className="mt-2" onClick={() => history.push(`/study?${new URLSearchParams({ deckId: deck.id })}`)}>
                  Study
                </Button>
                <form className="mt-4 space-y-2" onSubmit={(event) => addCard(event, deck.id)}>
                  <Input
                    type="text"
                    value={cardForm.frontContent || ''}
                    onChange={(e) => updateCardForm(deck.id, 'frontContent', e.target.value)}
                    placeholder="Front"
                  />
                  <Input
                    type="text"
                    value={cardForm.backContent || ''}
                    onChange={(e) => updateCardForm(deck.id, 'backContent', e.target.value)}
                    placeholder="Back"
                  />
                  {cardForm.error && (
                    <p className="text-sm text-red-600">{cardForm.error}</p>
                  )}
                  {cardForm.success && (
                    <p className="text-sm text-green-600">{cardForm.success}</p>
                  )}
                  <Button type="submit" className="mt-1">Add Card</Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default DeckManagement;
