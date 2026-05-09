import React, { useState, useEffect, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getDashboardApiRequests } from './dashboardApiRequests';
import { getStudyDeckTargetPath, hasDueCards, selectStudyDeckTarget } from './dashboardDeckTarget';

const Dashboard = ({ env }) => {
  const history = useHistory();
  const apiRequests = useMemo(() => getDashboardApiRequests(env), [env]);
  const [stats, setStats] = useState(null);
  const [studyDeckTarget, setStudyDeckTarget] = useState(null);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [deckLoadFailed, setDeckLoadFailed] = useState(false);

  useEffect(() => {
    let ignore = false;

    const fetchStats = async () => {
      try {
        const response = await fetch(apiRequests.statsUrl, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (!response.ok) {
          throw new Error('Unable to fetch stats');
        }
        const data = await response.json();
        if (ignore) {
          return;
        }
        setStats(data);
      } catch (error) {
        if (ignore) {
          return;
        }
        console.error('Error fetching stats:', error);
      }
    };

    const fetchDecks = async () => {
      try {
        setIsLoadingDecks(true);
        setDeckLoadFailed(false);
        const response = await fetch(apiRequests.deckListUrl, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (!response.ok) {
          throw new Error('Unable to fetch decks');
        }
        const data = await response.json();
        if (ignore) {
          return;
        }
        setStudyDeckTarget(selectStudyDeckTarget(data));
      } catch (error) {
        if (ignore) {
          return;
        }
        console.error('Error fetching decks:', error);
        setStudyDeckTarget(null);
        setDeckLoadFailed(true);
      } finally {
        if (!ignore) {
          setIsLoadingDecks(false);
        }
      }
    };

    fetchStats();
    fetchDecks();

    return () => {
      ignore = true;
    };
  }, [apiRequests]);

  const handleStartStudying = () => {
    if (isLoadingDecks) {
      return;
    }

    history.push(getStudyDeckTargetPath(studyDeckTarget));
  };

  const chartData = [
    { name: 'Today', cards: stats?.todayReviews || 0 },
    { name: 'This Week', cards: stats?.weekReviews || 0 },
    { name: 'This Month', cards: stats?.monthReviews || 0 },
  ];
  const hasDueStudyTarget = hasDueCards(studyDeckTarget);

  const studyPrompt = isLoadingDecks
    ? 'Checking deck availability...'
    : studyDeckTarget
      ? hasDueStudyTarget
        ? 'Resume with the next deck that has cards ready.'
        : 'No cards are due right now. Browse or manage your decks instead.'
      : deckLoadFailed
        ? 'Deck status could not be loaded. Manage your decks to add cards or try again.'
        : 'Add cards or create a deck before starting a study session.';
  const startButtonLabel = isLoadingDecks
    ? 'Checking Decks...'
    : studyDeckTarget
      ? hasDueStudyTarget
        ? 'Start Studying'
        : 'Browse Decks'
      : deckLoadFailed
        ? 'Manage Decks'
        : 'Add Cards or Decks';

  return (
    <div className="max-w-4xl mx-auto mt-10">
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Total Cards</h3>
            <p className="text-3xl font-bold">{stats?.totalCards || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Total Decks</h3>
            <p className="text-3xl font-bold">{stats?.totalDecks || 0}</p>
          </CardContent>
        </Card>
      </div>
      <Card className="mb-8">
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold mb-4">Review Activity</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="cards" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div>
        <p className="text-sm text-gray-600 mb-3">{studyPrompt}</p>
        <Button onClick={handleStartStudying} disabled={isLoadingDecks}>
          {startButtonLabel}
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
