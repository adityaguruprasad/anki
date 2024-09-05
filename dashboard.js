import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const Dashboard = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const chartData = [
    { name: 'Today', cards: stats?.todayReviews || 0 },
    { name: 'This Week', cards: stats?.weekReviews || 0 },
    { name: 'This Month', cards: stats?.monthReviews || 0 },
  ];

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
      <Button>Start Studying</Button>
    </div>
  );
};

export default Dashboard;