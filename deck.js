import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DeckManagement = () => {
  const [decks, setDecks] = useState([]);
  const [newDeckName, setNewDeckName] = useState('');

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
        {decks.map(deck => (
          <Card key={deck.id}>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold">{deck.name}</h3>
              <p className="text-sm text-gray-500">Cards: {deck.card_count || 0}</p>
              <Button className="mt-2">Study</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DeckManagement;