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
  const [renameForms, setRenameForms] = useState({});
  const [renameErrors, setRenameErrors] = useState({});
  const [renamingDecks, setRenamingDecks] = useState({});
  const [deleteErrors, setDeleteErrors] = useState({});
  const [deletingDecks, setDeletingDecks] = useState({});

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

  const updateRenameForm = (deckId, value) => {
    setRenameForms((currentForms) => ({
      ...currentForms,
      [deckId]: value,
    }));
    setRenameErrors((currentErrors) => ({
      ...currentErrors,
      [deckId]: '',
    }));
  };

  const renameDeck = async (event, deckId, currentName) => {
    event.preventDefault();

    const nextName = renameForms[deckId] ?? currentName;

    setRenameErrors((currentErrors) => ({
      ...currentErrors,
      [deckId]: '',
    }));
    setRenamingDecks((currentDecks) => ({
      ...currentDecks,
      [deckId]: true,
    }));

    try {
      const response = await fetch(`http://localhost:3001/api/decks/${deckId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name: nextName })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRenameErrors((currentErrors) => ({
          ...currentErrors,
          [deckId]: data.error || 'Unable to rename deck.',
        }));
        return;
      }

      setRenameForms((currentForms) => {
        const nextForms = { ...currentForms };
        delete nextForms[deckId];
        return nextForms;
      });
      setRenameErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        delete nextErrors[deckId];
        return nextErrors;
      });
      fetchDecks();
    } catch (error) {
      console.error('Error renaming deck:', error);
      setRenameErrors((currentErrors) => ({
        ...currentErrors,
        [deckId]: 'Network error. Please try again.',
      }));
    } finally {
      setRenamingDecks((currentDecks) => {
        const nextDecks = { ...currentDecks };
        delete nextDecks[deckId];
        return nextDecks;
      });
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

  const deleteDeck = async (deckId) => {
    if (!window.confirm('Delete this deck and all of its cards?')) {
      return;
    }

    setDeleteErrors((currentErrors) => ({
      ...currentErrors,
      [deckId]: '',
    }));
    setDeletingDecks((currentDecks) => ({
      ...currentDecks,
      [deckId]: true,
    }));

    try {
      const response = await fetch(`http://localhost:3001/api/decks/${deckId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDeleteErrors((currentErrors) => ({
          ...currentErrors,
          [deckId]: data.error || 'Unable to delete deck.',
        }));
        return;
      }

      setDeleteErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        delete nextErrors[deckId];
        return nextErrors;
      });
      fetchDecks();
    } catch (error) {
      console.error('Error deleting deck:', error);
      setDeleteErrors((currentErrors) => ({
        ...currentErrors,
        [deckId]: 'Network error. Please try again.',
      }));
    } finally {
      setDeletingDecks((currentDecks) => {
        const nextDecks = { ...currentDecks };
        delete nextDecks[deckId];
        return nextDecks;
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
          const renameValue = renameForms[deck.id] ?? deck.name;
          const renameError = renameErrors[deck.id];
          const isRenamingDeck = Boolean(renamingDecks[deck.id]);
          const deleteError = deleteErrors[deck.id];
          const isDeletingDeck = Boolean(deletingDecks[deck.id]);

          return (
            <Card key={deck.id}>
              <CardContent className="p-4">
                <h3 className="text-lg font-semibold">{deck.name}</h3>
                <p className="text-sm text-gray-500">Cards: {totalCards}</p>
                <p className="text-sm text-gray-500">Due: {dueCards}</p>
                <form className="mt-3 flex gap-2" onSubmit={(event) => renameDeck(event, deck.id, deck.name)}>
                  <Input
                    type="text"
                    value={renameValue}
                    onChange={(e) => updateRenameForm(deck.id, e.target.value)}
                    aria-label={`Rename ${deck.name}`}
                    disabled={isRenamingDeck}
                  />
                  <Button type="submit" disabled={isRenamingDeck}>
                    {isRenamingDeck ? 'Saving...' : 'Rename'}
                  </Button>
                </form>
                {renameError && (
                  <p className="mt-2 text-sm text-red-600">{renameError}</p>
                )}
                <Button className="mt-2" onClick={() => history.push(`/study?${new URLSearchParams({ deckId: deck.id })}`)}>
                  Study
                </Button>
                <Button
                  className="mt-2 ml-2 bg-red-600 hover:bg-red-700"
                  disabled={isDeletingDeck}
                  onClick={() => deleteDeck(deck.id)}
                >
                  {isDeletingDeck ? 'Deleting...' : 'Delete'}
                </Button>
                {deleteError && (
                  <p className="mt-2 text-sm text-red-600">{deleteError}</p>
                )}
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
